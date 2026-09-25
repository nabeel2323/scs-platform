import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';

/**
 * Platform-level catalog import schema (migration 0034_catalog_imports).
 *
 * Tracks administrator-initiated Excel imports that populate the canonical
 * catalog entities (categories, brands, attributes, product types, products,
 * variants).  Separate from the store-scoped `import_jobs` in catalog.schema.ts
 * which handles merchant-level bulk product uploads.
 */

export type CatalogImportStatus =
  | 'UPLOADED'
  | 'PARSING'
  | 'VALIDATING'
  | 'READY'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'CANCELLED';

export type CatalogImportType =
  | 'FULL_CATALOG'
  | 'PRODUCTS'
  | 'CATEGORIES'
  | 'BRANDS'
  | 'ATTRIBUTES'
  | 'PRODUCT_TYPES';

export type ImportErrorSeverity = 'ERROR' | 'WARNING';

export const catalogImports = pgTable('catalog_imports', {
  id: uuid('id').primaryKey(),
  fileName: varchar('file_name', { length: 260 }).notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
  fileType: varchar('file_type', { length: 10 }).notNull().default('XLSX'),
  storageKey: text('storage_key').notNull(),
  importType: varchar('import_type', { length: 30 }).notNull().default('FULL_CATALOG'),
  status: varchar('status', { length: 30 }).notNull().default('UPLOADED'),
  totalRows: integer('total_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  createdRows: integer('created_rows').notNull().default(0),
  updatedRows: integer('updated_rows').notNull().default(0),
  unchangedRows: integer('unchanged_rows').notNull().default(0),
  rejectedRows: integer('rejected_rows').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  stats: jsonb('stats').notNull().default({}),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogImportErrors = pgTable('catalog_import_errors', {
  id: uuid('id').primaryKey(),
  importId: uuid('import_id')
    .notNull()
    .references(() => catalogImports.id, { onDelete: 'cascade' }),
  sheet: varchar('sheet', { length: 60 }),
  rowNumber: integer('row_number'),
  entityType: varchar('entity_type', { length: 40 }),
  externalKey: varchar('external_key', { length: 200 }),
  field: varchar('field', { length: 80 }),
  errorCode: varchar('error_code', { length: 40 }),
  errorMessage: text('error_message'),
  rawValue: text('raw_value'),
  suggestedFix: text('suggested_fix'),
  severity: varchar('severity', { length: 10 }).notNull().default('ERROR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
