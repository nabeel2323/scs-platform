/**
 * Auto-Complete Worker — M7.3-A
 *
 * Claims due DELIVERED orders with a durable five-minute lease and completes
 * them through the canonical OrdersService transition.
 *
 * Multi-instance safe: claims are persisted atomically using
 * FOR UPDATE SKIP LOCKED. A lease can be recovered after a process crash.
 * Fenced: OrdersService verifies the claim owner and lease expiry in the
 * same atomic status update, so an expired worker cannot complete an order
 * after another worker has reclaimed it.
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { OrdersService } from './orders.service';

@Injectable()
export class AutoCompleteWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoCompleteWorker.name);
  private readonly workerId = `auto-complete-${randomUUID()}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Poll interval: 60 seconds (configurable). */
  private readonly intervalMs: number;
  private static readonly BATCH_SIZE = 20;
  private static readonly CLAIM_LEASE_MINUTES = 5;

  constructor(
    private readonly db: DatabaseService,
    private readonly ordersService: OrdersService,
  ) {
    this.intervalMs = parseInt(process.env['AUTO_COMPLETE_POLL_INTERVAL_MS'] || '60000', 10);
  }

  onModuleInit() {
    setTimeout(() => this.startPolling(), 30_000);
    this.logger.log(`AutoCompleteWorker registered — polling every ${this.intervalMs}ms.`);
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private startPolling() {
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async claimNextOrder(): Promise<any | null> {
    const result = await this.db.db.execute(sql`
      WITH candidate AS (
        SELECT id
        FROM orders
        WHERE status = 'DELIVERED'
          AND auto_complete_at IS NOT NULL
          AND auto_complete_at <= NOW()
          AND buyer_confirmed_at IS NULL
          AND (
            auto_complete_claimed_at IS NULL
            OR auto_complete_claimed_at <= NOW() - INTERVAL '5 minutes'
          )
        ORDER BY auto_complete_at ASC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE orders AS target
      SET auto_complete_claimed_at = NOW(),
          auto_complete_claimed_by = ${this.workerId},
          updated_at = NOW()
      FROM candidate
      WHERE target.id = candidate.id
      RETURNING target.*
    `);

    return result.rows?.[0] ?? null;
  }

  private async releaseClaim(orderId: string) {
    // Conditional release cannot clear a claim that has since been reassigned.
    await this.db.db.execute(sql`
      UPDATE orders
      SET auto_complete_claimed_at = NULL,
          auto_complete_claimed_by = NULL,
          updated_at = NOW()
      WHERE id = ${orderId}
        AND auto_complete_claimed_by = ${this.workerId}
    `);
  }

  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      let processed = 0;
      while (processed < AutoCompleteWorker.BATCH_SIZE) {
        const row = await this.claimNextOrder();
        if (!row) break;
        processed += 1;
        await this.processCompletion(row);
      }

      if (processed > 0) {
        this.logger.log(`Auto-complete: processed ${processed} claimed order(s).`);
      }
    } catch (err: any) {
      this.logger.error(`Auto-complete poll error: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }

  private async processCompletion(row: any) {
    try {
      await this.ordersService.completeOrder(
        row.id,
        'system',
        'SYSTEM',
        'AUTO_COMPLETION',
        this.workerId,
      );
      this.logger.log(`Auto-completed order ${row.id}`);
    } catch (err: any) {
      if (err?.status === 409 || err?.name === 'ConflictException') {
        this.logger.debug(`Auto-complete skipped (status changed or claim lost): ${row.id}`);
      } else {
        this.logger.error(`Auto-complete failed for ${row.id}: ${err?.message}`);
      }
    } finally {
      try {
        await this.releaseClaim(row.id);
      } catch (releaseError: any) {
        this.logger.error(`Auto-complete claim release failed for ${row.id}: ${releaseError?.message}`);
      }
    }
  }
}
