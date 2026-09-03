import { pgTable, uuid, varchar, char, boolean, integer, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { stores } from '../merchant/merchant.schema';
import { productVariants } from '../catalog/catalog.schema';

/**
 * Pricing schema (migration 0006_pricing)
 *
 * - price_lists: group pricing rules by store/channel/audience
 * - price_tiers: quantity-based tiers per variant per price list
 * - unit_price_minor: price in smallest currency unit (halalas for SAR)
 */

export const priceLists = pgTable('price_lists', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  currency: char('currency', { length: 3 }).notNull().default('SAR'),
  channel: varchar('channel', { length: 8 }).notNull().default('B2B'),
  audience: varchar('audience', { length: 16 }).notNull().default('PUBLIC'),
  segmentId: uuid('segment_id'),
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priceTiers = pgTable('price_tiers', {
  id: uuid('id').primaryKey(),
  priceListId: uuid('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  minQty: integer('min_qty').notNull().default(1),
  maxQty: integer('max_qty'),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
