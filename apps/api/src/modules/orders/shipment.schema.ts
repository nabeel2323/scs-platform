import { pgTable, uuid, varchar, text, timestamp, jsonb, serial, integer } from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { stores } from '../merchant/merchant.schema';
import { orders } from './orders.schema';

/**
 * Shipment schema (migration 0040_shipments, extended by 0041_shipping)
 *
 * - shipments: one fulfillment shipment per merchant sub-order
 * - shipment_events: append-only audit trail of fulfillment transitions
 *
 * A master order with multiple merchants produces multiple shipments —
 * one per sub-order. Each shipment track its own fulfillment lifecycle
 * independently.
 *
 * M7.2 extensions (0041):
 * - deliveryAddress: JSONB address snapshot at createShipment() time
 * - carrierTrackingId: external carrier tracking number
 * - shippingMethodId: FK to shipping_methods (nullable until assigned)
 * - shippingProviderKey: which provider handles this shipment
 */

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  status: varchar('status', { length: 24 }).notNull().default('PREPARING'),
  assignedDriverId: uuid('assigned_driver_id').references(() => users.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  outForDeliveryAt: timestamp('out_for_delivery_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // M7.2 extensions (0041_shipping)
  deliveryAddress: jsonb('delivery_address'),
  carrierTrackingId: varchar('carrier_tracking_id', { length: 120 }),
  shippingMethodId: uuid('shipping_method_id'),
  shippingProviderKey: varchar('shipping_provider_key', { length: 40 }),
});

export const shipmentEvents = pgTable('shipment_events', {
  id: uuid('id').primaryKey(),
  shipmentId: uuid('shipment_id').notNull().references(() => shipments.id),
  eventType: varchar('event_type', { length: 24 }).notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 16 }).notNull().default('MERCHANT'),
  locationText: varchar('location_text', { length: 300 }),
  notes: text('notes'),
  metadata: jsonb('metadata').notNull().default({}),
  sequence: serial('sequence').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
