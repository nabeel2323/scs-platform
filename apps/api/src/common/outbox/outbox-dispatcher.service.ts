import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { outboxEvents } from '../../modules/audit/audit.schema';

/**
 * Transactional outbox writer.
 *
 * Domain services persist events in the same transaction as their state
 * changes. There is currently no generic delivery adapter for non-carrier
 * events, so this provider deliberately does not poll or mark rows DISPATCHED.
 * Carrier events are owned by ShippingCarrierWorker.
 *
 * Keep events PENDING until a real publisher with explicit event ownership,
 * acknowledgement and retry semantics is registered. Logging an event is not
 * delivery and must never be treated as successful dispatch.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(private readonly db: DatabaseService) {}

  onModuleInit(): void {
    this.logger.warn(
      'Automatic outbox polling is disabled: no generic delivery adapter is configured. Outbox events remain PENDING.',
    );
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
}
