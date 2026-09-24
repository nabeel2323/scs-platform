import {
  pgTable,
  uuid,
  varchar,
  char,
  text,
  boolean,
  integer,
  bigint,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { stores, warehouses } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';
import { priceLists } from '../pricing/pricing.schema';
import { products, productVariants } from './catalog.schema';

/**
 * Merchant Offer schema (migration 0026_merchant_offers).
 *
 * PHASE 4 domain model — the "how a merchant sells it" side of the
 * canonical-product split. One canonical product/variant may carry MANY offers
 * (one per store), so price/stock/MOQ/lead-time hang off the offer, not the
 * product. This file is purely additive: nothing here is consumed by the live
 * cart/checkout/price-resolver path yet (that rewiring is the approval-gated
 * Phase 4b), so current purchasing behaviour is unaffected.
 *
 * Status lifecycle: DRAFT | PROPOSED | ACTIVE | SUSPENDED | REJECTED | WITHDRAWN.
 * `variant_id` null ⇒ product-level offer (default variant).
 */
export type OfferStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'WITHDRAWN';

export const merchantOffers = pgTable('merchant_offers', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  currency: char('currency', { length: 3 }).notNull().default('SAR'),
  basePriceMinor: bigint('base_price_minor', { mode: 'number' }),
  compareAtPriceMinor: bigint('compare_at_price_minor', { mode: 'number' }),
  moq: integer('moq').notNull().default(1),
  orderIncrement: integer('order_increment'),
  leadTimeDays: integer('lead_time_days'),
  isAvailable: boolean('is_available').notNull().default(true),
  // Pricing/stock are absorbed by reference: the offer points at the store's
  // price book (whose price_tiers hold the quantity ladder) and a warehouse
  // (whose inventory_items hold stock), rather than duplicating either.
  priceListId: uuid('price_list_id').references(() => priceLists.id, { onDelete: 'set null' }),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
  externalRef: varchar('external_ref', { length: 120 }),
  proposedBy: uuid('proposed_by').references(() => users.id),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
