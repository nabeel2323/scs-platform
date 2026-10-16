import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { eq, and, or, isNull, lte } from 'drizzle-orm';

/**
 * Outbox Dispatcher — polls outbox_events for PENDING events and dispatches them.
 *
 * Pattern: Transactional Outbox
 * 1. Domain services write to outbox_events within the same DB transaction
 * 2. This dispatcher polls for PENDING events (every 1s in dev)
 * 3. Marks as DISPATCHED on success, FAILED on error (with retry backoff)
 *
 * M7.2.3-A: Supports next_attempt_at for delayed retry.
 * Pending events are eligible only when:
 *   - next_attempt_at IS NULL (first attempt), OR
 *   - next_attempt_at <= NOW() (retry is due)
 *
 * In production, this would publish to an event bus (Kafka, RabbitMQ, etc.)
 * For now, it logs dispatched events and marks them as processed.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    // Start polling after a short delay to let the app bootstrap
    setTimeout(() => this.startPolling(), 5000);
    console.log('[OutboxDispatcher] Registered — will poll every 1s');
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  /**
   * Write an event to the outbox (called from domain services within a transaction).
   * M7.2.3-A: Supports optional nextAttemptAt for delayed retry.
   * M7.3-B.1: Optional txClient for atomic insertion inside a transaction.
   */
  async publish(
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    nextAttemptAt?: Date | null,
    txClient?: any,
  ) {
    const id = crypto.randomUUID();
    const db = txClient || this.db.db;
    await db.insert(outboxEvents).values({
      id,
      eventType,
      aggregateId,
      payload,
      metadata: metadata || {},
      status: 'PENDING',
      nextAttemptAt: nextAttemptAt ?? null,
    });
    return id;
  }

  private startPolling() {
    this.timer = setInterval(() => this.poll(), 1000);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      // Fetch up to 10 pending events (oldest first)
      // M7.2.3-A: Respect next_attempt_at for delayed retry
      const now = new Date();
      const pending = await this.db.db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, 'PENDING'),
            or(
              isNull(outboxEvents.nextAttemptAt),
              lte(outboxEvents.nextAttemptAt, now),
            ),
          ),
        )
        .orderBy(outboxEvents.createdAt)
        .limit(10);

      for (const event of pending) {
        try {
          await this.dispatch(event);

          // Mark as dispatched
          await this.db.db
            .update(outboxEvents)
            .set({ status: 'DISPATCHED', dispatchedAt: new Date() })
            .where(eq(outboxEvents.id, event['id']));
        } catch (err: any) {
          // Mark as failed with error
          // M7.2.3-A: Exponential backoff with jitter
          const attempts = (event['attempts'] || 0) + 1;
          const isFinal = attempts >= 5;
          const status = isFinal ? 'FAILED' : 'PENDING';

          // Backoff schedule: 30s, 2m, 10m, 1h (with ±20% jitter)
          const backoffSeconds = [0, 30, 120, 600, 3600];
          const baseSec = backoffSeconds[attempts] ?? 3600;
          const jitter = baseSec * 0.2 * (Math.random() * 2 - 1);
          const nextAttemptAt = isFinal ? null : new Date(Date.now() + (baseSec + jitter) * 1000);

          await this.db.db
            .update(outboxEvents)
            .set({
              status,
              attempts,
              lastError: err?.message || 'Unknown error',
              nextAttemptAt,
            })
            .where(eq(outboxEvents.id, event['id']));

          console.error(`[OutboxDispatcher] Failed to dispatch ${event['eventType']}:`, err?.message);
        }
      }
    } catch (err: any) {
      console.error('[OutboxDispatcher] Poll error:', err?.message);
    } finally {
      this.running = false;
    }
  }

  private async dispatch(event: any) {
    // In production: publish to event bus (Kafka, RabbitMQ, SNS, etc.)
    // For now: log the dispatch
    console.log(
      `[OutboxDispatcher] Dispatched: ${event.eventType} (aggregate: ${event.aggregateId})`,
    );
  }
}
