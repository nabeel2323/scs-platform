/**
 * Auto-Complete Worker — M7.3-A
 *
 * Polls for DELIVERED orders whose auto_complete_at has passed and
 * transitions them to COMPLETED.
 *
 * Multi-instance behavior: FOR UPDATE SKIP LOCKED reduces overlapping
 * candidate selection, while OrdersService.completeOrder's conditional
 * status transition is the final concurrency guard. This is not a durable
 * lease; if a process exits before completion, the order remains eligible.
 * Idempotent: buyer confirmation racing with auto-completion is handled
 * by the optimistic lock on the order status.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, lte, isNull, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { orders } from './orders.schema';
import { shipments } from './shipment.schema';
import { OrdersService } from './orders.service';

@Injectable()
export class AutoCompleteWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoCompleteWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Poll interval: 60 seconds (configurable). */
  private readonly intervalMs: number;

  /** Maximum orders to process per cycle. */
  private static readonly BATCH_SIZE = 20;

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

  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      // Select eligible candidates without touching updated_at. SKIP LOCKED
      // reduces overlap during selection; the completion service's optimistic
      // status flip remains the authoritative cross-instance concurrency guard.
      const now = new Date();
      const selected = await this.db.db.execute(sql`
        SELECT *
        FROM orders
        WHERE status = 'DELIVERED'
          AND auto_complete_at IS NOT NULL
          AND auto_complete_at <= ${now}
          AND buyer_confirmed_at IS NULL
        ORDER BY auto_complete_at ASC
        LIMIT ${AutoCompleteWorker.BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);

      const rows = selected.rows ?? [];
      if (rows.length > 0) {
        this.logger.log(`Auto-complete: ${rows.length} order(s) eligible for completion.`);
      }

      for (const row of rows) {
        await this.processCompletion(row);
      }
    } catch (err: any) {
      this.logger.error(`Auto-complete poll error: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }

  private async processCompletion(row: any) {
    try {
      // Verify the order is still DELIVERED (may have been confirmed by buyer)
      const order = await this.db.db.query.orders.findFirst({
        where: eq(orders.id, row.id),
      });
      if (!order || order['status'] !== 'DELIVERED') return;

      // Use the canonical completion method
      await this.ordersService.completeOrder(
        row.id,
        'system',
        'SYSTEM',
        'AUTO_COMPLETION',
      );

      this.logger.log(`Auto-completed order ${row.id}`);
    } catch (err: any) {
      // ConflictException means buyer already confirmed — not an error
      if (err?.status === 409 || err?.name === 'ConflictException') {
        this.logger.debug(`Auto-complete skipped (already processed): ${row.id}`);
        return;
      }
      this.logger.error(`Auto-complete failed for ${row.id}: ${err?.message}`);
    }
  }
}
