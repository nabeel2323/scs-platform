import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { productVariants } from '../catalog/catalog.schema';
import { warehouses } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';

/**
 * Inventory schema (migration 0005_inventory)
 *
 * - inventory_items: one row per (variant, warehouse) combination
 * - stock_movements: append-only ledger of all stock changes
 * - qty_available is a generated column (qty_on_hand - qty_reserved)
 */

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey(),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  qtyOnHand: integer('qty_on_hand').notNull().default(0),
  qtyReserved: integer('qty_reserved').notNull().default(0),
  reorderPoint: integer('reorder_point').notNull().default(0),
  maxStock: integer('max_stock'),
  lowStockAlert: boolean('low_stock_alert').notNull().default(true),
  lastCountedAt: timestamp('last_counted_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey(),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  movementType: varchar('movement_type', { length: 16 }).notNull(),
  quantity: integer('quantity').notNull(),
  referenceType: varchar('reference_type', { length: 40 }),
  referenceId: uuid('reference_id'),
  reason: text('reason'),
  performedBy: uuid('performed_by').references(() => users.id),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
