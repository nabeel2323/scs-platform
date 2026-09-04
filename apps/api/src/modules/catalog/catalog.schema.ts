import { pgTable, uuid, varchar, text, boolean, integer, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { stores } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';

/**
 * Catalog schema (migration 0004_catalog)
 *
 * - Categories use materialized path for hierarchy
 * - Brands are platform-level
 * - Products belong to a store; soft-deleted via deleted_at
 * - Variants are the purchasable SKUs
 * - Media is managed separately for rich ordering/thumbnails
 * - Import jobs track bulk catalog imports
 */

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => categories.id, { onDelete: 'set null' }),
  path: text('path').notNull().default('/'),
  slug: varchar('slug', { length: 120 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  nameAr: varchar('name_ar', { length: 200 }),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  productCount: integer('product_count').notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  nameAr: varchar('name_ar', { length: 200 }),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  logoUrl: text('logo_url'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  slug: varchar('slug', { length: 200 }).notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  titleAr: varchar('title_ar', { length: 300 }),
  description: text('description'),
  descriptionAr: text('description_ar'),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  condition: varchar('condition', { length: 16 }).notNull().default('NEW'),
  isAvailable: boolean('is_available').notNull().default(false),
  moq: integer('moq').notNull().default(1),
  images: jsonb('images').notNull().default([]),
  attributes: jsonb('attributes').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: varchar('sku', { length: 100 }).notNull(),
  barcode: varchar('barcode', { length: 60 }),
  title: varchar('title', { length: 300 }),
  titleAr: varchar('title_ar', { length: 300 }),
  unit: varchar('unit', { length: 30 }).notNull().default('PCS'),
  weightGrams: integer('weight_grams'),
  dimensionsMm: jsonb('dimensions_mm').default({}),
  attributes: jsonb('attributes').notNull().default({}),
  images: jsonb('images').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productMedia = pgTable('product_media', {
  id: uuid('id').primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  mediaType: varchar('media_type', { length: 16 }).notNull().default('IMAGE'),
  url: text('url').notNull(),
  thumbUrl: text('thumb_url'),
  blurhash: varchar('blurhash', { length: 60 }),
  altText: varchar('alt_text', { length: 300 }),
  altTextAr: varchar('alt_text_ar', { length: 300 }),
  sortOrder: integer('sort_order').notNull().default(0),
  fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
  mimeType: varchar('mime_type', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 260 }).notNull(),
  fileType: varchar('file_type', { length: 10 }).notNull().default('XLSX'),
  fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
  storageKey: text('storage_key').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('UPLOADED'),
  totalRows: integer('total_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  errorRows: integer('error_rows').notNull().default(0),
  columnMapping: jsonb('column_mapping').default({}),
  errorLog: jsonb('error_log').default([]),
  stats: jsonb('stats').notNull().default({}),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
