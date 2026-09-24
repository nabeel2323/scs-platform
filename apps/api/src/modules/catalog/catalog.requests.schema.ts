import { pgTable, uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { stores } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';

/**
 * PHASE COS-12: Merchant catalog entity requests.
 * Merchants propose new categories, brands, attributes, or attribute options.
 * Admins approve (auto-creating the entity) or reject with a reason.
 */
export const catalogRequests = pgTable('catalog_requests', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id),
  requestedBy: uuid('requested_by').references(() => users.id),
  type: varchar('type', { length: 20 }).notNull(), // CATEGORY | BRAND | ATTRIBUTE | OPTION
  payload: jsonb('payload').notNull().default({}),
  status: varchar('status', { length: 16 }).notNull().default('PENDING'), // PENDING | APPROVED | REJECTED
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewReason: text('review_reason'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
