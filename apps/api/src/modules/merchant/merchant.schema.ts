import { pgTable, uuid, varchar, char, text, boolean, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../identity/identity.schema';

/**
 * Merchant & store schema (migration 0003_merchant)
 *
 * - Stores are merchant storefronts linked to organizations
 * - Warehouses are physical inventory locations per store
 * - Business documents are uploaded for verification
 * - Verification requests track the merchant review workflow
 */

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  coverUrl: text('cover_url'),
  currency: char('currency', { length: 3 }).notNull().default('SAR'),
  timezone: varchar('timezone', { length: 60 }).notNull().default('Asia/Riyadh'),
  locale: varchar('locale', { length: 10 }).notNull().default('ar'),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  verificationStatus: varchar('verification_status', { length: 16 }).notNull().default('PENDING'),
  address: jsonb('address').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  address: jsonb('address').notNull().default({}),
  managerName: varchar('manager_name', { length: 160 }),
  managerPhone: varchar('manager_phone', { length: 20 }),
  status: varchar('status', { length: 12 }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessDocuments = pgTable('business_documents', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
  docType: varchar('doc_type', { length: 40 }).notNull(),
  fileName: varchar('file_name', { length: 260 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull().default('application/pdf'),
  fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
  storageKey: text('storage_key').notNull(),
  storageUrl: text('storage_url'),
  verificationStatus: varchar('verification_status', { length: 16 }).notNull().default('PENDING'),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verificationRequests = pgTable('verification_requests', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('SUBMITTED'),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  rejectionReasons: jsonb('rejection_reasons').default([]),
  autoVerified: boolean('auto_verified').notNull().default(false),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
