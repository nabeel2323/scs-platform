import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { orders } from '../orders/orders.schema';

/**
 * Support/disputes schema (migration 0011_trust)
 *
 * - disputes: order-linked disputes with 72h window from DELIVERED
 * - dispute_events: append-only log of dispute actions
 * - conversations: order-linked chat only
 * - messages: individual messages within conversations
 */

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  raisedBy: uuid('raised_by').notNull().references(() => users.id),
  againstId: uuid('against_id').notNull().references(() => users.id),
  status: varchar('status', { length: 16 }).notNull().default('OPEN'),
  reason: text('reason').notNull(),
  resolution: text('resolution'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const disputeEvents = pgTable('dispute_events', {
  id: uuid('id').primaryKey(),
  disputeId: uuid('dispute_id').notNull().references(() => disputes.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  body: text('body'),
  attachments: jsonb('attachments').notNull().default([]),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  participant1: uuid('participant_1').notNull().references(() => users.id),
  participant2: uuid('participant_2').notNull().references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
