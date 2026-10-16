/**
 * P13 Phase 4 — Worker exclusivity lease.
 *
 * Why a database lease and not a Postgres advisory lock
 * ─────────────────────────────────────────────────────
 * `pg_advisory_lock` would also give mutual exclusion, but it is invisible: it
 * lives in session state, exposes no heartbeat, cannot carry a fencing token,
 * and silently disappears when the connection is recycled by the pool. A lease
 * row is (a) observable with one SELECT, (b) renewable, (c) carries a monotonic
 * `epoch` that lets a partitioned worker prove — before it writes anything —
 * that it no longer owns the job, and (d) expires on its own after a crash, so
 * ownership recovers without an operator.
 *
 * Acquisition is a single conditional UPDATE; Postgres row locking makes the
 * read-of-expiry and the write-of-ownership atomic, so two workers racing on an
 * expired lease can never both succeed.
 */

import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { P13_LEASE_KEY, resolveP13OpsConfig, type P13OpsConfig } from './p13-ops.config';
import { readRows, toDate, toNumber } from './raw-result';

export interface LeaseAcquireResult {
  acquired: boolean;
  /** Fencing token to use for every subsequent fenced write. 0 when not acquired. */
  epoch: number;
  holderId: string;
  /** Present when acquisition failed for a diagnosable reason. */
  reason?: 'HELD_BY_OTHER' | 'ROW_MISSING' | 'DB_ERROR';
  error?: string;
}

/** Shape returned by the raw (non-Drizzle) lease SELECTs. */
interface RawLeaseRow {
  lease_key: string;
  holder_id: string | null;
  holder_host: string | null;
  holder_pid: number | null;
  epoch: string | number;
  acquired_at: unknown;
  heartbeat_at: unknown;
  expires_at: unknown;
  poll_failures: number | null;
  last_error_code: string | null;
  last_job_at: unknown;
  last_job_summary: string | null;
}

export interface LeaseRecord {
  leaseKey: string;
  holderId: string | null;
  holderHost: string | null;
  holderPid: number | null;
  epoch: number;
  acquiredAt: Date | null;
  heartbeatAt: Date | null;
  expiresAt: Date | null;
  pollFailures: number;
  lastErrorCode: string | null;
  lastJobAt: Date | null;
  lastJobSummary: string | null;
}

@Injectable()
export class WorkerLeaseService {
  private readonly logger = new Logger(WorkerLeaseService.name);

  /** Stable identity for this process lifetime — changes on every restart. */
  readonly holderId: string;

  readonly config: P13OpsConfig;

  constructor(private readonly db: DatabaseService) {
    this.config = resolveP13OpsConfig();
    this.holderId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Ensure the lease row exists so acquisition is always an UPDATE. Safe to call
   * repeatedly and from several processes at once.
   */
  async ensureLeaseRow(leaseKey: string = P13_LEASE_KEY): Promise<void> {
    await this.db.db.execute(sql`
      INSERT INTO worker_leases (lease_key)
      VALUES (${leaseKey})
      ON CONFLICT (lease_key) DO NOTHING
    `);
  }

  /**
   * Try to become the owner of `leaseKey`.
   *
   * Succeeds only when the lease is unheld, expired (previous holder crashed or
   * stopped heartbeating), or already ours. Otherwise returns HELD_BY_OTHER and
   * the caller must stay in standby — it must never run the protected job.
   */
  async tryAcquire(
    leaseKey: string = P13_LEASE_KEY,
  ): Promise<LeaseAcquireResult> {
    try {
      await this.ensureLeaseRow(leaseKey);

      const result = await this.db.db.execute(sql`
        UPDATE worker_leases
        SET holder_id     = ${this.holderId},
            holder_host   = ${hostname()},
            holder_pid    = ${process.pid},
            epoch         = epoch + 1,
            acquired_at   = now(),
            heartbeat_at  = now(),
            expires_at    = now() + make_interval(secs => ${this.config.leaseTtlSeconds}),
            poll_failures = 0,
            last_error_code = NULL,
            updated_at    = now()
        WHERE lease_key = ${leaseKey}
          AND (holder_id IS NULL
               OR expires_at IS NULL
               OR expires_at <= now()
               OR holder_id = ${this.holderId})
        RETURNING epoch
      `);

      const rows = readRows<{ epoch: number | string }>(result);
      const first = rows[0];

      if (!first) {
        return { acquired: false, epoch: 0, holderId: this.holderId, reason: 'HELD_BY_OTHER' };
      }

      return { acquired: true, epoch: toNumber(first.epoch, 0), holderId: this.holderId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lease acquisition failed for ${leaseKey}: ${message}`);
      return {
        acquired: false,
        epoch: 0,
        holderId: this.holderId,
        reason: 'DB_ERROR',
        error: message,
      };
    }
  }

  /**
   * Renew the lease AND verify we still own this exact epoch.
   *
   * Returns false when ownership is lost (taken over, released, or the row was
   * reset). Callers MUST treat false as "stop modifying state immediately".
   */
  async renewAndFence(
    epoch: number,
    leaseKey: string = P13_LEASE_KEY,
  ): Promise<boolean> {
    if (!Number.isFinite(epoch) || epoch <= 0) return false;
    const result = await this.db.db.execute(sql`
      UPDATE worker_leases
      SET heartbeat_at = now(),
          expires_at   = now() + make_interval(secs => ${this.config.leaseTtlSeconds}),
          updated_at   = now()
      WHERE lease_key = ${leaseKey}
        AND holder_id = ${this.holderId}
        AND epoch     = ${epoch}
      RETURNING lease_key
    `);
    return readRows<{ lease_key: string }>(result).length > 0;
  }

  /** Heartbeat without a fencing check — used by read-only observability paths. */
  async isLiveHolder(epoch: number, leaseKey: string = P13_LEASE_KEY): Promise<boolean> {
    const record = await this.read(leaseKey);
    return !!record && record.holderId === this.holderId && record.epoch === epoch;
  }

  /**
   * Record a successful cycle: resets the consecutive-failure counter that
   * alert 1 reads and stores a short non-sensitive summary of the work done.
   */
  async recordPollSuccess(
    epoch: number,
    summary: string,
    leaseKey: string = P13_LEASE_KEY,
  ): Promise<void> {
    await this.db.db.execute(sql`
      UPDATE worker_leases
      SET poll_failures    = 0,
          last_error_code  = NULL,
          last_job_at      = now(),
          last_job_summary = ${summary.slice(0, 300)},
          updated_at       = now()
      WHERE lease_key = ${leaseKey}
        AND holder_id = ${this.holderId}
        AND epoch     = ${epoch}
    `);
  }

  /**
   * Record a failed cycle. Fenced to the owning epoch so a stale worker cannot
   * inflate (or clear) the failure counter of the current owner.
   * Returns the new consecutive-failure count, or null when the write was fenced off.
   */
  async recordPollFailure(
    epoch: number,
    errorCode: string,
    leaseKey: string = P13_LEASE_KEY,
  ): Promise<number | null> {
    const result = await this.db.db.execute(sql`
      UPDATE worker_leases
      SET poll_failures   = poll_failures + 1,
          last_error_code = ${errorCode.slice(0, 60)},
          updated_at      = now()
      WHERE lease_key = ${leaseKey}
        AND holder_id = ${this.holderId}
        AND epoch     = ${epoch}
      RETURNING poll_failures
    `);
    const rows = readRows<{ poll_failures: number }>(result);
    const first = rows[0];
    return !first ? null : toNumber(first.poll_failures, 0);
  }

  /**
   * Voluntarily give up ownership (shutdown, or a deliberate handover test).
   * Fenced: a stale worker cannot release the current owner's lease.
   */
  async release(epoch: number, leaseKey: string = P13_LEASE_KEY): Promise<boolean> {
    const result = await this.db.db.execute(sql`
      UPDATE worker_leases
      SET holder_id   = NULL,
          holder_host = NULL,
          holder_pid  = NULL,
          heartbeat_at = NULL,
          expires_at  = NULL,
          updated_at  = now()
      WHERE lease_key = ${leaseKey}
        AND holder_id = ${this.holderId}
        AND epoch     = ${epoch}
      RETURNING lease_key
    `);
    return readRows<{ lease_key: string }>(result).length > 0;
  }

  /** Read a lease row — the observability primitive. */
  async read(leaseKey: string = P13_LEASE_KEY): Promise<LeaseRecord | null> {
    const rows = readRows<RawLeaseRow>(await this.db.db.execute(sql`
      SELECT lease_key, holder_id, holder_host, holder_pid, epoch,
             acquired_at, heartbeat_at, expires_at,
             poll_failures, last_error_code, last_job_at, last_job_summary
      FROM worker_leases
      WHERE lease_key = ${leaseKey}
    `));
    const first = rows[0];
    return first ? mapLeaseRow(first) : null;
  }

  /** Every lease — powers the "zero or multiple live holders" alert. */
  async readAll(): Promise<LeaseRecord[]> {
    const rows = readRows<RawLeaseRow>(await this.db.db.execute(sql`
      SELECT lease_key, holder_id, holder_host, holder_pid, epoch,
             acquired_at, heartbeat_at, expires_at,
             poll_failures, last_error_code, last_job_at, last_job_summary
      FROM worker_leases
      ORDER BY lease_key
    `));
    return rows.map(mapLeaseRow);
  }

  /**
   * Distinct holders whose lease has not expired, per job key.
   * More than one means exclusivity is broken; zero means nothing is processing.
   */
  async liveHolderCounts(): Promise<Array<{ leaseKey: string; liveHolders: number }>> {
    const rows = readRows<{ lease_key: string; live_holders: number }>(
      await this.db.db.execute(sql`
        SELECT lease_key, COUNT(DISTINCT holder_id)::int AS live_holders
        FROM worker_leases
        WHERE holder_id IS NOT NULL
          AND expires_at IS NOT NULL
          AND expires_at > now()
        GROUP BY lease_key
        ORDER BY lease_key
      `),
    );
    return rows.map((r) => ({ leaseKey: r.lease_key, liveHolders: toNumber(r.live_holders, 0) }));
  }

  /**
   * Forcibly expire a lease (operator action / development test of takeover).
   * Not exposed over HTTP: it is a manual recovery step in the runbook only.
   */
  async forceExpire(leaseKey: string = P13_LEASE_KEY): Promise<void> {
    await this.db.db.execute(sql`
      UPDATE worker_leases
      SET expires_at = now() - interval '1 second', updated_at = now()
      WHERE lease_key = ${leaseKey}
    `);
  }
}

function mapLeaseRow(row: RawLeaseRow): LeaseRecord {
  return {
    leaseKey: row.lease_key,
    holderId: row.holder_id,
    holderHost: row.holder_host,
    holderPid: row.holder_pid == null ? null : Number(row.holder_pid),
    // Raw `execute()` returns `bigint` as a string and `timestamptz` as a string
    // (verified against the live driver), so both are coerced here rather than
    // trusted as their compile-time annotations.
    epoch: toNumber(row.epoch, 0),
    acquiredAt: toDate(row.acquired_at),
    heartbeatAt: toDate(row.heartbeat_at),
    expiresAt: toDate(row.expires_at),
    pollFailures: Number(row.poll_failures ?? 0),
    lastErrorCode: row.last_error_code,
    lastJobAt: toDate(row.last_job_at),
    lastJobSummary: row.last_job_summary,
  };
}
