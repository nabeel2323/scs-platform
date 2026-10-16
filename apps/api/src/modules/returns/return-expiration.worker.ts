/**
 * P13 Return Expiration Worker
 *
 * Polls for REQUESTED returns whose merchant SLA (expires_at) has passed and
 * transitions them to ESCALATED for admin review.
 *
 * P13 Phase 2: Changed from EXPIRED (terminal) to ESCALATED (non-terminal) so
 * that an administrator can explicitly resolve the request instead of it being
 * silently expired.
 *
 * P13 Phase 4 — operational hardening:
 *
 *   1. Opt-in. `P13_WORKER_ENABLED` must be truthy or this worker never polls.
 *      Disabled instances keep serving requests (the HTTP surface does not
 *      depend on it), and they never touch the lease.
 *   2. Exclusive. Protected work runs only while this instance holds the
 *      `p13-return-expiration` lease row, at a specific `epoch`.
 *   3. Fenced. Every cycle renews the lease with a holder+epoch-conditional
 *      UPDATE. If that updates zero rows, ownership was lost — the cycle is
 *      abandoned before any state is read, so a stale worker cannot modify
 *      financial state.
 *   4. Pausable. The durable `p13.worker.paused` control is checked before the
 *      batch and again before each individual return. Each escalation is its
 *      own transaction, so pausing mid-batch leaves every already-processed
 *      return complete and every remaining one untouched.
 *   5. Observable. Heartbeat, epoch, consecutive-failure count and last cycle
 *      summary live on the lease row; failures surface as ops alerts.
 *
 * The FOR UPDATE SKIP LOCKED claim is retained as defence in depth: it makes a
 * duplicate financial mutation impossible even if the lease layer were somehow
 * bypassed.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { OpsAlertService } from '../operations/ops-alert.service';
import { OpsControlService } from '../operations/ops-control.service';
import { WorkerLeaseService } from '../operations/worker-lease.service';
import { P13_LEASE_KEY, resolveP13OpsConfig, type P13OpsConfig } from '../operations/p13-ops.config';
import { readRows } from '../operations/raw-result';
import { ReturnsService } from './returns.service';
import { returnRequests } from './returns.schema';

export type WorkerLifecycleState =
  /** P13_WORKER_ENABLED not set — this instance will never run protected jobs. */
  | 'DISABLED'
  /** Enabled, but another holder owns the lease or acquisition is failing. */
  | 'STANDBY'
  /** Enabled and holding the lease; cycles may run. */
  | 'HELD'
  /** Holding the lease but the pause control is engaged. */
  | 'HELD_PAUSED'
  /** Shutting down. */
  | 'STOPPED';

export interface WorkerCycleReport {
  state: WorkerLifecycleState;
  /** True when this cycle was allowed to read and mutate return state. */
  executed: boolean;
  /** Why the cycle did not execute, when it did not. */
  skipped?: 'paused' | 'not_owner' | 'acquisition_failed' | 'fence_lost' | 'disabled' | 'shutdown';
  acquired?: boolean;
  epoch?: number;
  claimed?: number;
  escalated?: number;
  failed?: number;
}

@Injectable()
export class ReturnExpirationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReturnExpirationWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private epoch = 0;
  private lastRunAt = 0;

  /** Public for observability and for specs; never trust it as an authorization input. */
  state: WorkerLifecycleState = 'DISABLED';

  /** Maximum returns to process per cycle. */
  private static readonly BATCH_SIZE = 10;

  /**
   * Operational tuning. Public and mutable so a development spec can drive a
   * short lease TTL without adding a non-injectable constructor parameter to a
   * Nest provider. Never read as an authorization input.
   */
  readonly config: P13OpsConfig;

  constructor(
    private readonly db: DatabaseService,
    private readonly returnsService: ReturnsService,
    private readonly leases: WorkerLeaseService,
    private readonly controls: OpsControlService,
    private readonly alerts: OpsAlertService,
  ) {
    this.config = resolveP13OpsConfig();
  }

  onModuleInit(): void {
    if (!this.config.workerEnabled) {
      this.state = 'DISABLED';
      this.logger.log(
        'ReturnExpirationWorker disabled (P13_WORKER_ENABLED not set) — no protected P13 jobs will run from this instance.',
      );
      return;
    }

    // Start polling after the boot delay so app initialisation is not competing
    // with the first cycle. `tick()` is safe to call concurrently — see `busy`.
    setTimeout(() => this.startTicking(), this.config.startupDelayMs ?? 45_000);
    this.state = 'STANDBY';
    this.logger.log(
      `ReturnExpirationWorker enabled — heartbeat every ${this.config.heartbeatIntervalMs}ms, ` +
        `poll cadence ${this.config.pollIntervalMs}ms, lease TTL ${this.config.leaseTtlSeconds}s.`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.stopTicking();
    if (this.state === 'HELD' || this.state === 'HELD_PAUSED') {
      // Voluntary release lets a standby take over immediately on restart.
      // Awaited (not fire-and-forget) because the process is exiting: a floating
      // promise can be cut off before the UPDATE reaches the database, which would
      // strand the lease until its TTL expires. Bounded by a timeout so an
      // unreachable database cannot hang shutdown — the TTL still covers takeover.
      const release = this.leases.release(this.epoch, P13_LEASE_KEY).catch(() => undefined);
      let guardTimer: NodeJS.Timeout | undefined;
      const guard = new Promise<void>((resolve) => {
        guardTimer = setTimeout(resolve, 5_000);
        guardTimer.unref();
      });
      await Promise.race([release, guard]);
      clearTimeout(guardTimer);
    }
    this.state = 'STOPPED';
  }

  private startTicking(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runQuietly(), this.config.heartbeatIntervalMs);
  }

  private stopTicking(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runQuietly(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Worker tick threw: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
    }
  }

  // ── Cycle ─────────────────────────────────────────────────────────────────

  /**
   * One ownership + (maybe) work cycle. Public so specs and an operator-triggered
   * run can drive it deterministically without waiting on timers.
   */
  async tick(): Promise<WorkerCycleReport> {
    if (this.state === 'DISABLED' || this.state === 'STOPPED') {
      return { state: this.state, executed: false, skipped: 'disabled' };
    }

    // 1. Establish or verify ownership.
    if (this.epoch === 0) {
      const acquired = await this.leases.tryAcquire(P13_LEASE_KEY);
      if (!acquired.acquired) {
        await this.handleAcquisitionFailure(acquired);
        return {
          state: 'STANDBY',
          executed: false,
          skipped: 'acquisition_failed',
          acquired: false,
        };
      }
      this.epoch = acquired.epoch;
      this.state = 'HELD';
      this.logger.log(`Lease acquired at epoch ${this.epoch} by ${acquired.holderId}`);
    } else {
      const stillOurs = await this.leases.renewAndFence(this.epoch, P13_LEASE_KEY);
      if (!stillOurs) {
        const lostEpoch = this.epoch;
        this.epoch = 0;
        this.state = 'STANDBY';
        await this.alerts.raise({
          conditionKey: 'p13.worker.ownership_lost',
          severity: 'WARN',
          title: `Worker lost the ${P13_LEASE_KEY} lease at epoch ${lostEpoch}`,
          detail: { leaseKey: P13_LEASE_KEY, lostEpoch, holderId: this.leases.holderId },
          resourceType: 'worker_lease',
          // Deduped per job key: `ops_alerts.resource_id` is a UUID, so the lease
          // key has to be carried in the dedup identity explicitly.
          dedupKey: `p13.worker.ownership_lost:${P13_LEASE_KEY}`,
        });
        return { state: 'STANDBY', executed: false, skipped: 'fence_lost', epoch: lostEpoch };
      }
    }

    // 2. Pause control — checked before any read of business state.
    let paused = false;
    try {
      paused = await this.controls.isPaused();
    } catch (err) {
      // Fail closed: an unreadable control is treated as paused, and the cycle
      // is recorded as a failure so alert 1 can fire.
      await this.leases.recordPollFailure(this.epoch, 'CONTROL_UNREADABLE', P13_LEASE_KEY);
      this.logger.error(`Pause control unreadable — skipping cycle: ${errMessage(err)}`);
      return { state: this.state, executed: false, skipped: 'paused', epoch: this.epoch };
    }

    this.state = paused ? 'HELD_PAUSED' : 'HELD';
    if (paused) {
      return { state: this.state, executed: false, skipped: 'paused', epoch: this.epoch };
    }

    // 3. Cadence: heartbeats renew every tick; the batch runs at pollIntervalMs.
    const now = Date.now();
    if (now - this.lastRunAt < this.config.pollIntervalMs) {
      return { state: this.state, executed: false, epoch: this.epoch };
    }
    this.lastRunAt = now;

    // `acquired` is reported on the success path too, so a caller (or the ops
    // status endpoint) can distinguish "this instance owns the lease and ran"
    // from "another holder is running it" without reading the lease row.
    const batch = await this.runBatch();
    return { ...batch, acquired: true };
  }

  /** The protected work itself. Only ever called while holding a live fence. */
  async runBatch(): Promise<WorkerCycleReport> {
    const epoch = this.epoch;

    // Fence BEFORE anything is read or written. `runBatch()` is public (an
    // operator can trigger a cycle, and specs drive it directly), so it cannot
    // assume the caller just renewed: the claim statement below writes
    // `return_requests.updated_at`, and a partitioned worker must not be able to
    // write even that.
    if (!(await this.leases.renewAndFence(epoch, P13_LEASE_KEY))) {
      this.epoch = 0;
      this.state = 'STANDBY';
      await this.alerts.raise({
        conditionKey: 'p13.worker.ownership_lost',
        severity: 'WARN',
        title: `Worker lost the ${P13_LEASE_KEY} lease at epoch ${epoch}`,
        detail: { leaseKey: P13_LEASE_KEY, lostEpoch: epoch, holderId: this.leases.holderId, stage: 'batch_start' },
        dedupKey: `p13.worker.ownership_lost:${P13_LEASE_KEY}`,
        resourceType: 'worker_lease',
      });
      return { state: this.state, executed: false, skipped: 'fence_lost', epoch };
    }

    let claimedRows: Array<{ id: string }>;

    try {
      const claimed = await this.db.db.execute(sql`
        UPDATE return_requests
        SET updated_at = NOW()
        WHERE id IN (
          SELECT id FROM return_requests
          WHERE status = 'REQUESTED'
            AND expires_at IS NOT NULL
            AND expires_at <= NOW()
          ORDER BY expires_at ASC
          LIMIT ${ReturnExpirationWorker.BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id
      `);
      claimedRows = readRows<{ id: string }>(claimed);
    } catch (err) {
      const failures = await this.leases.recordPollFailure(epoch, errCode(err), P13_LEASE_KEY);
      await this.alertOnFailures(epoch, failures, errMessage(err));
      this.logger.error(`Return expiration poll error: ${errMessage(err)}`);
      return { state: this.state, executed: false, skipped: 'acquisition_failed', epoch };
    }

    if (claimedRows.length > 0) {
      this.logger.log(`Return expiration: ${claimedRows.length} return(s) past merchant SLA.`);
    }

    let escalated = 0;
    let failed = 0;

    for (const row of claimedRows) {
      if (!row) continue;

      // Re-verify fence AND pause before every individual mutation, so a pause
      // or a takeover lands between items rather than only between batches.
      if (!(await this.leases.renewAndFence(epoch, P13_LEASE_KEY))) {
        this.epoch = 0;
        this.state = 'STANDBY';
        this.logger.warn(
          `Fence lost mid-batch at epoch ${epoch}; stopping with ${remaining(claimedRows, escalated, failed)} item(s) unprocessed.`,
        );
        return { state: this.state, executed: true, skipped: 'fence_lost', epoch, escalated, failed };
      }
      if (await this.controls.isPaused()) {
        this.state = 'HELD_PAUSED';
        return { state: this.state, executed: true, skipped: 'paused', epoch, escalated, failed };
      }

      const outcome = await this.processExpiration(row.id, epoch);
      if (outcome === 'escalated') escalated += 1;
      else if (outcome === 'failed') failed += 1;
    }

    if (failed > 0) {
      const failures = await this.leases.recordPollFailure(epoch, 'ITEM_FAILURE', P13_LEASE_KEY);
      await this.alertOnFailures(epoch, failures, `${failed} return(s) failed to escalate`);
    } else {
      await this.leases.recordPollSuccess(
        epoch,
        `claimed=${claimedRows.length} escalated=${escalated}`,
        P13_LEASE_KEY,
      );
    }

    return {
      state: this.state,
      executed: true,
      epoch,
      claimed: claimedRows.length,
      escalated,
      failed,
    };
  }

  private async processExpiration(
    returnId: string,
    epoch: number,
  ): Promise<'escalated' | 'skipped' | 'failed'> {
    try {
      // Verify the return is still REQUESTED (may have been approved by merchant).
      const ret = await this.db.db.query.returnRequests.findFirst({
        where: and(eq(returnRequests.id, returnId), eq(returnRequests.status, 'REQUESTED')),
        columns: { id: true, status: true },
      });
      if (!ret) return 'skipped';

      // Phase 2: escalate to admin review instead of terminal expiry. This never
      // approves, rejects, refunds, or expires a return on SLA elapse alone.
      await this.returnsService.escalateReturn(ret.id);
      this.logger.log(`Escalated return ${ret.id} to admin review (merchant SLA exceeded)`);
      return 'escalated';
    } catch (err: any) {
      // ConflictException means already transitioned — not an error.
      if (err?.status === 409 || err?.name === 'ConflictException') {
        this.logger.debug(`Return escalation skipped (already processed): ${returnId}`);
        return 'skipped';
      }
      this.logger.error(`Return escalation failed for ${returnId}: ${errMessage(err)}`);
      void epoch;
      return 'failed';
    }
  }

  // ── Ownership failure handling ────────────────────────────────────────────

  private async handleAcquisitionFailure(acquired: {
    reason?: string;
    error?: string;
  }): Promise<void> {
    if (acquired.reason === 'HELD_BY_OTHER') {
      // Expected steady state for a standby replica. Not a failure: the job IS
      // being run, just not here.
      this.state = 'STANDBY';
      return;
    }

    // DB_ERROR / ROW_MISSING: exclusivity could not be established at all.
    this.state = 'STANDBY';
    const failures = await this.leases
      .recordPollFailure(this.epoch, acquired.reason ?? 'ACQUIRE_FAILED', P13_LEASE_KEY)
      .catch(() => null);
    await this.alertOnFailures(this.epoch, failures, acquired.error ?? acquired.reason ?? 'unknown');
  }

  /** Alert 1: three consecutive worker polling failures. */
  private async alertOnFailures(
    epoch: number,
    failures: number | null,
    detail: string,
  ): Promise<void> {
    const threshold = this.config.thresholds.pollFailureAlertCount;
    if (failures === null || failures < threshold) return;
    await this.alerts.raise({
      conditionKey: 'p13.worker.poll_failures',
      severity: 'CRITICAL',
      title: `P13 worker failed ${failures} consecutive polls (threshold ${threshold})`,
      detail: { leaseKey: P13_LEASE_KEY, pollFailures: failures, epoch, lastError: detail.slice(0, 200) },
      resourceType: 'worker_lease',
      // Identical key to the monitor's check 1, so the two paths cannot open
      // two incidents for one condition.
      dedupKey: `p13.worker.poll_failures:${P13_LEASE_KEY}`,
    });
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errCode(err: unknown): string {
  const code = (err as { code?: string })?.code;
  return (code ?? errMessage(err)).slice(0, 60);
}

function remaining(ids: Array<{ id: string }>, done: number, skippedFailed: number): number {
  return Math.max(0, ids.length - done - skippedFailed);
}
