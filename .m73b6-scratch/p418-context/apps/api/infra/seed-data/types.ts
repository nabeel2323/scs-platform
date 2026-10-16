/**
 * Production Catalog Seed Data — Shared type definitions.
 *
 * These types describe the shape of every seed-data module so the orchestrator
 * can process them generically.  They are intentionally decoupled from the
 * Drizzle schema types — the seed maps them to SQL at insert time.
 */

// ── Category ────────────────────────────────────────────────────────────────

export interface SeedCategory {
  /** Deterministic slug — also used as the external reference. */
  slug: string;
  name: string;
  nameAr?: string;
  description?: string;
  /** Slug of the parent category (undefined = root). */
  parentSlug?: string;
  sortOrder?: number;
}

// ── Brand ───────────────────────────────────────────────────────────────────

export interface SeedBrand {
  slug: string;
  name: string;
  nameAr?: string;
  description?: string;
}

// ── Attribute ───────────────────────────────────────────────────────────────

export type SeedAttributeType =
  | 'TEXT' | 'LONG_TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN'
  | 'DATE' | 'DATETIME' | 'SELECT' | 'MULTI_SELECT'
  | 'COLOR' | 'URL' | 'FILE' | 'MEASUREMENT' | 'CURRENCY';

export type SeedAttributeScope = 'PRODUCT' | 'VARIANT' | 'OFFER';

export interface SeedAttributeOption {
  value: string;
  valueAr?: string;
  label?: string;
  sortOrder?: number;
}

export interface SeedAttribute {
  /** Unique code — the stable external reference. */
  code: string;
  name: string;
  nameAr?: string;
  description?: string;
  type: SeedAttributeType;
  unit?: string;
  scope: SeedAttributeScope;
  /** Options for SELECT / MULTI_SELECT types. */
  options?: SeedAttributeOption[];
  validation?: Record<string, unknown>;
}

// ── Attribute Group ─────────────────────────────────────────────────────────

export interface SeedAttributeGroup {
  /** Unique name — used as the reference key. */
  name: string;
  nameAr?: string;
  kind?: string;
}

// ── Product Type ────────────────────────────────────────────────────────────

export interface SeedTypeAttributeConfig {
  /** Attribute code (references SeedAttribute.code). */
  attributeCode: string;
  /** Group name (references SeedAttributeGroup.name). */
  groupName?: string;
  required?: boolean;
  scope?: SeedAttributeScope;
  displayOrder?: number;
  filterable?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  comparable?: boolean;
  visibleInListing?: boolean;
  visibleInDetail?: boolean;
  allowedValues?: string[];
  validationRules?: Record<string, unknown>;
}

export interface SeedProductType {
  code: string;
  name: string;
  nameAr?: string;
  description?: string;
  /** Category slug reference. */
  categorySlug?: string;
  /** Attribute codes that define the variant matrix. */
  variantDimensions?: string[];
  attributes?: SeedTypeAttributeConfig[];
}

// ── Product & Variant ───────────────────────────────────────────────────────

/** A typed attribute value — exactly one value field populated. */
export interface SeedAttributeValue {
  /** Attribute code reference. */
  attributeCode: string;
  text?: string;
  number?: number;
  boolean?: boolean;
  option?: string;
  json?: unknown;
}

export interface SeedVariant {
  /** SKU — unique within the product. */
  sku: string;
  title?: string;
  titleAr?: string;
  barcode?: string;
  unit?: string;
  weightGrams?: number;
  /** Variant-scope attribute values. */
  attributes?: SeedAttributeValue[];
}

export interface SeedProduct {
  /** Deterministic slug — used as external reference. */
  slug: string;
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  /** Brand slug reference. */
  brandSlug: string;
  /** Product type code reference. */
  productTypeCode: string;
  /** Category slug reference. */
  categorySlug: string;
  /** Manufacturer part number (verified only). */
  mpn?: string;
  /** Verified GTIN (null = unverified). */
  gtin?: string | null;
  /** Verified EAN (null = unverified). */
  ean?: string | null;
  condition?: 'NEW' | 'USED' | 'REFURBISHED';
  /** Product-scope attribute values. */
  attributes?: SeedAttributeValue[];
  variants?: SeedVariant[];
}

// ── Seed Result ─────────────────────────────────────────────────────────────

export interface CatalogSeedResult {
  categories: { created: number; reused: number };
  brands: { created: number; reused: number };
  attributeGroups: { created: number; reused: number };
  attributeDefinitions: { created: number; reused: number };
  attributeOptions: { created: number; reused: number };
  productTypes: { created: number; reused: number };
  productTypeAttributes: { created: number; reused: number };
  products: { created: number; reused: number };
  variants: { created: number; reused: number };
  productAttributeValues: { created: number; reused: number };
  variantAttributeValues: { created: number; reused: number };
  merchantOffers: { created: number; reused: number };
  profile: 'production' | 'demo';
}
