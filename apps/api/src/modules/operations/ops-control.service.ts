/**
 * P13 Phase 4 — Durable operational controls (pause / kill switch).
 *
 * `isPaused()` is read by the worker at the top of every cycle and again before
 * every individual unit of protected work, so a pause lands without interrupting
 * a transaction that is already in flight: each unit is its own DB transaction
 * and therefore either commits or rolls back completely.
 *
 * Two properties the requirements call out are enforced here rather than left to
 * operator discipline:
 *
 * 1. Pausing never touches the lease. A paused holder keeps ownership, so a
 *    pause can never be used to hand the job to a second concurrent worker.
 * 2. Every change is written twice — once to `ops_control_audit` (durable,
 *    append-only) and once through `AuditService` (the platform audit trail) —
 *    and is emitted as an alert so it is visible without reading the DB.
 */

import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from './ops-alert.service';
import { firstRow, readRows, toDate } from './raw-result';
import { opsControlAudit } from './operations.schema';
import { P13_PAUSE_CONTROL_KEY } from './p13-ops.config';

export interface ControlState {
  controlKey: string;
  paused: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export interface ControlChange {
  controlKey: string;
  paused: boolean;
  reason: string | null;
  changedAt: Date;
  actorId: string | null;
}

@Injectable()
export class OpsControlService {
  private readonly logger = new Logger(OpsControlService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly alerts: OpsAlertService,
  ) {}

  /**
   * Absence of a row means not paused. A DB failure is NOT swallowed here: the
   * worker treats a thrown error as a failed cycle and skips the work, which is
   * the fail-closed direction for a kill switch.
   */
  async isPaused(controlKey: string = P13_PAUSE_CONTROL_KEY): Promise<boolean> {
    const row = firstRow<{ paused: boolean }>(await this.db.db.execute(sql`
      SELECT paused FROM ops_controls WHERE control_key = ${controlKey}
    `));
    return row?.paused === true;
  }

  async state(controlKey: string = P13_PAUSE_CONTROL_KEY): Promise<ControlState> {
    const row = firstRow<{
      control_key: string;
      paused: boolean;
      reason: string | null;
      updated_by: string | null;
      updated_at: unknown;
    }>(await this.db.db.execute(sql`
      SELECT control_key, paused, reason, updated_by, updated_at
      FROM ops_controls
      WHERE control_key = ${controlKey}
    `));

    if (!row) {
      return { controlKey, paused: false, reason: null, updatedBy: null, updatedAt: null };
    }
    return {
      controlKey: row.control_key,
      paused: row.paused === true,
      reason: row.reason,
      updatedBy: row.updated_by,
      updatedAt: toDate(row.updated_at),
    };
  }

  /**
   * Set the pause state. Requires a non-empty reason when pausing — an
   * unexplained kill-switch flip is exactly the silent configuration change the
   * requirements forbid.
   */
  async setPaused(input: {
    paused: boolean;
    reason?: string | null;
    actorId?: string | null;
    controlKey?: string;
  }): Promise<ControlState> {
    const controlKey = input.controlKey ?? P13_PAUSE_CONTROL_KEY;
    const reason = (input.reason ?? '').trim() || null;

    if (input.paused && !reason) {
      throw new Error('Pausing P13 background processing requires a reason');
    }

    // One transaction: control row + its append-only audit row.
    await this.db.db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO ops_controls (control_key, paused, reason, updated_by, updated_at)
        VALUES (${controlKey}, ${input.paused}, ${reason}, ${input.actorId ?? null}, now())
        ON CONFLICT (control_key) DO UPDATE
        SET paused = ${input.paused},
            reason = ${reason},
            updated_by = ${input.actorId ?? null},
            updated_at = now()
      `);

      await tx.insert(opsControlAudit).values({
        controlKey,
        paused: input.paused,
        reason,
        actorId: input.actorId ?? null,
        actorKind: input.actorId ? 'ADMIN' : 'SYSTEM',
        changedAt: new Date(),
      });
    });

    // Platform audit trail (best-effort by design; never fails the change).
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: input.actorId ?? null,
      action: input.paused ? 'p13.worker.pause' : 'p13.worker.resume',
      resource: 'ops_control',
      resourceId: null,
      metadata: { controlKey, paused: input.paused, reason },
    });

    await this.alerts.raise({
      conditionKey: 'p13.worker.control_changed',
      severity: input.paused ? 'WARN' : 'INFO',
      title: input.paused
        ? 'P13 background processing paused'
        : 'P13 background processing resumed',
      detail: { controlKey, paused: input.paused, reason, actorId: input.actorId ?? null },
      resourceType: 'ops_control',
    });

    this.logger.warn(
      `Ops control ${controlKey} -> paused=${input.paused} reason=${reason ?? '-'} actor=${input.actorId ?? 'system'}`,
    );

    return this.state(controlKey);
  }

  async history(controlKey: string = P13_PAUSE_CONTROL_KEY, limit = 50): Promise<ControlChange[]> {
    const rows = readRows<{
      control_key: string;
      paused: boolean;
      reason: string | null;
      actor_id: string | null;
      changed_at: unknown;
    }>(await this.db.db.execute(sql`
      SELECT control_key, paused, reason, actor_id, changed_at
      FROM ops_control_audit
      WHERE control_key = ${controlKey}
      ORDER BY changed_at DESC
      LIMIT ${limit}
    `));

    return rows.map((r) => ({
      controlKey: r.control_key,
      paused: r.paused === true,
      reason: r.reason,
      actorId: r.actor_id,
      changedAt: toDate(r.changed_at) ?? new Date(0),
    }));
  }
}
