/**
 * P13 Return Expiration Worker
 *
 * Polls for REQUESTED returns whose merchant SLA (expires_at) has passed
 * and transitions them to EXPIRED.
 *
 * Multi-instance safe: uses FOR UPDATE SKIP LOCKED for atomic claiming.
 * Crash-safe: if the worker dies between claim and expiration, the row
 * is released and re-claimed by the next cycle.
 * Idempotent: concurrent expiration attempts are handled by the
 * optimistic status guard.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ReturnsService } from './returns.service';
import { returnRequests } from './returns.schema';

@Injectable()
export class ReturnExpirationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReturnExpirationWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Poll interval: 120 seconds (configurable). */
  private readonly intervalMs: number;

  /** Maximum returns to process per cycle. */
  private static readonly BATCH_SIZE = 10;

  constructor(
    private readonly db: DatabaseService,
    private readonly returnsService: ReturnsService,
  ) {
    this.intervalMs = parseInt(
      process.env['RETURN_EXPIRATION_POLL_INTERVAL_MS'] || '120000', 10,
    );
  }

  onModuleInit() {
    // Delay initial start 45s to avoid competing with app boot
    setTimeout(() => this.startPolling(), 45_000);
    this.logger.log(
      `ReturnExpirationWorker registered — polling every ${this.intervalMs}ms.`,
    );
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
      const now = new Date();
      // Atomically claim expired REQUESTED returns
      const claimed = await this.db.db.execute(sql`
        UPDATE return_requests
        SET updated_at = NOW()
        WHERE id IN (
          SELECT id FROM return_requests
          WHERE status = 'REQUESTED'
            AND expires_at IS NOT NULL
            AND expires_at <= ${now}
          ORDER BY expires_at ASC
          LIMIT ${ReturnExpirationWorker.BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id
      `);

      const rows: Array<{ id: string }> = (claimed as any).rows ?? [];
      if (rows.length > 0) {
        this.logger.log(`Return expiration: ${rows.length} return(s) past merchant SLA.`);
      }

      for (const row of rows) {
        await this.processExpiration(row.id);
      }
    } catch (err: any) {
      this.logger.error(`Return expiration poll error: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }

  private async processExpiration(returnId: string) {
    try {
      // Verify the return is still REQUESTED (may have been approved by merchant)
      const ret = await this.db.db.query.returnRequests.findFirst({
        where: and(
          eq(returnRequests.id, returnId),
          eq(returnRequests.status, 'REQUESTED'),
        ),
        columns: { id: true, status: true },
      });
      if (!ret) return;

      // Use the service transition with a SYSTEM privileged caller
      const systemCaller = { sub: 'system', role: 'SYSTEM' as const };
      await this.returnsService.transitionReturn(ret.id, 'EXPIRED', systemCaller);
      this.logger.log(`Expired return ${ret.id} (merchant SLA exceeded)`);
    } catch (err: any) {
      // ConflictException means already transitioned — not an error
      if (err?.status === 409 || err?.name === 'ConflictException') {
        this.logger.debug(`Return expiration skipped (already processed): ${returnId}`);
        return;
      }
      this.logger.error(`Return expiration failed for ${returnId}: ${err?.message}`);
    }
  }
}
