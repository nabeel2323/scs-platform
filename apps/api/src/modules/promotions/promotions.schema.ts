import { pgTable, uuid, varchar, text, boolean, integer, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { stores } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';

/**
 * Promotions schema (migration 0008_promotions)
 *
 * - promotions: discount rules per store with scope (STORE/CATEGORY/PRODUCT/VARIANT)
 * - promotion_redemptions: tracks each usage for analytics + per-user limits
 */

export const promotions = pgTable('promotions', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 40 }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  promoType: varchar('promo_type', { length: 20 }).notNull(),
  scope: varchar('scope', { length: 16 }).notNull().default('STORE'),
  scopeId: uuid('scope_id'),
  discountValue: bigint('discount_value', { mode: 'number' }).notNull(),
  minOrderMinor: bigint('min_order_minor', { mode: 'number' }).default(0),
  maxDiscountMinor: bigint('max_discount_minor', { mode: 'number' }),
  maxRedemptions: integer('max_redemptions'),
  redemptionCount: integer('redemption_count').notNull().default(0),
  perUserLimit: integer('per_user_limit').default(1),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promotionRedemptions = pgTable('promotion_redemptions', {
  id: uuid('id').primaryKey(),
  promotionId: uuid('promotion_id').notNull().references(() => promotions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  orderId: uuid('order_id'),
  codeUsed: varchar('code_used', { length: 40 }),
  discountMinor: bigint('discount_minor', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
