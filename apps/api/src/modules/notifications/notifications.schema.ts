import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';

/**
 * Notifications schema (migration 0012_comms)
 *
 * - notifications: all outbound notifications with delivery tracking
 * - notification_preferences: per-user opt-in per type+channel
 * - device_tokens: FCM/APNs tokens for push
 */

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(),
  channel: varchar('channel', { length: 16 }).notNull(),
  template: varchar('template', { length: 64 }).notNull(),
  title: varchar('title', { length: 200 }),
  body: text('body').notNull(),
  data: jsonb('data').notNull().default({}),
  status: varchar('status', { length: 16 }).notNull().default('PENDING'),
  provider: varchar('provider', { length: 32 }),
  providerMsgId: varchar('provider_msg_id', { length: 128 }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(),
  channel: varchar('channel', { length: 16 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 500 }).notNull(),
  platform: varchar('platform', { length: 16 }).notNull(),
  appVersion: varchar('app_version', { length: 20 }),
  isActive: boolean('is_active').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
