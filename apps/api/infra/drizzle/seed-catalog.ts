/**
 * Production Catalog Seed — Orchestrator.
 *
 * Seeds the full catalog taxonomy (categories, brands, attributes, product types)
 * and real IT products with typed attribute values.  Follows the seed-pg.ts
 * pattern: pg Pool, single transaction, idempotent upserts.
 *
 * Connection strategy mirrors seed-pg.ts:
 *   DATABASE_URL          — required
 *   PGSSLROOTCERT         — optional CA bundle for SSL (Supabase staging)
 *
 * Environment:
 *   CATALOG_SEED_PROFILE=production|demo  (default: production)
 *   "demo" also seeds merchant offers for ~20 popular variants.
 *
 * Usage:
 *   pnpm --filter @scs/api db:seed:catalog
 */

import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';

import { CATEGORIES } from '../seed-data/categories';
import { BRANDS } from '../seed-data/brands';
import { ATTRIBUTE_GROUPS, ATTRIBUTES } from '../seed-data/attributes';
import { PRODUCT_TYPES } from '../seed-data/product-types';
import { ALL_PRODUCTS } from '../seed-data/products';
import type { CatalogSeedResult, SeedAttributeValue } from '../seed-data/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic combination_key from a variant's attribute values.
 * The key is a sorted, pipe-delimited digest prefixed with a short hash.
 */
function computeCombinationKey(attrs: SeedAttributeValue[]): string | null {
  if (!attrs || attrs.length === 0) return null;
  const parts = attrs
    .filter(a => a.option !== undefined || a.number !== undefined || a.boolean !== undefined || a.text !== undefined)
    .map(a => {
      const val = a.option ?? a.text ?? String(a.number ?? a.boolean ?? '');
      return `${a.attributeCode}=${val}`;
    })
    .sort();
  if (parts.length === 0) return null;
  const raw = parts.join('|');
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return `${hash}:${raw.slice(0, 200)}`;
}

/** Upsert a single product-scope attribute value. */
async function upsertProductAttrValue(
  client: PoolClient, productId: string, defId: string, av: SeedAttributeValue,
  result: CatalogSeedResult,
): Promise<void> {
  const id = randomUUID();
  const res = await client.query(
    `INSERT INTO product_attribute_values (id, product_id, attribute_definition_id, value_text, value_number, value_boolean, option_value, value_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (product_id, attribute_definition_id) DO UPDATE SET
       value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
       value_boolean = EXCLUDED.value_boolean, option_value = EXCLUDED.option_value,
       value_json = EXCLUDED.value_json, updated_at = NOW()
     RETURNING id`,
    [id, productId, defId, av.text ?? null, av.number?.toString() ?? null, av.boolean ?? null, av.option ?? null, av.json ? JSON.stringify(av.json) : null],
  );
  if (res.rows[0].id === id) result.productAttributeValues.created++;
  else result.productAttributeValues.reused++;
}

/** Upsert a single variant-scope attribute value. */
async function upsertVariantAttrValue(
  client: PoolClient, variantId: string, defId: string, av: SeedAttributeValue,
  result: CatalogSeedResult,
): Promise<void> {
  const id = randomUUID();
  const res = await client.query(
    `INSERT INTO variant_attribute_values (id, variant_id, attribute_definition_id, value_text, value_number, value_boolean, option_value, value_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (variant_id, attribute_definition_id) DO UPDATE SET
       value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
       value_boolean = EXCLUDED.value_boolean, option_value = EXCLUDED.option_value,
       value_json = EXCLUDED.value_json, updated_at = NOW()
     RETURNING id`,
    [id, variantId, defId, av.text ?? null, av.number?.toString() ?? null, av.boolean ?? null, av.option ?? null, av.json ? JSON.stringify(av.json) : null],
  );
  if (res.rows[0].id === id) result.variantAttributeValues.created++;
  else result.variantAttributeValues.reused++;
}

// ── Demo offers ──────────────────────────────────────────────────────────────

/** Popular variant SKUs to create demo offers for. */
const DEMO_OFFER_SKUS = [
  'DL-5450-U5-16-512', 'DL-5450-U7-32-512', 'DL-7450-U7-16-512',
  'XPS13-9340-U7-16-512', 'TP-T14G5-U5-16-512', 'TP-T14G5-U7-32-1T',
  'X1C-G12-U7-32-512', 'EB840G11-U7-16-512', 'MBA-13-M3-8-256',
  'MBA-13-M3-16-512', 'MBP14-M4P-24-512', 'EB-B9-U7-16-512',
  'TB14-G7-U5-16-512', 'PB450-U5-16-512', 'P5690-U9-64-1T-RTX',
  'U2723QE-STD', '27UP850-STD', 'S34D-STD',
  'SAM-990PRO-1T', 'KNG-FB-DDR5-32',
];

/**
 * Seed demo merchant offers.  Creates 2 demo organizations, users, stores,
 * and warehouses if they don't exist, then creates offers for popular variants.
 */
async function seedDemoOffers(
  client: PoolClient,
  productIdBySlug: Map<string, string>,
  variantIdBySku: Map<string, string>,
  result: CatalogSeedResult,
): Promise<void> {
  // Create demo organizations (no slug column — use name to check existence).
  const demoOrgs = [
    { name: 'Demo Tech Hub', type: 'WHOLESALER' },
    { name: 'Demo IT Solutions', type: 'RETAILER' },
  ];
  const orgIds: string[] = [];
  for (const org of demoOrgs) {
    const existing = await client.query(
      `SELECT id FROM organizations WHERE name = $1`, [org.name],
    );
    if (existing.rows.length > 0) {
      orgIds.push(existing.rows[0].id);
    } else {
      const id = randomUUID();
      await client.query(
        `INSERT INTO organizations (id, type, name, country, verification_status, is_active)
         VALUES ($1, $2, $3, 'SA', 'VERIFIED', TRUE)`,
        [id, org.type, org.name],
      );
      orgIds.push(id);
    }
  }

  // Create demo users.
  const demoUsers = [
    { phone: '+966509000001', name: 'Demo Merchant Owner 1' },
    { phone: '+966509000002', name: 'Demo Merchant Owner 2' },
  ];
  const userIds: string[] = [];
  for (const u of demoUsers) {
    const id = randomUUID();
    const res = await client.query(
      `INSERT INTO users (id, phone, full_name, locale, status)
       VALUES ($1, $2, $3, 'ar', 'ACTIVE')
       ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = NOW()
       RETURNING id`,
      [id, u.phone, u.name],
    );
    userIds.push(res.rows[0].id);
  }

  // Create demo stores.
  const demoStores = [
    { slug: 'demo-tech-hub-store', name: 'Demo Tech Hub Store', orgIdx: 0 },
    { slug: 'demo-it-solutions-store', name: 'Demo IT Solutions Store', orgIdx: 1 },
  ];
  const storeIds: string[] = [];
  for (let si = 0; si < demoStores.length; si++) {
    const ds = demoStores[si]!;
    const id = randomUUID();
    const res = await client.query(
      `INSERT INTO stores (id, org_id, slug, display_name, currency, timezone, locale, status, verification_status, address, metadata)
       VALUES ($1, $2, $3, $4, 'SAR', 'Asia/Riyadh', 'ar', 'ACTIVE', 'VERIFIED', '{}', '{}')
       ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
       RETURNING id`,
      [id, orgIds[ds.orgIdx], ds.slug, ds.name],
    );
    storeIds.push(res.rows[0].id);
  }

  // Create demo warehouses (check by name + store_id since no unique constraint).
  const demoWarehouses = [
    { name: 'Demo Riyadh Warehouse', storeIdx: 0 },
    { name: 'Demo Jeddah Warehouse', storeIdx: 1 },
  ];
  const warehouseIds: string[] = [];
  for (const wh of demoWarehouses) {
    const existing = await client.query(
      `SELECT id FROM warehouses WHERE store_id = $1 AND name = $2`,
      [storeIds[wh.storeIdx], wh.name],
    );
    if (existing.rows.length > 0) {
      warehouseIds.push(existing.rows[0].id);
    } else {
      const id = randomUUID();
      await client.query(
        `INSERT INTO warehouses (id, store_id, name, address, status)
         VALUES ($1, $2, $3, '{}', 'ACTIVE')`,
        [id, storeIds[wh.storeIdx], wh.name],
      );
      warehouseIds.push(id);
    }
  }

  // Create offers for popular variants.
  const demoPrices: Record<string, number> = {
    'DL-5450-U5-16-512': 4299, 'DL-5450-U7-32-512': 5199, 'DL-7450-U7-16-512': 5799,
    'XPS13-9340-U7-16-512': 6499, 'TP-T14G5-U5-16-512': 4199, 'TP-T14G5-U7-32-1T': 5499,
    'X1C-G12-U7-32-512': 7299, 'EB840G11-U7-16-512': 5099, 'MBA-13-M3-8-256': 4199,
    'MBA-13-M3-16-512': 5299, 'MBP14-M4P-24-512': 8999, 'EB-B9-U7-16-512': 5499,
    'TB14-G7-U5-16-512': 3799, 'PB450-U5-16-512': 3499, 'P5690-U9-64-1T-RTX': 12999,
    'U2723QE-STD': 2399, '27UP850-STD': 2199, 'S34D-STD': 2799,
    'SAM-990PRO-1T': 549, 'KNG-FB-DDR5-32': 449,
  };

  for (const sku of DEMO_OFFER_SKUS) {
    const variantId = variantIdBySku.get(sku);
    if (!variantId) continue;

    // Look up the product_id for this variant.
    const prodRes = await client.query(`SELECT product_id FROM product_variants WHERE id = $1`, [variantId]);
    const productId = prodRes.rows[0]?.product_id;
    if (!productId) continue;

    const priceMajor = demoPrices[sku] ?? 1000;

    for (let si = 0; si < storeIds.length; si++) {
      // Check for existing offer (no unique constraint on merchant_offers).
      const existingOffer = await client.query(
        `SELECT id FROM merchant_offers WHERE store_id = $1 AND variant_id = $2 AND metadata->>'demo' = 'true'`,
        [storeIds[si], variantId],
      );
      if (existingOffer.rows.length > 0) {
        result.merchantOffers.reused++;
        continue;
      }
      const offerId = randomUUID();
      // Slight price variation between stores.
      const storePrice = si === 0 ? priceMajor : Math.round(priceMajor * (0.95 + Math.random() * 0.1));
      await client.query(
        `INSERT INTO merchant_offers (id, store_id, product_id, variant_id, status, currency, base_price_minor, moq, lead_time_days, is_available, warehouse_id, metadata)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'SAR', $5, 1, 3, TRUE, $6, '{"demo": true}')`,
        [offerId, storeIds[si], productId, variantId, Math.round(storePrice * 100), warehouseIds[si] ?? null],
      );
      result.merchantOffers.created++;
    }
  }
}

// ── Main seed function ───────────────────────────────────────────────────────

/**
 * Seed the full production catalog.  Runs inside a single transaction so
 * partial seeds are rolled back on failure.  Idempotent — safe to call
 * repeatedly; existing rows are never duplicated.
 */
export async function seedCatalog(
  client: PoolClient,
  profile: 'production' | 'demo' = 'production',
): Promise<CatalogSeedResult> {
  const result: CatalogSeedResult = {
    categories: { created: 0, reused: 0 },
    brands: { created: 0, reused: 0 },
    attributeGroups: { created: 0, reused: 0 },
    attributeDefinitions: { created: 0, reused: 0 },
    attributeOptions: { created: 0, reused: 0 },
    productTypes: { created: 0, reused: 0 },
    productTypeAttributes: { created: 0, reused: 0 },
    products: { created: 0, reused: 0 },
    variants: { created: 0, reused: 0 },
    productAttributeValues: { created: 0, reused: 0 },
    variantAttributeValues: { created: 0, reused: 0 },
    merchantOffers: { created: 0, reused: 0 },
    profile,
  };

  await client.query('BEGIN');
  try {
    // ── 0. Ensure partial unique index for platform categories ────────────
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_platform_slug
        ON categories(slug) WHERE store_id IS NULL
    `);

    // ── 1. Categories (parents before children) ───────────────────────────
    const catBySlug = new Map<string, { id: string; path: string }>();

    // Roots first.
    for (const cat of CATEGORIES.filter(c => !c.parentSlug)) {
      const id = randomUUID();
      const path = `/${cat.slug}`;
      const res = await client.query(
        `INSERT INTO categories (id, store_id, slug, name, name_ar, description, path, sort_order, is_active, product_count, metadata)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, TRUE, 0, '{}')
         ON CONFLICT (slug) WHERE store_id IS NULL DO UPDATE SET
           name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
           path = EXCLUDED.path, updated_at = NOW()
         RETURNING id, path`,
        [id, cat.slug, cat.name, cat.nameAr ?? null, cat.description ?? null, path, cat.sortOrder ?? 0],
      );
      catBySlug.set(cat.slug, { id: res.rows[0].id, path: res.rows[0].path });
      if (res.rows[0].id === id) result.categories.created++;
      else result.categories.reused++;
    }

    // Children.
    for (const cat of CATEGORIES.filter(c => !!c.parentSlug)) {
      const parent = catBySlug.get(cat.parentSlug!);
      if (!parent) throw new Error(`Parent category '${cat.parentSlug}' not found for '${cat.slug}'`);
      const id = randomUUID();
      const path = `${parent.path}/${cat.slug}`;
      const res = await client.query(
        `INSERT INTO categories (id, store_id, parent_id, slug, name, name_ar, description, path, sort_order, is_active, product_count, metadata)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, TRUE, 0, '{}')
         ON CONFLICT (slug) WHERE store_id IS NULL DO UPDATE SET
           name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
           path = EXCLUDED.path, parent_id = EXCLUDED.parent_id, updated_at = NOW()
         RETURNING id, path`,
        [id, parent.id, cat.slug, cat.name, cat.nameAr ?? null, cat.description ?? null, path, cat.sortOrder ?? 0],
      );
      catBySlug.set(cat.slug, { id: res.rows[0].id, path: res.rows[0].path });
      if (res.rows[0].id === id) result.categories.created++;
      else result.categories.reused++;
    }

    // ── 2. Brands ─────────────────────────────────────────────────────────
    for (const brand of BRANDS) {
      const id = randomUUID();
      const res = await client.query(
        `INSERT INTO brands (id, slug, name, name_ar, description, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
           updated_at = NOW()
         RETURNING id`,
        [id, brand.slug, brand.name, brand.nameAr ?? null, brand.description ?? null],
      );
      if (res.rows[0].id === id) result.brands.created++;
      else result.brands.reused++;
    }

    // ── 3. Attribute Groups ───────────────────────────────────────────────
    for (const grp of ATTRIBUTE_GROUPS) {
      const id = randomUUID();
      const res = await client.query(
        `INSERT INTO attribute_groups (id, name, name_ar, kind)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET name_ar = EXCLUDED.name_ar, kind = EXCLUDED.kind, updated_at = NOW()
         RETURNING id`,
        [id, grp.name, grp.nameAr ?? null, grp.kind ?? null],
      );
      if (res.rows[0].id === id) result.attributeGroups.created++;
      else result.attributeGroups.reused++;
    }

    // ── 4. Attribute Definitions ──────────────────────────────────────────
    for (const attr of ATTRIBUTES) {
      const id = randomUUID();
      const res = await client.query(
        `INSERT INTO attribute_definitions (id, code, name, name_ar, description, type, unit, scope, status, validation, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, '{}')
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
           type = EXCLUDED.type, unit = EXCLUDED.unit, scope = EXCLUDED.scope, updated_at = NOW()
         RETURNING id`,
        [id, attr.code, attr.name, attr.nameAr ?? null, attr.description ?? null, attr.type, attr.unit ?? null, attr.scope, JSON.stringify(attr.validation ?? {})],
      );
      if (res.rows[0].id === id) result.attributeDefinitions.created++;
      else result.attributeDefinitions.reused++;
    }

    // ── 5. Attribute Options ──────────────────────────────────────────────
    const attrDefsRes = await client.query(`SELECT id, code, type FROM attribute_definitions WHERE deleted_at IS NULL`);
    const attrDefById = new Map<string, string>(); // code → id
    for (const row of attrDefsRes.rows) {
      attrDefById.set(row.code, row.id);
    }

    for (const attr of ATTRIBUTES) {
      if (!attr.options || attr.options.length === 0) continue;
      const defId = attrDefById.get(attr.code);
      if (!defId) throw new Error(`Attribute definition '${attr.code}' not found after insert`);

      for (let i = 0; i < attr.options.length; i++) {
        const opt = attr.options[i]!;
        const optId = randomUUID();
        const existing = await client.query(
          `SELECT id FROM attribute_options WHERE attribute_id = $1 AND value = $2`,
          [defId, opt.value],
        );
        if (existing.rows.length > 0) {
          result.attributeOptions.reused++;
        } else {
          await client.query(
            `INSERT INTO attribute_options (id, attribute_id, value, value_ar, label, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
            [optId, defId, opt.value, opt.valueAr ?? null, opt.label ?? null, opt.sortOrder ?? (i + 1)],
          );
          result.attributeOptions.created++;
        }
      }
    }

    // ── 6. Product Types ──────────────────────────────────────────────────
    for (const pt of PRODUCT_TYPES) {
      const id = randomUUID();
      const catRef = pt.categorySlug ? catBySlug.get(pt.categorySlug) : null;
      const variantDims = JSON.stringify(pt.variantDimensions ?? []);
      const res = await client.query(
        `INSERT INTO product_types (id, code, version, name, name_ar, description, category_id, status, variant_dimensions, metadata)
         VALUES ($1, $2, 1, $3, $4, $5, $6, 'PUBLISHED', $7, '{}')
         ON CONFLICT (code, version) DO UPDATE SET
           name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
           category_id = EXCLUDED.category_id, variant_dimensions = EXCLUDED.variant_dimensions,
           status = EXCLUDED.status, updated_at = NOW()
         RETURNING id`,
        [id, pt.code, pt.name, pt.nameAr ?? null, pt.description ?? null, catRef?.id ?? null, variantDims],
      );
      if (res.rows[0].id === id) result.productTypes.created++;
      else result.productTypes.reused++;
    }

    // ── 7. Product Type Attributes ────────────────────────────────────────
    const ptRes = await client.query(`SELECT id, code FROM product_types`);
    const ptIdByCode = new Map<string, string>();
    for (const row of ptRes.rows) ptIdByCode.set(row.code, row.id);

    const grpRes = await client.query(`SELECT id, name FROM attribute_groups`);
    const grpIdByName = new Map<string, string>();
    for (const row of grpRes.rows) grpIdByName.set(row.name, row.id);

    for (const pt of PRODUCT_TYPES) {
      const ptId = ptIdByCode.get(pt.code);
      if (!ptId) throw new Error(`Product type '${pt.code}' not found after insert`);

      for (const ta of (pt.attributes ?? [])) {
        const attrDefId = attrDefById.get(ta.attributeCode);
        if (!attrDefId) {
          console.warn(`  ⚠ Attribute '${ta.attributeCode}' not found — skipping for type '${pt.code}'`);
          continue;
        }
        const grpId = ta.groupName ? (grpIdByName.get(ta.groupName) ?? null) : null;
        const id = randomUUID();
        const scope = ta.scope ?? 'PRODUCT';
        const res = await client.query(
          `INSERT INTO product_type_attributes
             (id, product_type_id, attribute_definition_id, group_id, required, scope, display_order,
              filterable, searchable, sortable, comparable, visible_in_listing, visible_in_detail,
              allowed_values, validation_rules, conditional_rules, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'[]','{}')
           ON CONFLICT (product_type_id, attribute_definition_id) DO UPDATE SET
             group_id = EXCLUDED.group_id, required = EXCLUDED.required, scope = EXCLUDED.scope,
             display_order = EXCLUDED.display_order, filterable = EXCLUDED.filterable,
             searchable = EXCLUDED.searchable, sortable = EXCLUDED.sortable,
             comparable = EXCLUDED.comparable, visible_in_listing = EXCLUDED.visible_in_listing,
             visible_in_detail = EXCLUDED.visible_in_detail, allowed_values = EXCLUDED.allowed_values,
             validation_rules = EXCLUDED.validation_rules, updated_at = NOW()
           RETURNING id`,
          [
            id, ptId, attrDefId, grpId,
            ta.required ?? false, scope, ta.displayOrder ?? 0,
            ta.filterable ?? false, ta.searchable ?? false, ta.sortable ?? false,
            ta.comparable ?? false, ta.visibleInListing ?? true, ta.visibleInDetail ?? true,
            JSON.stringify(ta.allowedValues ?? []), JSON.stringify(ta.validationRules ?? {}),
          ],
        );
        if (res.rows[0].id === id) result.productTypeAttributes.created++;
        else result.productTypeAttributes.reused++;
      }

      // Update variant_dimensions to resolved attribute definition IDs.
      if (pt.variantDimensions && pt.variantDimensions.length > 0) {
        const resolvedDims = pt.variantDimensions
          .map(code => attrDefById.get(code))
          .filter((id): id is string => !!id);
        await client.query(
          `UPDATE product_types SET variant_dimensions = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(resolvedDims), ptId],
        );
      }
    }

    // ── 8. Resolve FK references for products ────────────────────────────
    const brandRes = await client.query(`SELECT id, slug FROM brands`);
    const brandIdBySlug = new Map<string, string>();
    for (const row of brandRes.rows) brandIdBySlug.set(row.slug, row.id);

    const catRes = await client.query(`SELECT id, slug, path FROM categories WHERE store_id IS NULL`);
    const catIdBySlug = new Map<string, string>();
    for (const row of catRes.rows) catIdBySlug.set(row.slug, row.id);

    // ── 9. Products + Variants + Attribute Values ─────────────────────────
    const productIdBySlug = new Map<string, string>();
    const variantIdBySku = new Map<string, string>();

    for (const prod of ALL_PRODUCTS) {
      const productId = randomUUID();
      const brandId = brandIdBySlug.get(prod.brandSlug);
      const categoryId = catIdBySlug.get(prod.categorySlug);
      const productTypeId = ptIdByCode.get(prod.productTypeCode);

      if (!brandId) throw new Error(`Brand '${prod.brandSlug}' not found for product '${prod.slug}'`);
      if (!categoryId) throw new Error(`Category '${prod.categorySlug}' not found for product '${prod.slug}'`);
      if (!productTypeId) throw new Error(`Product type '${prod.productTypeCode}' not found for product '${prod.slug}'`);

      // Check existing canonical product by slug.
      const existingProduct = await client.query(
        `SELECT id FROM products WHERE slug = $1 AND store_id IS NULL`,
        [prod.slug],
      );

      let resolvedProductId: string;
      if (existingProduct.rows.length > 0) {
        resolvedProductId = existingProduct.rows[0].id;
        await client.query(
          `UPDATE products SET title=$2, title_ar=$3, description=$4, category_id=$5, brand_id=$6,
             product_type_id=$7, mpn=$8, gtin=$9, ean=$10, condition=$11, status='ACTIVE',
             is_available=TRUE, updated_at=NOW()
           WHERE id=$1`,
          [
            resolvedProductId, prod.title, prod.titleAr ?? null, prod.description ?? null,
            categoryId, brandId, productTypeId, prod.mpn ?? null, prod.gtin ?? null,
            prod.ean ?? null, prod.condition ?? 'NEW',
          ],
        );
        result.products.reused++;
      } else {
        const r = await client.query(
          `INSERT INTO products (id, store_id, category_id, brand_id, product_type_id, slug, title, title_ar,
             description, mpn, gtin, ean, condition, status, is_available, moq, images, attributes, metadata)
           VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVE',TRUE,1,'[]','{}','{}')
           RETURNING id`,
          [
            productId, categoryId, brandId, productTypeId, prod.slug, prod.title,
            prod.titleAr ?? null, prod.description ?? null, prod.mpn ?? null,
            prod.gtin ?? null, prod.ean ?? null, prod.condition ?? 'NEW',
          ],
        );
        resolvedProductId = r.rows[0].id;
        result.products.created++;
      }

      productIdBySlug.set(prod.slug, resolvedProductId);

      // ── Variants ────────────────────────────────────────────────────────
      for (const variant of (prod.variants ?? [])) {
        const variantId = randomUUID();
        const comboKey = computeCombinationKey(variant.attributes ?? []);

        const existingVariant = await client.query(
          `SELECT id FROM product_variants WHERE product_id = $1 AND sku = $2`,
          [resolvedProductId, variant.sku],
        );

        let resolvedVariantId: string;
        if (existingVariant.rows.length > 0) {
          resolvedVariantId = existingVariant.rows[0].id;
          await client.query(
            `UPDATE product_variants SET title=$2, title_ar=$3, unit=$4, weight_grams=$5,
               combination_key=$6, is_active=TRUE, updated_at=NOW()
             WHERE id=$1`,
            [resolvedVariantId, variant.title ?? null, variant.titleAr ?? null,
             variant.unit ?? 'PCS', variant.weightGrams ?? null, comboKey],
          );
          result.variants.reused++;
        } else {
          const r = await client.query(
            `INSERT INTO product_variants (id, product_id, sku, title, title_ar, unit, weight_grams,
               combination_key, attributes, images, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}','[]',TRUE)
             RETURNING id`,
            [variantId, resolvedProductId, variant.sku, variant.title ?? null,
             variant.titleAr ?? null, variant.unit ?? 'PCS', variant.weightGrams ?? null, comboKey],
          );
          resolvedVariantId = r.rows[0].id;
          result.variants.created++;
        }

        variantIdBySku.set(variant.sku, resolvedVariantId);

        // ── Variant Attribute Values ──────────────────────────────────────
        for (const av of (variant.attributes ?? [])) {
          const defId = attrDefById.get(av.attributeCode);
          if (!defId) {
            console.warn(`  ⚠ Attribute '${av.attributeCode}' not found — skipping for variant '${variant.sku}'`);
            continue;
          }
          await upsertVariantAttrValue(client, resolvedVariantId, defId, av, result);
        }
      }

      // ── Product Attribute Values ────────────────────────────────────────
      for (const av of (prod.attributes ?? [])) {
        const defId = attrDefById.get(av.attributeCode);
        if (!defId) {
          console.warn(`  ⚠ Attribute '${av.attributeCode}' not found — skipping for product '${prod.slug}'`);
          continue;
        }
        await upsertProductAttrValue(client, resolvedProductId, defId, av, result);
      }
    }

    // ── 10. Demo profile: merchant offers ─────────────────────────────────
    if (profile === 'demo') {
      await seedDemoOffers(client, productIdBySlug, variantIdBySku, result);
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

// ── CLI entry point ─────────────────────────────────────────────────────────

async function cli(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('❌ DATABASE_URL is required for the catalog seed.');
    console.error('   Set it to your PostgreSQL connection string before running db:seed:catalog.');
    process.exit(1);
  }

  const profile = (process.env['CATALOG_SEED_PROFILE'] === 'demo' ? 'demo' : 'production') as 'production' | 'demo';
  const sslCaFile = process.env['PGSSLROOTCERT'];

  console.log(`🌱 Catalog seed starting (profile: ${profile})...\n`);

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ...(sslCaFile && {
      ssl: {
        ca: fs.readFileSync(sslCaFile, 'utf8'),
        rejectUnauthorized: true,
      },
    }),
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('✓ Database connection established\n');

    const result = await seedCatalog(client, profile);

    // Print summary.
    const fmt = (label: string, c: { created: number; reused: number }) => {
      const total = c.created + c.reused;
      if (c.created > 0) console.log(`  ✓ ${label}: ${total} (${c.created} new, ${c.reused} existing)`);
      else console.log(`  ✓ ${label}: ${total} (all existing)`);
    };

    console.log('── Catalog Seed Summary ──────────────────────────');
    fmt('Categories', result.categories);
    fmt('Brands', result.brands);
    fmt('Attribute Groups', result.attributeGroups);
    fmt('Attribute Definitions', result.attributeDefinitions);
    fmt('Attribute Options', result.attributeOptions);
    fmt('Product Types', result.productTypes);
    fmt('Product Type Attributes', result.productTypeAttributes);
    fmt('Products', result.products);
    fmt('Variants', result.variants);
    fmt('Product Attribute Values', result.productAttributeValues);
    fmt('Variant Attribute Values', result.variantAttributeValues);
    if (profile === 'demo') fmt('Merchant Offers', result.merchantOffers);
    console.log('──────────────────────────────────────────────────\n');
    console.log(`🌱 Catalog seed complete (${profile}).\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Catalog seed FAILED: ${message}\n`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Only run CLI when executed directly (not imported for testing).
const isDirectRun =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.endsWith('seed-catalog.ts') || process.argv[1]?.endsWith('seed-catalog');

if (isDirectRun) {
  cli().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
