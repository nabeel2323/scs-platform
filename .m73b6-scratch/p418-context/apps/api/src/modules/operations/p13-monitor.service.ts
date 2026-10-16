/**
 * P13 Phase 4 — Operational monitor.
 *
 * One periodic scan over the state the P13 feature already persists. No new
 * metric store, no new daemon: findings become `ops_alerts` rows, and the same
 * rows back the ops status endpoint and the runbook queries.
 *
 * `collectFindings()` is deliberately side-effect free — it reads and returns
 * what it observed — so specs can prove detection without touching a delivery
 * sink. `scan()` = collect + raise + resolve.
 *
 * Every check is read-only. Nothing here can mutate a return, a refund, a
 * reversal, or an adjustment, which is what keeps the alerting path from being
 * able to bypass the financial safeguards.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import {
  ALERT_DELIVERY_FAILURE_CONDITION,
  OpsAlertService,
  type OpsAlertInput,
  type OpsSeverity,
} from './ops-alert.service';
import { WorkerLeaseService } from './worker-lease.service';
import { getOpsCounter, opsCounterSnapshot } from './ops-counters';
import { readRows, toDate } from './raw-result';
import { P13_LEASE_KEY, resolveP13OpsConfig, type P13OpsConfig } from './p13-ops.config';

/** Event-type prefixes whose delivery failure is a P13 integrity concern. */
const P13_OUTBOX_PREFIXES = ['return.', 'refund.', 'commission.', 'settlement.', 'adjustment.'];

export interface P13ScanReport {
  at: string;
  checksRun: string[];
  findings: Array<{ conditionKey: string; severity: OpsSeverity; dedupKey: string; title: string }>;
  raised: Array<{ conditionKey: string; status: string; deduped: boolean }>;
  resolved: string[];
}

@Injectable()
export class P13MonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(P13MonitorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private readonly config: P13OpsConfig;

  constructor(
    private readonly db: DatabaseService,
    private readonly alerts: OpsAlertService,
    private readonly leases: WorkerLeaseService,
  ) {
    this.config = resolveP13OpsConfig();
  }

  onModuleInit(): void {
    // The monitor is safe to run on every instance: alert dedup is enforced by
    // the unique dedup_key in Postgres, so N monitors still produce one
    // notification per condition per resource.
    this.timer = setInterval(() => {
      void this.runQuietly();
    }, this.config.monitorIntervalMs);
    this.logger.log(
      `P13Monitor registered — scanning every ${this.config.monitorIntervalMs}ms via ${this.alerts.channelName}.`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runQuietly(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      await this.scan();
    } catch (err) {
      // The monitor watching itself failing is alert 10's own subject matter.
      this.logger.error(
        `P13 monitor scan threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.scanning = false;
    }
  }

  // ── Public surface ────────────────────────────────────────────────────────

  async scan(): Promise<P13ScanReport> {
    const { findings, clears } = await this.collectFindings();
    const raised: P13ScanReport['raised'] = [];
    const resolved: string[] = [];

    for (const finding of findings) {
      const result = await this.alerts.raise(finding);
      raised.push({
        conditionKey: finding.conditionKey,
        status: result.status,
        deduped: result.deduped,
      });
    }

    // Conditions that went away are closed so a later recurrence is a new
    // incident rather than a suppressed repeat.
    for (const dedupKey of clears) {
      if (findings.some((f) => f.dedupKey === dedupKey)) continue;
      if (await this.alerts.resolve(dedupKey)) resolved.push(dedupKey);
    }

    return {
      at: new Date().toISOString(),
      checksRun: CHECK_NAMES,
      findings: findings.map((f) => ({
        conditionKey: f.conditionKey,
        severity: f.severity,
        dedupKey: OpsAlertService.deriveDedupKey(f),
        title: f.title,
      })),
      raised,
      resolved,
    };
  }

  /**
   * Read-only: produce the alert inputs for all ten checks, plus the dedup keys
   * whose conditions are no longer present.
   */
  async collectFindings(): Promise<{
    findings: OpsAlertInput[];
    clears: string[];
  }> {
    const findings: OpsAlertInput[] = [];
    const clears: string[] = [];

    const leaseRows = await this.leases.readAll();

    // ── 1. Three consecutive worker polling failures ─────────────────────
    const failureThreshold = this.config.thresholds.pollFailureAlertCount;
    const failingLeases = leaseRows.filter((l) => l.pollFailures >= failureThreshold);
    for (const lease of failingLeases) {
      findings.push({
        conditionKey: 'p13.worker.poll_failures',
        severity: 'CRITICAL',
        title: `Worker job ${lease.leaseKey} failed ${lease.pollFailures} consecutive polls`,
        detail: {
          leaseKey: lease.leaseKey,
          pollFailures: lease.pollFailures,
          threshold: failureThreshold,
          lastErrorCode: lease.lastErrorCode,
          holderEpoch: lease.epoch,
        },
        resourceType: 'worker_lease',
        // `ops_alerts.resource_id` is a UUID, so the job key is carried in the
        // dedup identity explicitly. It must match the `clears` key below exactly,
        // otherwise a recovered condition could never be closed.
        dedupKey: `p13.worker.poll_failures:${lease.leaseKey}`,
      });
    }
    for (const lease of leaseRows) {
      if (lease.pollFailures < failureThreshold) {
        clears.push(`p13.worker.poll_failures:${lease.leaseKey}`);
      }
    }

    // ── 2. Return stuck in REQUESTED past its escalation trigger ─────────
    const staleRequested = readRows<{ id: string; org_id: string | null; expires_at: unknown }>(
      await this.db.db.execute(sql`
        SELECT rr.id, s.org_id, rr.expires_at
        FROM return_requests rr
        JOIN orders o ON o.id = rr.sub_order_id
        LEFT JOIN stores s ON s.id = o.store_id
        WHERE rr.status = 'REQUESTED'
          AND rr.expires_at IS NOT NULL
          AND rr.expires_at < now() - (${this.config.thresholds.requestedStaleMs} * interval '1 millisecond')
        ORDER BY rr.expires_at
        LIMIT 50
      `),
    );
    for (const row of staleRequested) {
      findings.push({
        conditionKey: 'p13.return.escalation_overdue',
        severity: 'WARN',
        title: `Return ${row.id} passed its merchant SLA but is still REQUESTED`,
        detail: {
          returnRequestId: row.id,
          expiredAt: toDate(row.expires_at)?.toISOString() ?? null,
          graceMs: this.config.thresholds.requestedStaleMs,
        },
        orgId: row.org_id,
        resourceType: 'return_request',
        resourceId: row.id,
      });
    }

    // ── 3. Zero or multiple live worker holders ──────────────────────────
    if (this.config.expectedWorkerCount > 0) {
      const byKey = new Map<string, number>();
      const now = Date.now();
      for (const lease of leaseRows) {
        const live = !!lease.holderId && !!lease.expiresAt && lease.expiresAt.getTime() > now;
        byKey.set(lease.leaseKey, (byKey.get(lease.leaseKey) ?? 0) + (live ? 1 : 0));
      }
      // A job key with no lease row at all is a zero-worker condition too.
      if (!byKey.has(P13_LEASE_KEY)) byKey.set(P13_LEASE_KEY, 0);

      for (const [leaseKey, live] of byKey) {
        if (live === this.config.expectedWorkerCount) {
          clears.push(`p13.worker.count_anomaly:${leaseKey}`);
          continue;
        }
        findings.push({
          conditionKey: 'p13.worker.count_anomaly',
          severity: 'CRITICAL',
          title: `Worker job ${leaseKey} has ${live} live holder(s), expected ${this.config.expectedWorkerCount}`,
          detail: { leaseKey, liveHolders: live, expected: this.config.expectedWorkerCount },
          resourceType: 'worker_lease',
          dedupKey: `p13.worker.count_anomaly:${leaseKey}`,
        });
      }
    }

    // ── 4. Missing worker heartbeat ──────────────────────────────────────
    const staleHeartbeat = readRows<{ lease_key: string; holder_id: string; heartbeat_at: unknown }>(
      await this.db.db.execute(sql`
        SELECT lease_key, holder_id, heartbeat_at
        FROM worker_leases
        WHERE holder_id IS NOT NULL
          AND (heartbeat_at IS NULL
               OR heartbeat_at < now() - (${this.config.thresholds.heartbeatStaleMs} * interval '1 millisecond'))
      `),
    );
    for (const row of staleHeartbeat) {
      findings.push({
        conditionKey: 'p13.worker.heartbeat_stale',
        severity: 'CRITICAL',
        title: `Worker lease ${row.lease_key} has no heartbeat within ${this.config.thresholds.heartbeatStaleMs / 60_000} minutes`,
        detail: {
          leaseKey: row.lease_key,
          holderId: row.holder_id,
          lastHeartbeatAt: toDate(row.heartbeat_at)?.toISOString() ?? null,
        },
        resourceType: 'worker_lease',
        dedupKey: `p13.worker.heartbeat_stale:${row.lease_key}`,
      });
    }
    for (const lease of leaseRows) {
      if (lease.holderId && lease.heartbeatAt) {
        const age = Date.now() - lease.heartbeatAt.getTime();
        if (age < this.config.thresholds.heartbeatStaleMs) {
          clears.push(`p13.worker.heartbeat_stale:${lease.leaseKey}`);
        }
      }
    }

    // ── 5. Refunds failed / stuck / needing manual review ────────────────
    const refundRows = readRows<{
      id: string; return_request_id: string | null; status: string;
      amount_minor: string; created_at: unknown; org_id: string | null;
    }>(await this.db.db.execute(sql`
      SELECT r.id, r.return_request_id, r.status, r.amount_minor, r.created_at, s.org_id
      FROM refunds r
      LEFT JOIN orders o ON o.id = r.order_id
      LEFT JOIN stores s ON s.id = o.store_id
      WHERE (r.status = 'FAILED')
         OR (r.status IN ('REQUESTED', 'PROCESSING', 'APPROVED')
             AND r.created_at < now() - (${this.config.thresholds.refundStuckMs} * interval '1 millisecond'))
      ORDER BY r.created_at
      LIMIT 50
    `));
    for (const row of refundRows) {
      const failed = row.status === 'FAILED';
      findings.push({
        conditionKey: failed ? 'p13.refund.failed' : 'p13.refund.stuck',
        severity: failed ? 'CRITICAL' : 'WARN',
        title: failed
          ? `Refund ${row.id} failed${row.return_request_id ? ' for a return' : ''}`
          : `Refund ${row.id} has stayed in ${row.status} beyond ${this.config.thresholds.refundStuckMs / 60_000} minutes`,
        // Amounts are reported as presence + magnitude class, never as customer-facing values.
        detail: {
          refundId: row.id,
          returnRequestId: row.return_request_id,
          status: row.status,
          createdAt: toDate(row.created_at)?.toISOString() ?? null,
        },
        orgId: row.org_id,
        resourceType: 'refund',
        resourceId: row.id,
      });
    }

    const manualReview = readRows<{ id: string; org_id: string | null }>(await this.db.db.execute(sql`
      SELECT rr.id, s.org_id
      FROM return_requests rr
      JOIN orders o ON o.id = rr.sub_order_id
      LEFT JOIN stores s ON s.id = o.store_id
      WHERE rr.status = 'REFUND_FAILED'
      ORDER BY rr.updated_at
      LIMIT 50
    `));
    for (const row of manualReview) {
      findings.push({
        conditionKey: 'p13.refund.manual_review',
        severity: 'CRITICAL',
        title: `Return ${row.id} is in REFUND_FAILED and requires manual review`,
        detail: { returnRequestId: row.id },
        orgId: row.org_id,
        resourceType: 'return_request',
        resourceId: row.id,
      });
    }

    const refundAttemptFailures = getOpsCounter('refund_operation_failures_total');
    if (refundAttemptFailures > 0) {
      findings.push({
        conditionKey: 'p13.refund.operation_failed',
        severity: 'CRITICAL',
        title: `${refundAttemptFailures} refund operation(s) failed in this process`,
        detail: { refundFailures: refundAttemptFailures, since: 'process-start' },
        resourceType: 'refund',
      });
    }

    // ── 6. Commission reversal failures / duplicate attempts ─────────────
    const failedReversals = readRows<{ id: string; return_request_id: string; org_id: string | null }>(
      await this.db.db.execute(sql`
        SELECT cr.id, cr.return_request_id, cr.org_id
        FROM commission_reversals cr
        WHERE cr.status = 'FAILED'
        ORDER BY cr.created_at
        LIMIT 50
      `),
    );
    for (const row of failedReversals) {
      findings.push({
        conditionKey: 'p13.commission.reversal_failed',
        severity: 'CRITICAL',
        title: `Commission reversal ${row.id} is FAILED`,
        detail: { reversalId: row.id, returnRequestId: row.return_request_id },
        orgId: row.org_id,
        resourceType: 'commission_reversal',
        resourceId: row.id,
      });
    }

    const reversalFailures = getOpsCounter('commission_reversal_failures_total');
    if (reversalFailures > 0) {
      findings.push({
        conditionKey: 'p13.commission.reversal_error',
        severity: 'CRITICAL',
        title: `${reversalFailures} commission reversal(s) threw outside the idempotency guard`,
        detail: {
          reversalFailures,
          lastReason: opsCounterSnapshot()['commission_reversal_failures_total']?.lastReason ?? null,
          since: 'process-start',
        },
        resourceType: 'commission_reversal',
      });
    }

    const duplicateAttempts = getOpsCounter('commission_reversal_duplicate_attempts_total');
    if (duplicateAttempts > 0) {
      findings.push({
        conditionKey: 'p13.commission.reversal_duplicate_attempt',
        severity: 'WARN',
        title: `${duplicateAttempts} duplicate commission-reversal attempt(s) were rejected by idempotency`,
        detail: { duplicateAttempts, since: 'process-start' },
        resourceType: 'commission_reversal',
      });
    }

    // ── 7. Authoritative financial invariants ────────────────────────────
    const overReversed = readRows<{ return_request_id: string; total: string; original: string }>(
      await this.db.db.execute(sql`
        SELECT return_request_id,
               SUM(reversal_minor) AS total,
               MAX(original_commission_minor) AS original
        FROM commission_reversals
        WHERE status = 'POSTED'
        GROUP BY return_request_id
        HAVING SUM(reversal_minor) > MAX(original_commission_minor)
      `),
    );
    for (const row of overReversed) {
      findings.push({
        conditionKey: 'p13.financial.invariant_violation',
        severity: 'CRITICAL',
        title: `Commission reversed beyond the original commission for return ${row.return_request_id}`,
        detail: {
          violation: 'reversal_exceeds_original_commission',
          returnRequestId: row.return_request_id,
          reversedMinor: Number(row.total),
          originalMinor: Number(row.original),
        },
        resourceType: 'return_request',
        resourceId: row.return_request_id,
      });
    }

    const overRefunded = readRows<{ payment_record_id: string; refunded: string; paid: string }>(
      await this.db.db.execute(sql`
        SELECT r.payment_record_id,
               SUM(r.amount_minor) AS refunded,
               MAX(p.amount_minor) AS paid
        FROM refunds r
        JOIN payment_records p ON p.id = r.payment_record_id
        WHERE r.status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED')
        GROUP BY r.payment_record_id
        HAVING SUM(r.amount_minor) > MAX(p.amount_minor)
      `),
    );
    for (const row of overRefunded) {
      findings.push({
        conditionKey: 'p13.financial.invariant_violation',
        severity: 'CRITICAL',
        title: `Refunds exceed the captured payment for payment record ${row.payment_record_id}`,
        detail: {
          violation: 'refund_exceeds_payment',
          paymentRecordId: row.payment_record_id,
          refundedMinor: Number(row.refunded),
          paidMinor: Number(row.paid),
        },
        resourceType: 'payment_record',
        resourceId: row.payment_record_id,
      });
    }

    const fxBypassed = readRows<{ id: string; org_id: string | null; fx_status: string }>(
      await this.db.db.execute(sql`
        SELECT id, org_id, fx_status
        FROM settlement_adjustments
        WHERE status = 'POSTED'
          AND fx_status IN ('BLOCKED', 'PENDING_REVIEW')
      `),
    );
    for (const row of fxBypassed) {
      findings.push({
        conditionKey: 'p13.financial.invariant_violation',
        severity: 'CRITICAL',
        title: `Settlement adjustment ${row.id} posted while FX is ${row.fx_status}`,
        detail: { violation: 'posted_without_authoritative_fx', adjustmentId: row.id, fxStatus: row.fx_status },
        orgId: row.org_id,
        resourceType: 'settlement_adjustment',
        resourceId: row.id,
      });
    }

    // ── 8. Tenant-isolation violations on financial records ──────────────
    const misplacedAdjustments = readRows<{ id: string; adj_org: string; owner_org: string }>(
      await this.db.db.execute(sql`
        SELECT sa.id, sa.org_id AS adj_org, s.org_id AS owner_org
        FROM settlement_adjustments sa
        JOIN orders o ON o.id = sa.sub_order_id
        JOIN stores s ON s.id = o.store_id
        WHERE sa.org_id IS NOT NULL
          AND s.org_id IS NOT NULL
          AND sa.org_id <> s.org_id
      `),
    );
    for (const row of misplacedAdjustments) {
      findings.push({
        conditionKey: 'p13.tenant.isolation_violation',
        severity: 'CRITICAL',
        title: `Settlement adjustment ${row.id} is scoped to an organization that does not own the order`,
        detail: { violation: 'adjustment_org_mismatch', adjustmentId: row.id },
        orgId: row.owner_org,
        resourceType: 'settlement_adjustment',
        resourceId: row.id,
      });
    }

    const misplacedReversals = readRows<{ id: string; owner_org: string }>(await this.db.db.execute(sql`
      SELECT cr.id, s.org_id AS owner_org
      FROM commission_reversals cr
      JOIN return_requests rr ON rr.id = cr.return_request_id
      JOIN orders o ON o.id = rr.sub_order_id
      JOIN stores s ON s.id = o.store_id
      WHERE cr.org_id IS NOT NULL
        AND s.org_id IS NOT NULL
        AND cr.org_id <> s.org_id
    `));
    for (const row of misplacedReversals) {
      findings.push({
        conditionKey: 'p13.tenant.isolation_violation',
        severity: 'CRITICAL',
        title: `Commission reversal ${row.id} is scoped to an organization that does not own the return`,
        detail: { violation: 'reversal_org_mismatch', reversalId: row.id },
        orgId: row.owner_org,
        resourceType: 'commission_reversal',
        resourceId: row.id,
      });
    }

    const isolationDenials = getOpsCounter('financial_isolation_denials_total');
    if (isolationDenials > 0) {
      findings.push({
        conditionKey: 'p13.tenant.isolation_denial',
        severity: 'WARN',
        title: `${isolationDenials} financial record access(es) were denied by object-level tenant checks`,
        detail: { denials: isolationDenials, since: 'process-start' },
        resourceType: 'tenant_scope',
      });
    }

    // ── 9. Critical audit / outbox delivery failures ─────────────────────
    const p13EventFilter = sql.join(
      P13_OUTBOX_PREFIXES.map((prefix) => sql`event_type LIKE ${prefix + '%'}`),
      sql` OR `,
    );
    const outboxFailed = readRows<{ id: string; event_type: string; attempts: number; status: string }>(
      await this.db.db.execute(sql`
        SELECT id, event_type, attempts, status
        FROM outbox_events
        WHERE status IN ('FAILED', 'DEAD_LETTER')
          AND (${p13EventFilter})
        ORDER BY created_at
        LIMIT 50
      `),
    );
    for (const row of outboxFailed) {
      findings.push({
        conditionKey: 'p13.outbox.delivery_failed',
        severity: 'CRITICAL',
        title: `P13 outbox event ${row.event_type} is ${row.status} after ${row.attempts} attempt(s)`,
        detail: { outboxId: row.id, eventType: row.event_type, status: row.status, attempts: row.attempts },
        resourceType: 'outbox_event',
        resourceId: row.id,
      });
    }

    const auditFailures = getOpsCounter('audit_write_failures_total');
    if (auditFailures > 0) {
      findings.push({
        conditionKey: 'p13.audit.write_failed',
        severity: 'CRITICAL',
        title: `${auditFailures} audit write(s) failed — durable trail is at risk`,
        detail: {
          auditWriteFailures: auditFailures,
          lastReason: opsCounterSnapshot()['audit_write_failures_total']?.lastReason ?? null,
          since: 'process-start',
        },
        resourceType: 'audit_log',
      });
    }

    // ── 10. Alert-delivery failure ──────────────────────────────────────
    const undelivered = readRows<{ condition_key: string; cnt: number }>(await this.db.db.execute(sql`
      SELECT condition_key, COUNT(*)::int AS cnt
      FROM ops_alerts
      WHERE status = 'FAILED'
      GROUP BY condition_key
    `));
    for (const row of undelivered) {
      if (row.condition_key === ALERT_DELIVERY_FAILURE_CONDITION) {
        // The failure alert itself could not be delivered: the log line is the
        // last-resort channel, and re-raising would recurse forever.
        this.logger.error(
          `Alert delivery is failing and the delivery-failure alert cannot be delivered (${row.cnt} undelivered). Configure the sink.`,
        );
        continue;
      }
      findings.push({
        conditionKey: ALERT_DELIVERY_FAILURE_CONDITION,
        severity: 'CRITICAL',
        title: `${row.cnt} alert(s) for ${row.condition_key} could not be delivered`,
        detail: { blockedConditionKey: row.condition_key, undeliveredCount: Number(row.cnt) },
        resourceType: 'ops_alert',
      });
    }

    return { findings, clears };
  }
}

const CHECK_NAMES = [
  'worker.poll_failures',
  'return.escalation_overdue',
  'worker.count_anomaly',
  'worker.heartbeat_stale',
  'refund.failed_or_stuck',
  'commission.reversal_integrity',
  'financial.invariants',
  'tenant.isolation',
  'outbox_and_audit_durability',
  'alert_delivery',
];
