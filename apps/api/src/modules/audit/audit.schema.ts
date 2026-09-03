import { pgTable, uuid, varchar, char, boolean, timestamp, text, inet, jsonb, integer } from 'drizzle-orm/pg-core';

/**
 * Platform infrastructure schema (migration 0002_platform)
 *
 * - audit_logs: append-only audit trail
 * - outbox_events: transactional outbox for domain events
 * - feature_flags: runtime feature toggles
 * - analytics_events: partitioned analytics event store
 */

// ── Audit Logs ───────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey(),
  actorType: varchar('actor_type', { length: 20 }).notNull(),
  actorId: uuid('actor_id'),
  action: varchar('action', { length: 60 }).notNull(),
  resource: varchar('resource', { length: 60 }).notNull(),
  resourceId: uuid('resource_id'),
  orgId: uuid('org_id'),
  metadata: jsonb('metadata').notNull().default({}),
  ip: inet('ip'),
  userAgent: varchar('user_agent', { length: 300 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Outbox Events ────────────────────────────────────────────

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  aggregateId: uuid('aggregate_id'),
  payload: jsonb('payload').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  status: varchar('status', { length: 16 }).notNull().default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Feature Flags ────────────────────────────────────────────

export const featureFlags = pgTable('feature_flags', {
  key: varchar('key', { length: 80 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: varchar('description', { length: 300 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Analytics Events (partitioned) ───────────────────────────

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').notNull(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  userId: uuid('user_id'),
  orgId: uuid('org_id'),
  sessionId: varchar('session_id', { length: 64 }),
  properties: jsonb('properties').notNull().default({}),
  device: varchar('device', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: { primaryKey: { columns: [table.id, table.createdAt] } },
}));
