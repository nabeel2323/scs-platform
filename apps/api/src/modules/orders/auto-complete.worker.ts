/**
 * Auto-Complete Worker — M7.3-A
 *
 * Polls for DELIVERED orders whose auto_complete_at has passed and
 * transitions them to COMPLETED.
 *
 * Multi-instance behavior: each order is atomically claimed with a durable
 * five-minute lease. Completion is fenced by the lease owner and expiry in
 * the same transaction as the order transition and its durable side effects.
 * Expired claims can be reclaimed after a process crash.
 * Idempotent: buyer confirmation racing with auto-completion is handled
 * by the optimistic lock on the order status.
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

  /** Maximum orders to process per cycle. */
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

  /** Atomically claim one due order with a persisted, crash-recoverable lease. */
  private async claimNextOrder(): Promise<any | null> {
    const result = await this.db.db.execute(sql`
      WITH candidate AS (
        SELECT id FROM orders
        WHERE status = 'DELIVERED'
          AND auto_complete_at IS NOT NULL
          AND auto_complete_at <= NOW()
          AND buyer_confirmed_at IS NULL
          AND (auto_complete_claimed_at IS NULL OR auto_complete_claimed_at <= NOW() - (${AutoCompleteWorker.CLAIM_LEASE_MINUTES} * INTERVAL '1 minute'))
        ORDER BY auto_complete_at ASC, id ASC
        LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE orders AS target
      SET auto_complete_claimed_at = NOW(), auto_complete_claimed_by = ${this.workerId}
      FROM candidate WHERE target.id = candidate.id
      RETURNING target.*
    `);
    return result.rows?.[0] ?? null;
  }

  /** Release only this worker's claim; never clear a claim reassigned elsewhere. */
  private async releaseClaim(orderId: string): Promise<void> {
    await this.db.db.execute(sql`
      UPDATE orders SET auto_complete_claimed_at = NULL, auto_complete_claimed_by = NULL
      WHERE id = ${orderId} AND auto_complete_claimed_by = ${this.workerId}
    `);
  }

  private async poll() {
    if (this.running) return;
    this.running = true;
    try {
      let claimed = 0;
      while (claimed < AutoCompleteWorker.BATCH_SIZE) {
        const row = await this.claimNextOrder();
        if (!row) break;
        claimed += 1;
        await this.processCompletion(row);
      }
      if (claimed > 0) this.logger.log(`Auto-complete: claimed ${claimed} order(s) for processing.`);
    } catch (err: any) {
      this.logger.error(`Auto-complete poll error: ${err?.message}`);
    } finally { this.running = false; }
  }

  private async processCompletion(row: any) {
    try {
      await this.ordersService.completeOrder(row.id, 'system', 'SYSTEM', 'AUTO_COMPLETION', this.workerId);
      this.logger.log(`Auto-completed order ${row.id}`);
    } catch (err: any) {
      if (err?.status === 409 || err?.name === 'ConflictException') this.logger.debug(`Auto-complete skipped (status changed or claim lost): ${row.id}`);
      else this.logger.error(`Auto-complete failed for ${row.id}: ${err?.message}`);
    } finally {
      try { await this.releaseClaim(row.id); }
      catch (releaseError: any) { this.logger.error(`Auto-complete claim release failed for ${row.id}: ${releaseError?.message}`); }
    }
  }

}
