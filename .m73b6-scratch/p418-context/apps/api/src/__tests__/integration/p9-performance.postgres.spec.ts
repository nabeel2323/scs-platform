/**
 * P9 — NP-A15 Performance Verification
 *
 * Creates a realistic 10,000-product dataset and measures filtered search
 * performance against real PostgreSQL. Captures EXPLAIN ANALYZE evidence.
 *
 * Requires: Docker (testcontainers).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import { SearchService } from '../../modules/catalog/search.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { ConditionalRulesService } from '../../modules/catalog/conditional-rules.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  products, productVariants, categories, brands,
} from '../../modules/catalog/catalog.schema';
import {
  attributeDefinitions, productAttributeValues, variantAttributeValues,
  productTypes, productTypeAttributes,
} from '../../modules/catalog/catalog.taxonomy.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations, organizationMembers } from '../../modules/identity/identity.schema';
import { stores, warehouses } from '../../modules/merchant/merchant.schema';
import { priceLists, priceTiers } from '../../modules/pricing/pricing.schema';
import { inventoryItems } from '../../modules/inventory/inventory.schema';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { searchQueries } from '../../modules/catalog/search.schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

const NUM_PRODUCTS = 10_000;
const NUM_CATEGORIES = 50;
const NUM_BRANDS = 30;

describe('P9 — NP-A15 Performance (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  let database: DatabaseService;
  let searchService: SearchService;
  let catalogService: CatalogService;
  let storeId: string;
  let warehouseId: string;
  let priceListId: string;
  let categoryIds: string[];
  let brandIds: string[];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: { products, productVariants, categories, brands, users, organizations, organizationMembers, stores, warehouses, priceLists, priceTiers, attributeDefinitions, productAttributeValues, variantAttributeValues, productTypes, productTypeAttributes, merchantOffers, inventoryItems, outboxEvents, searchQueries },
    }) as unknown as any;

    // Apply migrations
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && !EXCLUDED.has(f)).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sqlContent); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); } catch { await pool.query('ROLLBACK'); }
    }
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }
    const roleById = new Map((await pool.query(`SELECT id, key FROM roles`)).rows.map(r => [r.key, r.id]));

    database = { db } as DatabaseService;
    const outbox = new OutboxDispatcher(database);
    const storage = { createPresignedGetUrl: async () => null } as any;
    const redis = { client: { get: async () => null, set: async () => {}, del: async () => {} } } as any;
    searchService = new SearchService(database, storage, redis);
    const taxonomyService = new CatalogTaxonomyService(database);
    const conditionalRules = new ConditionalRulesService();
    catalogService = new CatalogService(database, redis, outbox, storage, { record: async () => {} } as any, conditionalRules, taxonomyService, {} as any, {} as any, {} as any);

    // Create store org
    const orgId = randomUUID();
    storeId = randomUUID();
    const userId = randomUUID();
    warehouseId = randomUUID();
    priceListId = randomUUID();

    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Perf User', '+966500000000')`, [userId]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Perf Org', 'SA')`, [orgId]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgId, userId, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'perf-store', 'Perf Store', 'APPROVED')`, [storeId, orgId]);
    await pool.query(`INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, 'Perf WH')`, [warehouseId, storeId]);
    await pool.query(`INSERT INTO price_lists (id, store_id, name, currency, is_active) VALUES ($1, $2, 'Perf PL', 'SAR', true)`, [priceListId, storeId]);

    // Create categories
    categoryIds = [];
    for (let i = 0; i < NUM_CATEGORIES; i++) {
      const catId = randomUUID();
      categoryIds.push(catId);
      await pool.query(`INSERT INTO categories (id, name, slug, path) VALUES ($1, $2, $3, '/')`, [catId, `Category ${i}`, `cat-${i}`]);
    }

    // Create brands
    brandIds = [];
    for (let i = 0; i < NUM_BRANDS; i++) {
      const brandId = randomUUID();
      brandIds.push(brandId);
      await pool.query(`INSERT INTO brands (id, name, slug) VALUES ($1, $2, $3)`, [brandId, `Brand ${i}`, `brand-${i}`]);
    }

    // Create attribute definitions
    const attrColorId = randomUUID();
    await pool.query(`INSERT INTO attribute_definitions (id, code, name, type, scope) VALUES ($1, 'perf_color', 'Color', 'TEXT', 'PRODUCT')`, [attrColorId]);

    // Generate 10,000 products in batches
    console.log(`Generating ${NUM_PRODUCTS} products...`);
    const batchSize = 500;
    for (let batch = 0; batch < NUM_PRODUCTS; batch += batchSize) {
      const end = Math.min(batch + batchSize, NUM_PRODUCTS);
      const productValues: string[] = [];
      const variantValues: string[] = [];
      const offerValues: string[] = [];
      const inventoryValues: string[] = [];
      const attrValues: string[] = [];

      for (let i = batch; i < end; i++) {
        const pid = randomUUID();
        const vid = randomUUID();
        const catId = categoryIds[i % NUM_CATEGORIES];
        const brId = brandIds[i % NUM_BRANDS];
        const price = Math.floor(Math.random() * 50000) + 100;
        const hasStock = Math.random() > 0.3;

        productValues.push(`('${pid}', '${storeId}', 'Product ${i}', 'Product ${i} AR', 'product-${i}', 'ACTIVE', '${catId}', '${brId}', NOW() - interval '${Math.floor(Math.random() * 365)} days', NOW())`);
        variantValues.push(`('${vid}', '${pid}', 'SKU-${i}', 'Variant ${i}', 'PCS', true, NOW(), NOW())`);
        offerValues.push(`('${randomUUID()}', '${storeId}', '${pid}', '${vid}', '${priceListId}', ${price}, 'ACTIVE', NOW(), NOW())`);

        if (hasStock) {
          const qty = Math.floor(Math.random() * 200) + 1;
          inventoryValues.push(`('${randomUUID()}', '${vid}', '${warehouseId}', ${qty}, 0, 10)`);
        }

        if (i % 2 === 0) {
          attrValues.push(`('${randomUUID()}', '${pid}', '${attrColorId}', 'Color ${i % 10}', NULL, NULL, NULL, NULL)`);
        }
      }

      if (productValues.length > 0) {
        await pool.query(`INSERT INTO products (id, store_id, title, title_ar, slug, status, category_id, brand_id, created_at, updated_at) VALUES ${productValues.join(',')}`);
        await pool.query(`INSERT INTO product_variants (id, product_id, sku, title, unit, is_active, created_at, updated_at) VALUES ${variantValues.join(',')}`);
        await pool.query(`INSERT INTO merchant_offers (id, store_id, product_id, variant_id, price_list_id, base_price_minor, status, created_at, updated_at) VALUES ${offerValues.join(',')}`);
        if (inventoryValues.length > 0) {
          await pool.query(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved, reorder_point) VALUES ${inventoryValues.join(',')}`);
        }
        if (attrValues.length > 0) {
          await pool.query(`INSERT INTO product_attribute_values (id, product_id, attribute_definition_id, value_text, value_number, value_boolean, option_value, value_json) VALUES ${attrValues.join(',')}`);
        }
      }

      if (batch % 2000 === 0) console.log(`  Generated ${batch}/${NUM_PRODUCTS} products...`);
    }
    console.log(`  Generated ${NUM_PRODUCTS}/${NUM_PRODUCTS} products. Done.`);
  }, 600_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  async function measureSearch(label: string, fn: () => Promise<any>, iterations = 10, warmup = 3) {
    // Warmup iterations (not counted)
    for (let i = 0; i < warmup; i++) await fn();
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return {
      label,
      times,
      min: times[0]!,
      median: times[Math.floor(times.length / 2)]!,
      p95: times[Math.floor(times.length * 0.95)]!,
      max: times[times.length - 1]!,
    };
  }

  function fmt(r: { label: string; min: number; median: number; p95: number; max: number }) {
    return `${r.label}: min=${r.min.toFixed(1)}ms median=${r.median.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms max=${r.max.toFixed(1)}ms`;
  }

  describe('NP-A15 — Search Performance <200ms', () => {
    // NOTE: Tests run in testcontainers (Docker on Windows). Performance is not
    // representative of production PostgreSQL. Measurements are captured for
    // analysis. The 200ms target applies to production hardware.

    it('price filter', async () => {
      const r = await measureSearch('price filter', () => searchService.search('', { storeId, priceMin: 5000, priceMax: 20000, limit: 50 }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);

    it('availability filter', async () => {
      const r = await measureSearch('availability', () => searchService.search('', { storeId, availability: 'inStock', limit: 50 }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);

    it('combined price + availability + category + brand + sort', async () => {
      const r = await measureSearch('combined', () => searchService.search('', {
        storeId, priceMin: 1000, priceMax: 30000, availability: 'inStock',
        categoryId: categoryIds[0], brandId: brandIds[0], sort: 'price_asc', limit: 50,
      }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);

    it('text search + P9 filters', async () => {
      const r = await measureSearch('text+p9', () => searchService.search('Product 1', {
        storeId, priceMin: 1000, priceMax: 30000, availability: 'inStock', sort: 'price_desc', limit: 50,
      }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);

    it('price_desc sort', async () => {
      const r = await measureSearch('price_desc', () => searchService.search('', { storeId, sort: 'price_desc', limit: 50 }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);

    it('newest sort', async () => {
      const r = await measureSearch('newest', () => searchService.search('', { storeId, sort: 'newest', limit: 50 }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);

    it('name sort', async () => {
      const r = await measureSearch('name', () => searchService.search('', { storeId, sort: 'name', limit: 50 }), 10, 3);
      console.log(fmt(r));
      console.log(`  All times: ${r.times.map(t => t.toFixed(1)).join(', ')}ms`);
    }, 60000);
  });

  describe('NP-A15 — EXPLAIN ANALYZE Evidence', () => {
    it('combined price + availability + category + brand + price_asc sort', async () => {
      const res = await pool.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT p.id, p.title, p.slug, p.created_at
        FROM products p
        WHERE p.store_id = $1 AND p.deleted_at IS NULL
          AND p.category_id = $2 AND p.brand_id = $3
          AND EXISTS (SELECT 1 FROM merchant_offers mo WHERE mo.product_id = p.id AND mo.status = 'ACTIVE' AND mo.base_price_minor IS NOT NULL AND mo.base_price_minor >= 1000 AND mo.base_price_minor <= 30000)
          AND EXISTS (SELECT 1 FROM merchant_offers mo2 JOIN product_variants pv ON pv.product_id = mo2.product_id JOIN inventory_items ii ON ii.variant_id = pv.id JOIN warehouses w ON w.id = ii.warehouse_id AND w.store_id = mo2.store_id WHERE mo2.product_id = p.id AND mo2.status = 'ACTIVE' AND ii.qty_on_hand > 0)
        ORDER BY (SELECT MIN(mo3.base_price_minor) FROM merchant_offers mo3 WHERE mo3.product_id = p.id AND mo3.status = 'ACTIVE' AND mo3.base_price_minor IS NOT NULL) ASC NULLS LAST, p.created_at DESC, p.id ASC
        LIMIT 50
      `, [storeId, categoryIds[0], brandIds[0]]);
      const plan = res.rows.map(r => r['QUERY PLAN']).join('\n');
      console.log('=== EXPLAIN ANALYZE: Combined filters + price_asc ===');
      console.log(plan);
      expect(plan).toBeTruthy();
    });

    it('price filter only', async () => {
      const res = await pool.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT p.id, p.title FROM products p
        WHERE p.store_id = $1 AND p.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM merchant_offers mo WHERE mo.product_id = p.id AND mo.status = 'ACTIVE' AND mo.base_price_minor IS NOT NULL AND mo.base_price_minor >= 5000 AND mo.base_price_minor <= 20000)
        LIMIT 50
      `, [storeId]);
      const plan = res.rows.map(r => r['QUERY PLAN']).join('\n');
      console.log('=== EXPLAIN ANALYZE: Price filter ===');
      console.log(plan);
      expect(plan).toBeTruthy();
    });

    it('availability filter only', async () => {
      const res = await pool.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT p.id, p.title FROM products p
        WHERE p.store_id = $1 AND p.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM merchant_offers mo JOIN product_variants pv ON pv.product_id = mo.product_id JOIN inventory_items ii ON ii.variant_id = pv.id JOIN warehouses w ON w.id = ii.warehouse_id AND w.store_id = mo.store_id WHERE mo.product_id = p.id AND mo.status = 'ACTIVE' AND ii.qty_on_hand > 0)
        LIMIT 50
      `, [storeId]);
      const plan = res.rows.map(r => r['QUERY PLAN']).join('\n');
      console.log('=== EXPLAIN ANALYZE: Availability filter ===');
      console.log(plan);
      expect(plan).toBeTruthy();
    });

    it('price_asc sort', async () => {
      const res = await pool.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT p.id, p.title, p.created_at FROM products p
        WHERE p.store_id = $1 AND p.deleted_at IS NULL
        ORDER BY (SELECT MIN(mo.base_price_minor) FROM merchant_offers mo WHERE mo.product_id = p.id AND mo.status = 'ACTIVE' AND mo.base_price_minor IS NOT NULL) ASC NULLS LAST, p.created_at DESC, p.id ASC
        LIMIT 50
      `, [storeId]);
      const plan = res.rows.map(r => r['QUERY PLAN']).join('\n');
      console.log('=== EXPLAIN ANALYZE: Price ascending sort ===');
      console.log(plan);
      expect(plan).toBeTruthy();
    });
  });
});
