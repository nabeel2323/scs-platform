/**
 * P13 Phase 4 — Operational alerting with dedup and delivery confirmation.
 *
 * Reuses what already exists rather than adding a monitoring stack: the durable
 * record is a table, the transport is one webhook POST, and the last-resort
 * channel is the pino logger the platform already ships. No new metric exporter,
 * no new daemon.
 *
 * Contract
 * ────────
 * `raise()` ALWAYS leaves a durable row. Delivery is a separate, observable
 * state machine on that row:
 *
 *   PENDING ──sink 2xx──▶ SENT
 *           └─sink error─▶ FAILED   (re-attempted on the next scan)
 *   SENT ──condition recurs inside the repeat window──▶ suppressed_count++
 *   no sink configured ─▶ SUPPRESSED (logged, never silently dropped)
 *   RESOLVED ──condition recurs──▶ PENDING (new incident)
 *
 * Sensitive data: `detail` is built by callers from identifiers and counts only.
 * The webhook URL itself is never written to a log line or into `detail`.
 */

import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { randomUUID, createHmac } from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { recordOpsCounter, opsCounterSnapshot } from './ops-counters';
import { firstRow, readRows, affectedRows } from './raw-result';
import { resolveP13OpsConfig, type P13OpsConfig } from './p13-ops.config';

export type OpsSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export interface OpsAlertInput {
  /** Stable machine-readable id for the condition, e.g. `p13.worker.poll_failures`. */
  conditionKey: string;
  severity: OpsSeverity;
  title: string;
  /** Sanitised identifiers/counts only. */
  detail?: Record<string, unknown>;
  /** Overrides the derived key when a condition needs a narrower/broader grouping. */
  dedupKey?: string;
  orgId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

export interface OpsAlertResult {
  id: string;
  status: string;
  /** True when a notification attempt was made as a result of this call. */
  notified: boolean;
  /** True when the condition matched an existing open alert. */
  deduped: boolean;
  fireCount: number;
}

/** Persisted alert projection shared by the ops services and specs. */
export interface OpsAlertRecord {
  id: string;
  dedup_key: string;
  condition_key: string;
  severity: string;
  title: string;
  status: string;
  /** Sanitised identifiers/counts. Read back so operators (and specs) can prove what fired. */
  detail: Record<string, unknown> | null;
  fire_count: number;
  suppressed_count: number;
  attempt_count: number;
  delivery_channel: string | null;
  org_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  first_observed_at: Date;
  last_observed_at: Date;
  delivered_at: Date | null;
  resolved_at: Date | null;
  last_error: string | null;
}

/** Condition key reserved for alert 10 (monitoring / alert-delivery failure). */
export const ALERT_DELIVERY_FAILURE_CONDITION = 'ops.alert.delivery_failed';

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  readonly config: P13OpsConfig;

  /** Guards against unbounded recursion when the alert sink itself is failing. */
  private deliveringFailureAlert = false;

  constructor(private readonly db: DatabaseService) {
    this.config = resolveP13OpsConfig();
  }

  /** Whether an external sink is configured (drives SENT vs SUPPRESSED). */
  get hasSink(): boolean {
    return !!this.config.alertWebhookUrl;
  }

  get channelName(): string {
    return this.hasSink ? 'webhook' : 'log-only';
  }

  /** Default dedup identity: one open alert per condition per resource. */
  static deriveDedupKey(input: OpsAlertInput): string {
    if (input.dedupKey) return input.dedupKey.slice(0, 200);
    const resource = input.resourceId ?? input.resourceType ?? 'global';
    return `${input.conditionKey}:${resource}`.slice(0, 200);
  }

  async raise(input: OpsAlertInput): Promise<OpsAlertResult> {
    const dedupKey = OpsAlertService.deriveDedupKey(input);
    const existing = await this.findByDedupKey(dedupKey);

    if (existing) {
      return this.handleExisting(existing, input, dedupKey);
    }
    return this.insertNew(input, dedupKey);
  }

  private async insertNew(
    input: OpsAlertInput,
    dedupKey: string,
  ): Promise<OpsAlertResult> {
    const id = randomUUID();
    try {
      await this.db.db.execute(sql`
        INSERT INTO ops_alerts (
          id, dedup_key, condition_key, severity, title, detail, status,
          fire_count, suppressed_count, attempt_count, org_id,
          resource_type, resource_id,
          first_observed_at, last_observed_at, created_at, updated_at
        ) VALUES (
          ${id}, ${dedupKey}, ${input.conditionKey}, ${input.severity},
          ${input.title.slice(0, 200)}, ${JSON.stringify(input.detail ?? {})},
          'PENDING', 1, 0, 0,
          ${input.orgId ?? null}, ${input.resourceType ?? null}, ${input.resourceId ?? null},
          now(), now(), now(), now()
        )
        ON CONFLICT (dedup_key) DO NOTHING
      `);
    } catch (err) {
      // A concurrent scan may have inserted the same key between our read and
      // write. Fall back to the dedup path rather than losing the condition.
      this.logger.debug(`Alert insert raced for ${dedupKey}: ${errMessage(err)}`);
      const row = await this.findByDedupKey(dedupKey);
      if (row) return this.handleExisting(row, input, dedupKey);
      throw err;
    }

    const delivered = await this.deliver(id, input, dedupKey);
    return {
      id,
      status: delivered.status,
      notified: delivered.notified,
      deduped: false,
      fireCount: 1,
    };
  }

  private async handleExisting(
    row: OpsAlertRecord,
    input: OpsAlertInput,
    dedupKey: string,
  ): Promise<OpsAlertResult> {
    const recursedAfterResolve = row.status === 'RESOLVED';

    // Record the recurrence unconditionally.
    await this.db.db.execute(sql`
      UPDATE ops_alerts
      SET fire_count = fire_count + 1,
          last_observed_at = now(),
          updated_at = now(),
          severity = ${input.severity},
          title = ${input.title.slice(0, 200)},
          detail = ${JSON.stringify(input.detail ?? {})},
          status = ${recursedAfterResolve ? 'PENDING' : row.status},
          delivered_at = ${recursedAfterResolve ? null : row.delivered_at}
      WHERE dedup_key = ${dedupKey}
    `);

    const fireCount = row.fire_count + 1;

    // Decide whether this recurrence warrants another notification.
    const needsDelivery =
      recursedAfterResolve ||
      row.status === 'PENDING' ||
      row.status === 'FAILED' ||
      (row.status === 'SENT' && pastRepeatWindow(row.delivered_at, this.config.alertRepeatWindowMs));

    if (!needsDelivery) {
      await this.db.db.execute(sql`
        UPDATE ops_alerts
        SET suppressed_count = suppressed_count + 1, updated_at = now()
        WHERE dedup_key = ${dedupKey}
      `);
      return { id: row.id, status: row.status, notified: false, deduped: true, fireCount };
    }

    // A recurrence of a RESOLVED condition is a new incident, not a dedup of
    // the closed one — report it as such so callers and tests can tell the two
    // apart while still reusing the same durable row.
    return this.deliver(row.id, input, dedupKey, !recursedAfterResolve);
  }

  /**
   * Attempt one notification and persist its outcome.
   * Never throws: a broken alert path must not break the caller's operation.
   */
  private async deliver(
    alertId: string,
    input: OpsAlertInput,
    dedupKey: string,
    deduped = false,
  ): Promise<OpsAlertResult> {
    const fireCountRow = firstRow<{ fire_count: number }>(await this.db.db.execute(sql`
      SELECT fire_count FROM ops_alerts WHERE id = ${alertId}
    `));
    const fireCount = Number(fireCountRow?.fire_count ?? 1);

    if (!this.hasSink) {
      // Documented limitation, not a silent drop: the row is durable and the
      // condition is emitted at ERROR level for log-based alerting to pick up.
      await this.db.db.execute(sql`
        UPDATE ops_alerts
        SET status = 'SUPPRESSED',
            delivery_channel = 'log-only',
            last_error = NULL,
            updated_at = now()
        WHERE id = ${alertId}
      `);
      this.logger.error(
        `[P13-ALERT] ${input.severity} ${input.conditionKey} — ${input.title} ` +
          `detail=${safeJson(input.detail)} (no alert sink configured)`,
      );
      return { id: alertId, status: 'SUPPRESSED', notified: false, deduped, fireCount };
    }

    recordOpsCounter('alert_delivery_attempts_total');
    let ok = false;
    let failure: string | null = null;

    try {
      // Serialize the payload exactly once so the signed bytes match the body.
      const body = safeJson(this.buildPayload(alertId, dedupKey, input, fireCount));
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      // Defense-in-depth (Phase 4.1.8): enforce signing immediately before
      // the HTTP request. The config layer guarantees fail-closed at init
      // time, but if the config object is mutated after construction we must
      // still refuse to send an unsigned request.
      const secret = this.config.alertWebhookSecret;
      if (!secret || secret.length < 32) {
        failure = 'signing secret missing or too short — unsigned delivery suppressed';
        this.logger.error(
          `[P13-ALERT] ${input.severity} ${input.conditionKey} — ${failure}`,
        );
        // Jump to the FAILED persistence path without making a network request.
        throw new UnsignedDeliverySuppressedError(failure);
      }

      // Sign the body with HMAC-SHA256 + timestamp for replay protection.
      // A signing exception must never trigger an unsigned fallback.
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const canonical = `${timestamp}.${body}`;
        const signature = createHmac('sha256', secret)
          .update(canonical, 'utf-8')
          .digest('hex');
        headers['x-scs-alert-signature'] = `sha256=${signature}`;
        headers['x-scs-alert-timestamp'] = String(timestamp);
      } catch (signErr) {
        failure = `signing failed — unsigned delivery suppressed: ${errMessage(signErr)}`;
        this.logger.error(
          `[P13-ALERT] ${input.severity} ${input.conditionKey} — ${failure}`,
        );
        throw new UnsignedDeliverySuppressedError(failure);
      }

      const response = await fetch(this.config.alertWebhookUrl as string, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.config.alertDeliveryTimeoutMs),
      });
      ok = response.ok;
      if (!ok) failure = `sink responded ${response.status}`;
    } catch (err) {
      if (err instanceof UnsignedDeliverySuppressedError) {
        failure = err.message;
      } else {
        failure = errMessage(err);
      }
    }

    if (ok) {
      await this.db.db.execute(sql`
        UPDATE ops_alerts
        SET status = 'SENT', delivery_channel = 'webhook', attempt_count = attempt_count + 1,
            delivered_at = now(), last_error = NULL, updated_at = now()
        WHERE id = ${alertId}
      `);
      this.logger.warn(`Alert delivered: ${input.conditionKey} (${dedupKey}) [signed]`);
      return { id: alertId, status: 'SENT', notified: true, deduped, fireCount };
    }

    recordOpsCounter('alert_delivery_failures_total', 1, failure ?? 'unknown');
    await this.db.db.execute(sql`
      UPDATE ops_alerts
      SET status = 'FAILED', delivery_channel = 'webhook', attempt_count = attempt_count + 1,
          last_error = ${truncate(failure, 300)}, updated_at = now()
      WHERE id = ${alertId}
    `);
    this.logger.error(`Alert delivery FAILED for ${input.conditionKey}: ${truncate(failure, 200)}`);

    // Alert 10: the alerting path itself is broken. Guard against recursion —
    // if the failure alert cannot be delivered, the log line above is the
    // evidence and the row stays FAILED for the next scan to retry.
    if (input.conditionKey !== ALERT_DELIVERY_FAILURE_CONDITION && !this.deliveringFailureAlert) {
      this.deliveringFailureAlert = true;
      try {
        await this.raise({
          conditionKey: ALERT_DELIVERY_FAILURE_CONDITION,
          severity: 'CRITICAL',
          title: 'Operational alert delivery is failing',
          detail: {
            failedConditionKey: input.conditionKey,
            failedAlertId: alertId,
            reason: truncate(failure, 200),
            attempts: Number(fireCount),
          },
          resourceType: 'ops_alert',
          resourceId: alertId,
        });
      } finally {
        this.deliveringFailureAlert = false;
      }
    }

    return { id: alertId, status: 'FAILED', notified: true, deduped, fireCount };
  }

  private buildPayload(
    alertId: string,
    dedupKey: string,
    input: OpsAlertInput,
    fireCount: number,
  ): Record<string, unknown> {
    return {
      id: alertId,
      dedupKey,
      conditionKey: input.conditionKey,
      severity: input.severity,
      title: input.title,
      detail: input.detail ?? {},
      orgId: input.orgId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      fireCount,
      source: 'scs-api',
      environment: process.env['NODE_ENV'] ?? 'unknown',
      emittedAt: new Date().toISOString(),
    };
  }

  /** Mark an alert resolved once its underlying condition has cleared. */
  async resolve(dedupKey: string): Promise<boolean> {
    const result = await this.db.db.execute(sql`
      UPDATE ops_alerts
      SET status = 'RESOLVED', resolved_at = now(), updated_at = now()
      WHERE dedup_key = ${dedupKey}
        AND status <> 'RESOLVED'
    `);
    return affectedRows(result) > 0;
  }

  async findByDedupKey(dedupKey: string): Promise<OpsAlertRecord | null> {
    const row = firstRow<OpsAlertRecord>(await this.db.db.execute(sql`
      SELECT ${ALERT_COLUMNS}
      FROM ops_alerts
      WHERE dedup_key = ${dedupKey}
    `));
    return row ?? null;
  }

  /** Alerts that still need operator attention. */
  async listOpen(limit = 50): Promise<OpsAlertRecord[]> {
    const rows = readRows<OpsAlertRecord>(await this.db.db.execute(sql`
      SELECT ${ALERT_COLUMNS}
      FROM ops_alerts
      WHERE status IN ('PENDING', 'SENT', 'FAILED')
      ORDER BY
        CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,
        last_observed_at DESC
      LIMIT ${limit}
    `));
    return rows;
  }

  async listByCondition(conditionKey: string, limit = 50): Promise<OpsAlertRecord[]> {
    const rows = readRows<OpsAlertRecord>(await this.db.db.execute(sql`
      SELECT ${ALERT_COLUMNS}
      FROM ops_alerts
      WHERE condition_key = ${conditionKey}
      ORDER BY last_observed_at DESC
      LIMIT ${limit}
    `));
    return rows;
  }

  /** Status x severity rollup for the ops status endpoint. */
  async snapshot(): Promise<{
    alerts: Record<string, number>;
    counters: ReturnType<typeof opsCounterSnapshot>;
    channel: string;
  }> {
    const rows = readRows<{ status: string; cnt: number }>(await this.db.db.execute(sql`
      SELECT status, COUNT(*)::int AS cnt
      FROM ops_alerts
      GROUP BY status
    `));
    const alerts: Record<string, number> = {};
    for (const row of rows) alerts[row.status] = Number(row.cnt);

    return { alerts, counters: opsCounterSnapshot(), channel: this.channelName };
  }
}

/**
 * Thrown internally by the delivery path when signing cannot be performed
 * (secret missing/too short, or signing itself threw). The outer catch
 * converts this into a FAILED alert row — no unsigned request is ever sent.
 */
export class UnsignedDeliverySuppressedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsignedDeliverySuppressedError';
  }
}

const ALERT_COLUMNS = sql`
  id, dedup_key, condition_key, severity, title, status, detail,
  fire_count, suppressed_count, attempt_count, delivery_channel,
  org_id, resource_type, resource_id,
  first_observed_at, last_observed_at, delivered_at, resolved_at, last_error
`;

function pastRepeatWindow(deliveredAt: Date | null, windowMs: number): boolean {
  if (!deliveredAt) return true;
  return Date.now() - new Date(deliveredAt).getTime() >= windowMs;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function truncate(value: string | null | undefined, max: number): string {
  const text = value ?? 'unknown';
  return text.length <= max ? text : text.slice(0, max);
}

/** Guard against circular/too-large payloads reaching a jsonb column or sink. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}
