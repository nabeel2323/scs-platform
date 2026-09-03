import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { eq, and, lt, sql } from 'drizzle-orm';

/**
 * Outbox Dispatcher — polls outbox_events for PENDING events and dispatches them.
 *
 * Pattern: Transactional Outbox
 * 1. Domain services write to outbox_events within the same DB transaction
 * 2. This dispatcher polls for PENDING events (every 1s in dev)
 * 3. Marks as DISPATCHED on success, FAILED on error (with retry backoff)
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
   */
  async publish(eventType: string, aggregateId: string, payload: Record<string, unknown>, metadata?: Record<string, unknown>) {
    const id = crypto.randomUUID();
    await this.db.db.insert(outboxEvents).values({
      id,
      eventType,
      aggregateId,
      payload,
      metadata: metadata || {},
      status: 'PENDING',
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
      const pending = await this.db.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, 'PENDING'))
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
          const attempts = (event['attempts'] || 0) + 1;
          const status = attempts >= 5 ? 'FAILED' : 'PENDING';

          await this.db.db
            .update(outboxEvents)
            .set({
              status,
              attempts,
              lastError: err?.message || 'Unknown error',
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
