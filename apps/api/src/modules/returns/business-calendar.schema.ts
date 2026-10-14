import {
  pgTable, uuid, varchar, integer, boolean, jsonb, timestamp, time, date,
} from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';

/**
 * Business calendar schema (migration 0060_escalated_and_business_calendar)
 *
 * P13 Phase 2 — Configurable business calendar for SLA deadline calculation.
 *
 * - business_calendars: working-day/hour configuration per tenant or global
 * - business_calendar_holidays: per-calendar holiday dates
 * - business_calendar_audit: append-only audit log for configuration changes
 *
 * All times stored as UTC-aware types. The default calendar uses UTC.
 */

// ── Business Calendars ──────────────────────────────────────────

export const businessCalendars = pgTable('business_calendars', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
  startTime: time('start_time').notNull().default('08:00:00'),
  endTime: time('end_time').notNull().default('18:00:00'),
  workingDays: integer('working_days').array().notNull().default([1, 2, 3, 4, 5]),
  isDefault: boolean('is_default').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Business Calendar Holidays ──────────────────────────────────

export const businessCalendarHolidays = pgTable('business_calendar_holidays', {
  id: uuid('id').primaryKey(),
  calendarId: uuid('calendar_id').notNull().references(() => businessCalendars.id, { onDelete: 'cascade' }),
  holidayDate: date('holiday_date').notNull(),
  description: varchar('description', { length: 200 }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Business Calendar Audit ─────────────────────────────────────

export const businessCalendarAudit = pgTable('business_calendar_audit', {
  id: uuid('id').primaryKey(),
  calendarId: uuid('calendar_id').notNull().references(() => businessCalendars.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 40 }).notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
