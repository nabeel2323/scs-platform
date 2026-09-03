import { pgTable, uuid, varchar, text, integer, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { stores } from '../merchant/merchant.schema';
import { productVariants } from '../catalog/catalog.schema';
import { promotions } from '../promotions/promotions.schema';

/**
 * Orders schema (migration 0010_orders)
 *
 * - master_orders: buyer's purchase intent (one per checkout)
 * - orders: sub-order per supplier (store)
 * - order_items: line items with SNAPSHOT prices (not FK to price_tiers)
 * - order_financial_breakdown: full financial picture per sub-order
 * - order_status_history: append-only audit trail of every status transition
 */

export const masterOrders = pgTable('master_orders', {
  id: uuid('id').primaryKey(),
  buyerId: uuid('buyer_id').notNull().references(() => users.id),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  deliveryAddress: jsonb('delivery_address').notNull().default({}),
  notes: text('notes'),
  idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  masterOrderId: uuid('master_order_id').notNull().references(() => masterOrders.id),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  buyerId: uuid('buyer_id').notNull().references(() => users.id),
  status: varchar('status', { length: 24 }).notNull().default('SUBMITTED'),
  fulfillmentMethod: varchar('fulfillment_method', { length: 24 }).notNull().default('PLATFORM_DELIVERY'),
  promoCode: varchar('promo_code', { length: 40 }),
  promotionId: uuid('promotion_id').references(() => promotions.id),
  subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull().default(0),
  discountMinor: bigint('discount_minor', { mode: 'number' }).notNull().default(0),
  deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull().default(0),
  taxMinor: bigint('tax_minor', { mode: 'number' }).notNull().default(0),
  totalMinor: bigint('total_minor', { mode: 'number' }).notNull().default(0),
  slaConfirmedAt: timestamp('sla_confirmed_at', { withTimezone: true }),
  slaAt: timestamp('sla_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id),
  sku: varchar('sku', { length: 100 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  quantity: integer('quantity').notNull(),
  qtyConfirmed: integer('qty_confirmed'),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
  tierMinQty: integer('tier_min_qty').notNull().default(1),
  promoSnapshot: jsonb('promo_snapshot').default({}),
  lineTotalMinor: bigint('line_total_minor', { mode: 'number' }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderFinancialBreakdown = pgTable('order_financial_breakdown', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id).unique(),
  productsMinor: bigint('products_minor', { mode: 'number' }).notNull().default(0),
  discountMinor: bigint('discount_minor', { mode: 'number' }).notNull().default(0),
  deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull().default(0),
  taxMinor: bigint('tax_minor', { mode: 'number' }).notNull().default(0),
  commissionMinor: bigint('commission_minor', { mode: 'number' }).notNull().default(0),
  merchantNetMinor: bigint('merchant_net_minor', { mode: 'number' }).notNull().default(0),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  fromStatus: varchar('from_status', { length: 24 }),
  toStatus: varchar('to_status', { length: 24 }).notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  actorType: varchar('actor_type', { length: 16 }).notNull().default('SYSTEM'),
  reason: text('reason'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
