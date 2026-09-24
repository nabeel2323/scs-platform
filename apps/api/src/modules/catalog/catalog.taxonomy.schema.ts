import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { categories, products, productVariants } from './catalog.schema';

/**
 * Catalog taxonomy schema (migrations 0023_attributes, 0024_product_types).
 *
 * PHASE 2 domain model — the platform-governed attribute + product-type layer.
 * Additive only: nothing here is referenced by the existing product/variant
 * flows yet, so current functionality is unaffected. The canonical link
 * (products.product_type_id, attribute-value tables, merchant offers) is
 * introduced in later phases.
 *
 * Naming mirrors catalog.schema.ts: snake_case columns, `varchar` status/type
 * columns (no pgEnum, consistent with the rest of the schema), `metadata jsonb`,
 * `*_ar` Arabic twins, timestamps with timezone.
 */

/** Mandatory attribute scopes (§10): where a value lives. */
export type AttributeScope = 'PRODUCT' | 'VARIANT' | 'OFFER';

/** Supported attribute value types (§8). */
export type AttributeType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'COLOR'
  | 'URL'
  | 'FILE'
  | 'MEASUREMENT'
  | 'CURRENCY';

export const attributeDefinitions = pgTable('attribute_definitions', {
  id: uuid('id').primaryKey(),
  code: varchar('code', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  nameAr: varchar('name_ar', { length: 200 }),
  description: text('description'),
  type: varchar('type', { length: 20 }).notNull().default('TEXT'),
  unit: varchar('unit', { length: 40 }),
  scope: varchar('scope', { length: 16 }).notNull().default('PRODUCT'),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  validation: jsonb('validation').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attributeOptions = pgTable('attribute_options', {
  id: uuid('id').primaryKey(),
  attributeId: uuid('attribute_id')
    .notNull()
    .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
  value: varchar('value', { length: 200 }).notNull(),
  valueAr: varchar('value_ar', { length: 200 }),
  label: varchar('label', { length: 200 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attributeGroups = pgTable('attribute_groups', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 120 }),
  kind: varchar('kind', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productTypes = pgTable('product_types', {
  id: uuid('id').primaryKey(),
  code: varchar('code', { length: 80 }).notNull(),
  version: integer('version').notNull().default(1),
  name: varchar('name', { length: 200 }).notNull(),
  nameAr: varchar('name_ar', { length: 200 }),
  description: text('description'),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  variantDimensions: jsonb('variant_dimensions').notNull().default([]),
  metadata: jsonb('metadata').notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productTypeAttributes = pgTable('product_type_attributes', {
  id: uuid('id').primaryKey(),
  productTypeId: uuid('product_type_id')
    .notNull()
    .references(() => productTypes.id, { onDelete: 'cascade' }),
  attributeDefinitionId: uuid('attribute_definition_id')
    .notNull()
    .references(() => attributeDefinitions.id, { onDelete: 'restrict' }),
  groupId: uuid('group_id').references(() => attributeGroups.id, { onDelete: 'set null' }),
  required: boolean('required').notNull().default(false),
  scope: varchar('scope', { length: 16 }).notNull().default('PRODUCT'),
  displayOrder: integer('display_order').notNull().default(0),
  filterable: boolean('filterable').notNull().default(false),
  searchable: boolean('searchable').notNull().default(false),
  sortable: boolean('sortable').notNull().default(false),
  comparable: boolean('comparable').notNull().default(false),
  visibleInListing: boolean('visible_in_listing').notNull().default(true),
  visibleInDetail: boolean('visible_in_detail').notNull().default(true),
  allowedValues: jsonb('allowed_values').notNull().default([]),
  validationRules: jsonb('validation_rules').notNull().default({}),
  conditionalRules: jsonb('conditional_rules').notNull().default([]),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A single typed attribute value (§17/§19, PHASE 3 migration 0025). The value is
 * stored in the column matching its `AttributeType` (never one JSON blob) so
 * facets, filters and comparison query it directly. Exactly one of the value
 * columns is populated per row; `option_value` carries the controlled SELECT.
 * `value_number` is NUMERIC (returned as a string by Drizzle) and coerced by the
 * service.
 */
export const productAttributeValues = pgTable('product_attribute_values', {
  id: uuid('id').primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  attributeDefinitionId: uuid('attribute_definition_id')
    .notNull()
    .references(() => attributeDefinitions.id, { onDelete: 'restrict' }),
  valueText: text('value_text'),
  valueNumber: numeric('value_number'),
  valueBoolean: boolean('value_boolean'),
  optionValue: varchar('option_value', { length: 200 }),
  valueJson: jsonb('value_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const variantAttributeValues = pgTable('variant_attribute_values', {
  id: uuid('id').primaryKey(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, { onDelete: 'cascade' }),
  attributeDefinitionId: uuid('attribute_definition_id')
    .notNull()
    .references(() => attributeDefinitions.id, { onDelete: 'restrict' }),
  valueText: text('value_text'),
  valueNumber: numeric('value_number'),
  valueBoolean: boolean('value_boolean'),
  optionValue: varchar('option_value', { length: 200 }),
  valueJson: jsonb('value_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
