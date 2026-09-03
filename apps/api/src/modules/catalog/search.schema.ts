import { pgTable, uuid, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { stores } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';

/**
 * Search schema (migration 0007_search)
 *
 * - search_queries: tracks search history for analytics
 * - FTS indexes are created via raw SQL in the migration
 * - Arabic normalization function is a DB-level function
 */

export const searchQueries = pgTable('search_queries', {
  id: uuid('id').primaryKey(),
  queryText: text('query_text').notNull(),
  normalizedText: text('normalized_text').notNull(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  resultsCount: integer('results_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
