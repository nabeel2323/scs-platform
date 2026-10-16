import {
  pgTable, uuid, varchar, integer, bigint, boolean, jsonb, timestamp,
} from 'drizzle-orm/pg-core';

/**
 * P13 Phase 4 — Operational readiness schema (migration 0063_phase4_operational_readiness)
 *
 * - workerLeases:       renewable exclusive lease + fencing epoch + heartbeat for protected jobs
 * - opsControls:        durable pause / kill-switch state
 * - opsControlAudit:    append-only evidence of every control change
 * - opsAlerts:          alert dedup, severity, and delivery confirmation
 * - p13PilotAllowlist:  org/store pilot eligibility allowlist
 *
 * `featureFlags` (migration 0002, extended here with provenance columns) is the
 * runtime toggle store; it stays declared in audit.schema.ts.
 *
 * org_id / store_id columns intentionally carry no FK, matching the 0062
 * precedent for the P13 financial tables.
 */

// ── Worker Leases ───────────────────────────────────────────────

export const workerLeases = pgTable('worker_leases', {
  leaseKey: varchar('lease_key', { length: 80 }).primaryKey(),
  holderId: varchar('holder_id', { length: 120 }),
  holderHost: varchar('holder_host', { length: 120 }),
  holderPid: integer('holder_pid'),
  /** Fencing token — incremented on every acquisition. */
  epoch: bigint('epoch', { mode: 'number' }).notNull().default(0),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  pollFailures: integer('poll_failures').notNull().default(0),
  lastErrorCode: varchar('last_error_code', { length: 60 }),
  lastJobAt: timestamp('last_job_at', { withTimezone: true }),
  lastJobSummary: varchar('last_job_summary', { length: 300 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Operational Controls ────────────────────────────────────────

export const opsControls = pgTable('ops_controls', {
  controlKey: varchar('control_key', { length: 80 }).primaryKey(),
  paused: boolean('paused').notNull().default(false),
  reason: varchar('reason', { length: 300 }),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsControlAudit = pgTable('ops_control_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  controlKey: varchar('control_key', { length: 80 }).notNull(),
  paused: boolean('paused').notNull(),
  reason: varchar('reason', { length: 300 }),
  actorId: uuid('actor_id'),
  actorKind: varchar('actor_kind', { length: 16 }).notNull().default('ADMIN'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Ops Alerts ──────────────────────────────────────────────────

export type OpsAlertStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SUPPRESSED'
  | 'RESOLVED';

export const opsAlerts = pgTable('ops_alerts', {
  id: uuid('id').primaryKey(),
  /** Unique across condition + resource so repeats update rather than re-notify. */
  dedupKey: varchar('dedup_key', { length: 200 }).notNull(),
  conditionKey: varchar('condition_key', { length: 80 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  detail: jsonb('detail').notNull().default({}),
  status: varchar('status', { length: 16 }).notNull().default('PENDING'),
  fireCount: integer('fire_count').notNull().default(1),
  suppressedCount: integer('suppressed_count').notNull().default(0),
  attemptCount: integer('attempt_count').notNull().default(0),
  deliveryChannel: varchar('delivery_channel', { length: 40 }),
  lastError: varchar('last_error', { length: 300 }),
  orgId: uuid('org_id'),
  resourceType: varchar('resource_type', { length: 60 }),
  resourceId: uuid('resource_id'),
  firstObservedAt: timestamp('first_observed_at', { withTimezone: true }).notNull().defaultNow(),
  lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── P13 Pilot Allowlist ─────────────────────────────────────────

export const p13PilotAllowlist = pgTable('p13_pilot_allowlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  /** NULL = the whole organization is eligible. */
  storeId: uuid('store_id'),
  enabled: boolean('enabled').notNull().default(true),
  note: varchar('note', { length: 300 }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
