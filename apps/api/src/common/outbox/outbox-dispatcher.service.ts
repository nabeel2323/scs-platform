import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

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
  private readonly workerId = crypto.randomUUID();

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
      // Claim rows atomically across API instances. A five-minute lease allows
      // another worker to recover an event if this process exits mid-dispatch.
      const pending = await this.db.db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          WITH candidates AS (
            SELECT id
            FROM outbox_events
            WHERE status = 'PENDING'
              AND event_type NOT LIKE 'shipping.carrier.%'
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
              AND (locked_at IS NULL OR locked_at < now() - INTERVAL '5 minutes')
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 10
          )
          UPDATE outbox_events AS event
          SET locked_at = now(), locked_by = ${this.workerId}
          FROM candidates
          WHERE event.id = candidates.id
          RETURNING
            event.id,
            event.event_type AS "eventType",
            event.aggregate_id AS "aggregateId",
            event.payload,
            event.metadata,
            event.attempts
        `);
        return (result as any).rows as any[];
      });

      for (const event of pending) {
        try {
          await this.dispatch(event);
          await this.db.db
            .update(outboxEvents)
            .set({
              status: 'DISPATCHED',
              dispatchedAt: new Date(),
              lockedAt: null,
              lockedBy: null,
            })
            .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.lockedBy, this.workerId)));
        } catch (err: any) {
          const attempts = (event.attempts || 0) + 1;
          const isFinal = attempts >= 5;
          const status = isFinal ? 'FAILED' : 'PENDING';
          const backoffSeconds = [0, 30, 120, 600, 3600];
          const baseSec = backoffSeconds[attempts] ?? 3600;
          const jitter = baseSec * 0.2 * (Math.random() * 2 - 1);
          const nextAttemptAt = isFinal ? null : new Date(Date.now() + (baseSec + jitter) * 1000);

          // Only the current lease owner may change retry state. If the lease
          // expired and another worker reclaimed it, this update is a no-op.
          await this.db.db
            .update(outboxEvents)
            .set({
              status,
              attempts,
              lastError: err?.message || 'Unknown error',
              nextAttemptAt,
              lockedAt: null,
              lockedBy: null,
            })
            .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.lockedBy, this.workerId)));
          console.error(`[OutboxDispatcher] Failed to dispatch ${event.eventType}:`, err?.message);
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
