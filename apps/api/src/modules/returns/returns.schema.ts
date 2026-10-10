import {
  pgTable, uuid, varchar, text, integer, bigint, jsonb, timestamp,
} from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { orders, orderItems } from '../orders/orders.schema';
import { paymentRecords, refunds } from '../payments/payments.schema';

/**
 * Returns schema (migration 0059_return_requests)
 *
 * P13 — Returns, Refunds & Disputes Integration
 *
 * - return_requests: buyer-initiated return lifecycle (12-state FSM)
 * - return_request_items: per-line return details with condition tracking
 * - return_request_events: append-only return lifecycle log
 *
 * All amounts are integer minor units of the order's currency.
 */

// ── Return Requests ─────────────────────────────────────────────

export const returnRequests = pgTable('return_requests', {
  id: uuid('id').primaryKey(),
  subOrderId: uuid('sub_order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  paymentRecordId: uuid('payment_record_id').notNull().references(() => paymentRecords.id, { onDelete: 'cascade' }),
  buyerId: uuid('buyer_id').notNull().references(() => users.id),
  refundId: uuid('refund_id'),  // FK added via migration; set after refund created
  status: varchar('status', { length: 30 }).notNull().default('REQUESTED'),
  reason: varchar('reason', { length: 40 }).notNull(),
  description: text('description'),
  evidenceUrls: jsonb('evidence_urls').notNull().default([]),
  requestedRefundMinor: bigint('requested_refund_minor', { mode: 'number' }).notNull(),
  actualRefundMinor: bigint('actual_refund_minor', { mode: 'number' }),
  shippingTrackingNumber: varchar('shipping_tracking_number', { length: 200 }),
  shippingNotes: text('shipping_notes'),
  merchantNotes: text('merchant_notes'),
  inspectionCondition: varchar('inspection_condition', { length: 20 }),
  inspectionNotes: text('inspection_notes'),
  inspectedBy: uuid('inspected_by').references(() => users.id),
  inspectedAt: timestamp('inspected_at', { withTimezone: true }),
  idempotencyKey: varchar('idempotency_key', { length: 120 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Return Request Items ────────────────────────────────────────

export const returnRequestItems = pgTable('return_request_items', {
  id: uuid('id').primaryKey(),
  returnRequestId: uuid('return_request_id').notNull().references(() => returnRequests.id, { onDelete: 'cascade' }),
  orderItemId: uuid('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  condition: varchar('condition', { length: 20 }),  // set during inspection
  inventoryItemId: uuid('inventory_item_id'),  // resolved during inspection
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Return Request Events (append-only) ─────────────────────────

export const returnRequestEvents = pgTable('return_request_events', {
  id: uuid('id').primaryKey(),
  returnRequestId: uuid('return_request_id').notNull().references(() => returnRequests.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 40 }).notNull(),
  fromStatus: varchar('from_status', { length: 30 }),
  toStatus: varchar('to_status', { length: 30 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 16 }).notNull().default('SYSTEM'),
  notes: text('notes'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
