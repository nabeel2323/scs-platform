import {
  pgTable, uuid, varchar, char, text, integer, bigint, boolean,
  jsonb, timestamp, numeric,
} from 'drizzle-orm/pg-core';
import { stores } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';
import { organizations } from '../identity/identity.schema';
import { shipments } from '../orders/shipment.schema';

/**
 * Shipping & Delivery schema (migration 0041_shipping)
 *
 * New tables for M7.2:
 * - shippingMethods: per-store shipping options (STANDARD/EXPRESS/SAME_DAY)
 * - deliveryZones: geographic zones for shipping availability
 * - deliveryZoneMethods: zone↔method mapping with optional fee override
 * - shipmentLabels: 1:1 label storage reference per shipment
 * - deliveryProofs: 1:1 proof-of-delivery (photo + signature) per shipment
 * - driverProfiles: driver eligibility metadata
 * - driverStoreAssignments: relational driver↔store assignment
 * - carrierWebhookEvents: inbound carrier webhook dedup log
 */

// ── Shipping Methods ────────────────────────────────────────────────────────

export const shippingMethods = pgTable('shipping_methods', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  name: varchar('name', { length: 80 }).notNull(),
  fulfillmentMethod: varchar('fulfillment_method', { length: 24 }).notNull(),
  type: varchar('type', { length: 24 }).notNull().default('STANDARD'),
  estimatedDaysMin: integer('estimated_days_min'),
  estimatedDaysMax: integer('estimated_days_max'),
  baseFeeMinor: bigint('base_fee_minor', { mode: 'number' }).notNull().default(0),
  currency: char('currency', { length: 3 }).notNull().default('SAR'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Delivery Zones ──────────────────────────────────────────────────────────

export const deliveryZones = pgTable('delivery_zones', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  name: varchar('name', { length: 120 }).notNull(),
  type: varchar('type', { length: 24 }).notNull().default('CITY'),
  city: varchar('city', { length: 120 }),
  region: varchar('region', { length: 120 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: char('country', { length: 2 }).notNull().default('SA'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Delivery Zone ↔ Shipping Method ─────────────────────────────────────────

export const deliveryZoneMethods = pgTable('delivery_zone_methods', {
  zoneId: uuid('zone_id').notNull().references(() => deliveryZones.id),
  shippingMethodId: uuid('shipping_method_id').notNull().references(() => shippingMethods.id),
  overrideFeeMinor: bigint('override_fee_minor', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: { primaryKey: true, columns: [table.zoneId, table.shippingMethodId] } as any,
}));

// ── Shipment Labels ─────────────────────────────────────────────────────────

export const shipmentLabels = pgTable('shipment_labels', {
  id: uuid('id').primaryKey(),
  shipmentId: uuid('shipment_id').notNull().references(() => shipments.id),
  labelNumber: varchar('label_number', { length: 120 }),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 80 }).notNull().default('application/pdf'),
  sizeBytes: integer('size_bytes'),
  trackingUrl: varchar('tracking_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Delivery Proofs ─────────────────────────────────────────────────────────

export const deliveryProofs = pgTable('delivery_proofs', {
  id: uuid('id').primaryKey(),
  shipmentId: uuid('shipment_id').notNull().references(() => shipments.id),
  photoUrl: varchar('photo_url', { length: 500 }),
  signatureUrl: varchar('signature_url', { length: 500 }),
  receiverName: varchar('receiver_name', { length: 120 }),
  notes: text('notes'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Driver Profiles ─────────────────────────────────────────────────────────

export const driverProfiles = pgTable('driver_profiles', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  vehicleType: varchar('vehicle_type', { length: 40 }),
  licenseNumber: varchar('license_number', { length: 80 }),
  isActive: boolean('is_active').notNull().default(true),
  maxDeliveryRadiusKm: integer('max_delivery_radius_km'),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('0.00'),
  totalDeliveries: integer('total_deliveries').notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Driver ↔ Store Assignments (relational) ─────────────────────────────────

export const driverStoreAssignments = pgTable('driver_store_assignments', {
  driverProfileId: uuid('driver_profile_id').notNull().references(() => driverProfiles.id),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: { primaryKey: true, columns: [table.driverProfileId, table.storeId] } as any,
}));

// ── Carrier Webhook Events (inbound dedup) ──────────────────────────────────

export const carrierWebhookEvents = pgTable('carrier_webhook_events', {
  id: uuid('id').primaryKey(),
  providerKey: varchar('provider_key', { length: 40 }).notNull(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  externalDeliveryId: varchar('external_delivery_id', { length: 200 }).notNull(),
  shipmentId: uuid('shipment_id').references(() => shipments.id),
  payload: jsonb('payload').notNull().default({}),
  processed: boolean('processed').notNull().default(false),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
