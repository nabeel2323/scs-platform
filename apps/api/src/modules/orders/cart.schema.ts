import { pgTable, uuid, varchar, integer, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { stores } from '../merchant/merchant.schema';
import { productVariants } from '../catalog/catalog.schema';
import { promotions } from '../promotions/promotions.schema';

/**
 * Cart schema (migration 0009_cart)
 *
 * - carts: one active cart per user, converted to order on checkout
 * - cart_items: grouped by store_id for multi-supplier support
 * - price_minor is SNAPSHOT at add time (not live from price list)
 */

export const carts = pgTable('carts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  promoCode: varchar('promo_code', { length: 40 }),
  promotionId: uuid('promotion_id').references(() => promotions.id),
  totalMinor: bigint('total_minor', { mode: 'number' }).notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  id: uuid('id').primaryKey(),
  cartId: uuid('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id),
  quantity: integer('quantity').notNull().default(1),
  priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
  tierMinQty: integer('tier_min_qty').notNull().default(1),
  promoSnapshot: jsonb('promo_snapshot').default({}),
  lineTotalMinor: bigint('line_total_minor', { mode: 'number' }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
