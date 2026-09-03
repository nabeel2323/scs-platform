import { pgTable, uuid, varchar, text, smallint, boolean, integer, jsonb, timestamp, numeric, decimal } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { orders } from '../orders/orders.schema';

/**
 * Reviews schema (migration 0011_trust)
 *
 * - reviews: order-gated, one per subject per order
 * - trust_snapshots: periodic trust metrics per entity
 */

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
  subjectId: uuid('subject_id').notNull(),
  subjectType: varchar('subject_type', { length: 16 }).notNull(),
  rating: smallint('rating').notNull(),
  title: varchar('title', { length: 200 }),
  body: text('body'),
  dimensions: jsonb('dimensions').notNull().default({}),
  isVerified: boolean('is_verified').notNull().default(true),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trustSnapshots = pgTable('trust_snapshots', {
  id: uuid('id').primaryKey(),
  entityId: uuid('entity_id').notNull(),
  entityType: varchar('entity_type', { length: 16 }).notNull(),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }),
  totalReviews: integer('total_reviews').notNull().default(0),
  dimensions: jsonb('dimensions').notNull().default({}),
  badges: jsonb('badges').notNull().default([]),
  score: numeric('score', { precision: 5, scale: 2 }).notNull().default('0'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
