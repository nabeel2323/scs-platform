/**
 * P13 Phase 4 — Allowlisted pilot controls.
 *
 * Two independent switches decide whether pilot enforcement is active, and both
 * must be understood together:
 *
 *   P13_PILOT_MODE=allowlist        (deployment configuration — operator-owned)
 *   feature_flags['p13.pilot.enabled'] = true   (runtime flag — permission-gated, audited)
 *
 * Enforcement is active when EITHER is true. Making the env var a floor rather
 * than an override means a runtime flag edit alone cannot turn the pilot on in an
 * environment that was not configured for it, and clearing the DB flag alone
 * cannot turn enforcement *off* in a deployment that requires it.
 *
 * Fail-closed rules, all of them covered by specs:
 *   - enforcement active + allowlist query throws        -> deny
 *   - enforcement active + allowlist empty                -> deny everyone
 *   - enforcement active + org row present but enabled=false -> deny
 *   - enforcement inactive (the default)                   -> legacy Phase 3 behaviour,
 *     i.e. no allowlist check. Documented as "pilot not activated".
 *
 * Eligibility is never a permission. Being allowlisted grants nothing; the RBAC
 * guard still decides what the caller may do.
 */

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from './ops-alert.service';
import { recordOpsCounter, getOpsCounter } from './ops-counters';
import { firstRow, readRows } from './raw-result';
import { featureFlags } from '../audit/audit.schema';
import { p13PilotAllowlist } from './operations.schema';
import { P13_PILOT_FLAG_KEY, resolveP13OpsConfig, type P13PilotMode } from './p13-ops.config';

export interface PilotEligibility {
  enforced: boolean;
  eligible: boolean;
  /** Machine-readable reason, safe to surface in logs and alert detail. */
  reason:
    | 'not_enforced'
    | 'eligible_org_wide'
    | 'eligible_store'
    | 'org_not_allowlisted'
    | 'entry_disabled'
    | 'missing_org_id'
    | 'allowlist_unreadable';
}

export interface PilotSnapshot {
  mode: P13PilotMode;
  flagEnabled: boolean | null;
  enforced: boolean;
  allowlistCount: number;
  enabledCount: number;
  denials: number;
}

@Injectable()
export class PilotControlService {
  private readonly logger = new Logger(PilotControlService.name);

  private readonly mode: P13PilotMode;

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly alerts: OpsAlertService,
  ) {
    this.mode = resolveP13OpsConfig().pilotMode;
  }

  /** Runtime flag only — reads false when the row is absent (disabled default). */
  async isFlagEnabled(): Promise<boolean> {
    const row = firstRow<{ enabled: boolean }>(await this.db.db.execute(sql`
      SELECT enabled FROM feature_flags WHERE key = ${P13_PILOT_FLAG_KEY}
    `));
    return row?.enabled === true;
  }

  /**
   * Whether allowlist enforcement applies to this process.
   * A DB error while reading the flag resolves to "enforced" when the
   * environment demands it, so an outage cannot open the gate.
   */
  async isEnforced(): Promise<boolean> {
    if (this.mode === 'allowlist') return true;
    try {
      return await this.isFlagEnabled();
    } catch (err) {
      this.logger.error(
        `Pilot flag unreadable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Core eligibility decision. Returns rather than throws so callers can log a
   * precise reason; use `assertEligible()` for the HTTP path.
   */
  async eligibility(orgId?: string | null, storeId?: string | null): Promise<PilotEligibility> {
    const enforced = await this.isEnforced();
    if (!enforced) return { enforced, eligible: true, reason: 'not_enforced' };

    if (!orgId) {
      // An unscoped caller cannot be proven allowlisted.
      recordOpsCounter('pilot_eligibility_denials_total', 1, 'missing_org_id');
      return { enforced, eligible: false, reason: 'missing_org_id' };
    }

    let row: { enabled: boolean; scope: 'eligible_org_wide' | 'eligible_store' } | null;
    try {
      row = await this.matchEntry(orgId, storeId ?? null);
    } catch (err) {
      // Fail closed: an unreadable allowlist denies, it does not allow.
      this.logger.error(
        `Pilot allowlist unreadable, denying: ${err instanceof Error ? err.message : String(err)}`,
      );
      recordOpsCounter('pilot_eligibility_denials_total', 1, 'allowlist_unreadable');
      return { enforced, eligible: false, reason: 'allowlist_unreadable' };
    }

    if (!row) {
      recordOpsCounter('pilot_eligibility_denials_total', 1, 'org_not_allowlisted');
      return { enforced, eligible: false, reason: 'org_not_allowlisted' };
    }
    if (!row.enabled) {
      recordOpsCounter('pilot_eligibility_denials_total', 1, 'entry_disabled');
      return { enforced, eligible: false, reason: 'entry_disabled' };
    }
    return { enforced, eligible: true, reason: row.scope };
  }

  /**
   * Store-scoped entry wins when present, otherwise the org-wide entry applies.
   * A store-scoped entry therefore narrows eligibility; it never broadens it
   * beyond the organization that already owns the store.
   */
  private async matchEntry(
    orgId: string,
    storeId: string | null,
  ): Promise<{ enabled: boolean; scope: 'eligible_org_wide' | 'eligible_store' } | null> {
    const rows = readRows<{ enabled: boolean; store_id: string | null }>(await this.db.db.execute(sql`
      SELECT enabled, store_id
      FROM p13_pilot_allowlist
      WHERE org_id = ${orgId}
        AND (store_id IS NULL OR store_id = ${storeId})
    `));

    const storeEntry = storeId ? rows.find((r) => r.store_id === storeId) : undefined;
    if (storeEntry) return { enabled: storeEntry.enabled, scope: 'eligible_store' };

    const orgEntry = rows.find((r) => r.store_id === null);
    if (orgEntry) return { enabled: orgEntry.enabled, scope: 'eligible_org_wide' };

    return null;
  }

  /** HTTP-facing gate. Denials are recorded as a metric the monitor can alert on. */
  async assertEligible(orgId?: string | null, storeId?: string | null): Promise<void> {
    const result = await this.eligibility(orgId, storeId);
    if (result.eligible) return;
    // `message` is what Nest surfaces as the error message and in the response
    // body; `code` keeps the denial reason machine-readable for clients, logs
    // and the audit trail without forcing anyone to parse prose.
    throw new ForbiddenException({
      type: 'https://errors.scs.local/forbidden',
      title: 'Forbidden',
      status: 403,
      code: `p13_pilot_${result.reason}`,
      message: `P13 pilot eligibility denied (${result.reason})`,
      detail: `P13 pilot eligibility check failed (${result.reason})`,
    });
  }

  // ── Configuration mutations (permission-gated at the controller, audited here) ──

  async setFlag(enabled: boolean, actorId: string | null, description?: string): Promise<void> {
    await this.db.db
      .insert(featureFlags)
      .values({
        key: P13_PILOT_FLAG_KEY,
        enabled,
        description: (description ?? 'P13 pilot allowlist enforcement').slice(0, 300),
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled, updatedBy: actorId, updatedAt: new Date() },
      });

    await this.audit.record({
      actorType: 'ADMIN',
      actorId,
      action: enabled ? 'p13.pilot.enable' : 'p13.pilot.disable',
      resource: 'feature_flag',
      metadata: { key: P13_PILOT_FLAG_KEY, enabled, mode: this.mode },
    });

    await this.alerts.raise({
      conditionKey: 'p13.pilot.flag_changed',
      severity: enabled ? 'WARN' : 'INFO',
      title: enabled
        ? 'P13 pilot enforcement enabled'
        : 'P13 pilot enforcement disabled',
      detail: { key: P13_PILOT_FLAG_KEY, enabled, mode: this.mode, actorId },
    });

    this.logger.warn(`Pilot flag ${P13_PILOT_FLAG_KEY} -> ${enabled} by ${actorId ?? 'system'}`);
  }

  async addAllowlistEntry(input: {
    orgId: string;
    storeId?: string | null;
    note?: string | null;
    actorId?: string | null;
  }): Promise<void> {
    if (!input.orgId) throw new ForbiddenException('orgId is required for an allowlist entry');

    await this.db.db
      .insert(p13PilotAllowlist)
      .values({
        orgId: input.orgId,
        storeId: input.storeId ?? null,
        enabled: true,
        note: (input.note ?? '').slice(0, 300) || null,
        createdBy: input.actorId ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await this.audit.record({
      actorType: 'ADMIN',
      actorId: input.actorId ?? null,
      action: 'p13.pilot.allowlist.add',
      resource: 'p13_pilot_allowlist',
      orgId: input.orgId,
      metadata: { orgId: input.orgId, storeId: input.storeId ?? null, note: input.note ?? null },
    });
  }

  /** Revoke = flip enabled=false, never delete. Durable records are preserved. */
  async revokeAllowlistEntry(input: {
    orgId: string;
    storeId?: string | null;
    note?: string | null;
    actorId?: string | null;
  }): Promise<number> {
    const result = await this.db.db.execute(sql`
      UPDATE p13_pilot_allowlist
      SET enabled = FALSE,
          note = ${((input.note ?? 'revoked').slice(0, 300))},
          updated_at = now()
      WHERE org_id = ${input.orgId}
        AND store_id IS NOT DISTINCT FROM ${input.storeId ?? null}
    `);
    const affected = Number(
      (result as unknown as { rowCount?: number }).rowCount ?? 0,
    );

    await this.audit.record({
      actorType: 'ADMIN',
      actorId: input.actorId ?? null,
      action: 'p13.pilot.allowlist.revoke',
      resource: 'p13_pilot_allowlist',
      orgId: input.orgId,
      metadata: {
        orgId: input.orgId,
        storeId: input.storeId ?? null,
        rowsAffected: affected,
      },
    });

    return affected;
  }

  async snapshot(): Promise<PilotSnapshot> {
    const flagEnabledRow = firstRow<{ enabled: boolean }>(await this.db.db.execute(sql`
      SELECT enabled FROM feature_flags WHERE key = ${P13_PILOT_FLAG_KEY}
    `));
    const counts = firstRow<{ total: number; enabled: number }>(await this.db.db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE enabled)::int AS enabled
      FROM p13_pilot_allowlist
    `));

    return {
      mode: this.mode,
      flagEnabled: flagEnabledRow ? flagEnabledRow.enabled : null,
      enforced: await this.isEnforced(),
      allowlistCount: Number(counts?.total ?? 0),
      enabledCount: Number(counts?.enabled ?? 0),
      denials: getOpsCounter('pilot_eligibility_denials_total'),
    };
  }
}
