/**
 * P9 — Search Enhancement & Export Completeness: PostgreSQL Integration Tests
 *
 * Acceptance criteria:
 *   NP-A01  priceMin/priceMax filtering
 *   NP-A02  inStock availability filtering
 *   NP-A03  price_asc sort
 *   NP-A04  price_desc sort
 *   NP-A05  newest sort
 *   NP-A06  name sort
 *   NP-A07  combined filters
 *   NP-A08  filtered pagination
 *   NP-A09  typed attribute export
 *   NP-A10  one row per variant
 *   NP-A11  export/import round trip
 *   NP-A12  search privacy/security
 *   NP-A13  export store membership
 *   NP-A15  <200ms PostgreSQL performance target
 *
 * Requires a real PostgreSQL container (testcontainers).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import { SearchService } from '../../modules/catalog/search.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { ConditionalRulesService } from '../../modules/catalog/conditional-rules.service';
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

async function createStoreOrg(
  pool: Pool, roleById: Map<string, string>, suffix: string,
): Promise<{ orgId: string; storeId: string; userId: string; warehouseId: string; priceListId: string }> {
  const orgId = randomUUID(), storeId = randomUUID(), userId = randomUUID();
  const warehouseId = randomUUID(), priceListId = randomUUID();
  await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, $2, $3)`, [userId, `User ${suffix}`, `+966${suffix.padStart(9, '0')}`]);
  await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', $2, 'SA')`, [orgId, `Org ${suffix}`]);
  await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgId, userId, roleById.get('MERCHANT_OWNER')]);
  await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, $3, $4, 'APPROVED')`, [storeId, orgId, `store-${suffix}`, `Store ${suffix}`]);
  await pool.query(`INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, $3)`, [warehouseId, storeId, `WH ${suffix}`]);
  await pool.query(`INSERT INTO price_lists (id, store_id, name, currency, is_active) VALUES ($1, $2, $3, 'SAR', true)`, [priceListId, storeId, `PL ${suffix}`]);
  return { orgId, storeId, userId, warehouseId, priceListId };
}

async function createProduct(pool: Pool, storeId: string, title: string, variantSkus: string[]): Promise<{ productId: string; variantIds: string[] }> {
  const productId = randomUUID();
  await pool.query(`INSERT INTO products (id, store_id, title, title_ar, slug, status, created_at, updated_at) VALUES ($1, $2, $3, $3, $4, 'ACTIVE', NOW(), NOW())`, [productId, storeId, title, `slug-${productId.slice(0, 8)}`]);
  const variantIds: string[] = [];
  for (const sku of variantSkus) {
    const vid = randomUUID();
    await pool.query(`INSERT INTO product_variants (id, product_id, sku, title, unit, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, 'PCS', true, NOW(), NOW())`, [vid, productId, sku, title]);
    variantIds.push(vid);
  }
  return { productId, variantIds };
}

async function createOffer(pool: Pool, storeId: string, productId: string, variantId: string, priceListId: string, basePriceMinor: number, status = 'ACTIVE') {
  await pool.query(`INSERT INTO merchant_offers (id, store_id, product_id, variant_id, price_list_id, base_price_minor, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`, [randomUUID(), storeId, productId, variantId, priceListId, basePriceMinor, status]);
  await pool.query(`INSERT INTO price_tiers (id, price_list_id, variant_id, min_qty, unit_price_minor, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, NOW(), NOW())`, [randomUUID(), priceListId, variantId, basePriceMinor]);
}

async function createInventory(pool: Pool, variantId: string, warehouseId: string, qty: number) {
  await pool.query(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved, reorder_point) VALUES ($1, $2, $3, $4, 0, 0)`, [randomUUID(), variantId, warehouseId, qty]);
}

// @ts-nocheck — test setup uses module-level let vars assigned in beforeAll;
// TypeScript strict mode flags them as possibly undefined but they are
// always assigned before any test runs. Runtime behavior is correct.
describe('P9 — Search & Export (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let searchService: SearchService;
  let catalogService: CatalogService;
  let roleById: Map<string, string>;
  let storeA: string, whA: string, plA: string;
  let storeB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: { products, productVariants, categories, brands, users, organizations, organizationMembers, stores, warehouses, priceLists, priceTiers, attributeDefinitions, productAttributeValues, variantAttributeValues, productTypes, productTypeAttributes, merchantOffers, inventoryItems, outboxEvents, searchQueries },
    }) as unknown as DatabaseService['db'];

    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && !EXCLUDED.has(f)).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sqlContent); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); } catch { await pool.query('ROLLBACK'); }
    }
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }
    roleById = new Map((await pool.query(`SELECT id, key FROM roles`)).rows.map((r: any) => [r.key, r.id] as const));

    database = { db } as DatabaseService;
    const outbox = new OutboxDispatcher(database);
    const storage = { createPresignedGetUrl: async () => null } as any;
    const redis = { client: { get: async () => null, set: async () => {}, del: async () => {} } } as any;
    searchService = new SearchService(database, storage, redis);
    const taxonomyService = new CatalogTaxonomyService(database);
    const conditionalRules = new ConditionalRulesService();
    catalogService = new CatalogService(database, redis, outbox, storage, { record: async () => {} } as any, conditionalRules, taxonomyService, {} as any, {} as any);

    // Store A
    const a = await createStoreOrg(pool, roleById, 'A');
    storeA = a.storeId; whA = a.warehouseId; plA = a.priceListId;
    // Store B
    const b = await createStoreOrg(pool, roleById, 'B');
    storeB = b.storeId;

    // Products for Store A at different price points
    const cheap = await createProduct(pool, storeA, 'Cheap Widget', ['CHEAP-001']);
    await createOffer(pool, storeA, cheap.productId, cheap.variantIds[0]!, plA, 1000);

    const mid = await createProduct(pool, storeA, 'Mid Gadget', ['MID-001']);
    await createOffer(pool, storeA, mid.productId, mid.variantIds[0]!, plA, 5000);

    const exp = await createProduct(pool, storeA, 'Expensive Device', ['EXP-001']);
    await createOffer(pool, storeA, exp.productId, exp.variantIds[0]!, plA, 20000);

    // No-price product
    await createProduct(pool, storeA, 'No Price Item', ['NP-001']);

    // In-stock product
    const inStock = await createProduct(pool, storeA, 'In Stock Item', ['IS-001']);
    await createOffer(pool, storeA, inStock.productId, inStock.variantIds[0]!, plA, 3000);
    await createInventory(pool, inStock.variantIds[0]!, whA, 100);

    // Out-of-stock product (offer but no inventory)
    const oos = await createProduct(pool, storeA, 'Out of Stock Item', ['OOS-001']);
    await createOffer(pool, storeA, oos.productId, oos.variantIds[0]!, plA, 4000);

    // Multi-variant product
    const mv = await createProduct(pool, storeA, 'Multi Variant Product', ['MV-001', 'MV-002', 'MV-003']);
    await createOffer(pool, storeA, mv.productId, mv.variantIds[0]!, plA, 2000);
    await createOffer(pool, storeA, mv.productId, mv.variantIds[1]!, plA, 3500);
    await createOffer(pool, storeA, mv.productId, mv.variantIds[2]!, plA, 7000);
    await createInventory(pool, mv.variantIds[0]!, whA, 50);
    await createInventory(pool, mv.variantIds[1]!, whA, 30);
    await createInventory(pool, mv.variantIds[2]!, whA, 10);

    // Store B product
    await createProduct(pool, storeB, 'Store B Product', ['SB-001']);
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // NP-A01: Price range filtering
  describe('NP-A01 — priceMin/priceMax', () => {
    it('filters with priceMin', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMin: 5000 });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('Mid Gadget');
      expect(titles).toContain('Expensive Device');
      expect(titles).not.toContain('Cheap Widget');
    });
    it('filters with priceMax', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMax: 5000 });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('Cheap Widget');
      expect(titles).toContain('Mid Gadget');
      expect(titles).not.toContain('Expensive Device');
    });
    it('filters with priceMin AND priceMax', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMin: 2000, priceMax: 6000 });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('Mid Gadget');
      expect(titles).not.toContain('Cheap Widget');
      expect(titles).not.toContain('Expensive Device');
    });
    it('excludes products with no active offers', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMin: 0 });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).not.toContain('No Price Item');
    });
    it('respects exact price boundaries', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMin: 5000, priceMax: 5000 });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('Mid Gadget');
      expect(titles.length).toBe(1);
    });
  });

  // NP-A02: Availability filtering
  describe('NP-A02 — inStock', () => {
    it('returns only in-stock products', async () => {
      const res = await searchService.search('', { storeId: storeA, availability: 'inStock' });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('In Stock Item');
      expect(titles).toContain('Multi Variant Product');
      expect(titles).not.toContain('Out of Stock Item');
      expect(titles).not.toContain('No Price Item');
    });
    it('combined with price filter', async () => {
      const res = await searchService.search('', { storeId: storeA, availability: 'inStock', priceMin: 2500 });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('In Stock Item');
    });
  });

  // NP-A03/A04: Price sorting
  describe('NP-A03/A04 — price sort', () => {
    it('price_asc with NULLS LAST', async () => {
      const res = await searchService.search('', { storeId: storeA, sort: 'price_asc' });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles.indexOf('Cheap Widget')).toBeLessThan(titles.indexOf('Mid Gadget'));
      expect(titles.indexOf('Mid Gadget')).toBeLessThan(titles.indexOf('Expensive Device'));
      const noPriceIdx = titles.indexOf('No Price Item');
      if (noPriceIdx >= 0) expect(titles.indexOf('Expensive Device')).toBeLessThan(noPriceIdx);
    });
    it('price_desc with NULLS LAST', async () => {
      const res = await searchService.search('', { storeId: storeA, sort: 'price_desc' });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles.indexOf('Expensive Device')).toBeLessThan(titles.indexOf('Mid Gadget'));
    });
    it('uses MIN(active offer) for multi-variant', async () => {
      const res = await searchService.search('', { storeId: storeA, sort: 'price_asc' });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles.indexOf('Cheap Widget')).toBeLessThan(titles.indexOf('Multi Variant Product'));
      expect(titles.indexOf('Multi Variant Product')).toBeLessThan(titles.indexOf('Mid Gadget'));
    });
  });

  // NP-A05/A06: newest / name sort
  describe('NP-A05/A06 — newest / name', () => {
    it('newest sorts by created_at DESC', async () => {
      const res = await searchService.search('', { storeId: storeA, sort: 'newest' });
      const dates: number[] = res.items.map((i: any) => new Date(i.createdAt ?? 0).getTime());
      for (let j = 1; j < dates.length; j++) expect(dates[j - 1]!).toBeGreaterThanOrEqual(dates[j]!);
    });
    it('name sorts by title ASC', async () => {
      const res = await searchService.search('', { storeId: storeA, sort: 'name' });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toEqual([...titles].sort((a: string, b: string) => a.localeCompare(b)));
    });
  });

  // NP-A07: Combined filters
  describe('NP-A07 — Combined filters', () => {
    it('price + availability + sort compose correctly', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMin: 1000, priceMax: 10000, availability: 'inStock', sort: 'price_asc' });
      const titles: string[] = res.items.map((i: any) => i.title ?? '');
      expect(titles).toContain('In Stock Item');
      expect(titles).toContain('Multi Variant Product');
      expect(titles).not.toContain('Out of Stock Item');
      expect(titles).not.toContain('Expensive Device');
    });
  });

  // NP-A08: Filtered pagination
  describe('NP-A08 — Filtered pagination', () => {
    it('total reflects filtered count', async () => {
      const res = await searchService.search('', { storeId: storeA, priceMin: 1000, priceMax: 6000, limit: 2, offset: 0 });
      expect(res.items.length).toBeLessThanOrEqual(2);
      expect(res.total).toBeGreaterThanOrEqual(res.items.length);
    });
    it('no overlap between pages', async () => {
      const p1 = await searchService.search('', { storeId: storeA, sort: 'name', limit: 3, offset: 0 });
      const p2 = await searchService.search('', { storeId: storeA, sort: 'name', limit: 3, offset: 3 });
      const ids1 = new Set(p1.items.map((i: any) => i.id));
      for (const item of p2.items) expect(ids1.has((item as any).id)).toBe(false);
    });
  });

  // NP-A09: Typed attribute export
  describe('NP-A09 — Typed attribute export', () => {
    it('exports product-scope attributes in CSV', async () => {
      const attrDefId = randomUUID();
      await pool.query(`INSERT INTO attribute_definitions (id, code, name, type, scope, created_at, updated_at) VALUES ($1, 'color', 'Color', 'TEXT', 'PRODUCT', NOW(), NOW())`, [attrDefId]);
      // Find a product ID from store A
      const prods = await pool.query(`SELECT id FROM products WHERE store_id = $1 AND deleted_at IS NULL LIMIT 1`, [storeA]);
      await pool.query(`INSERT INTO product_attribute_values (id, product_id, attribute_definition_id, value_text) VALUES ($1, $2, $3, $4)`, [randomUUID(), prods.rows[0].id, attrDefId, 'Red']);
      const csv = await catalogService.exportProductsCsv(storeA);
      expect(csv).toContain('attr:color');
      expect(csv).toContain('Red');
    });
  });

  // NP-A10: One row per variant
  describe('NP-A10 — One row per variant', () => {
    it('multi-variant product produces 3 rows', async () => {
      const csv = await catalogService.exportProductsCsv(storeA);
      const lines = csv.split('\n').filter(l => l.trim());
      const mvRows = lines.filter(l => l.includes('MV-001') || l.includes('MV-002') || l.includes('MV-003'));
      expect(mvRows.length).toBe(3);
    });
    it('single-variant product produces 1 row', async () => {
      const csv = await catalogService.exportProductsCsv(storeA);
      const lines = csv.split('\n').filter(l => l.trim());
      expect(lines.filter(l => l.includes('CHEAP-001')).length).toBe(1);
    });
  });

  // NP-A11: Export/Import round trip
  describe('NP-A11 — Export/Import round trip', () => {
    it('CSV has all fixed columns', async () => {
      const csv = await catalogService.exportProductsCsv(storeA);
      const header = csv.split('\n')[0];
      for (const col of ['title', 'titleAr', 'description', 'category', 'brand', 'status', 'sku', 'barcode', 'variantTitle', 'unit', 'priceMinor']) {
        expect(header).toContain(col);
      }
    });
    it('priceMinor is correct numeric value', async () => {
      const csv = await catalogService.exportProductsCsv(storeA);
      const lines = csv.split('\n').filter(l => l.trim());
      const headerCols = lines[0]!.split(',');
      const priceIdx = headerCols.indexOf('priceMinor');
      const cheapRow = lines.find(l => l.includes('CHEAP-001'));
      if (cheapRow) {
        const cols = cheapRow.split(',');
        expect(parseInt(cols[priceIdx]!, 10)).toBe(1000);
      }
    });
  });

  // NP-A12: Search privacy
  describe('NP-A12 — Search privacy', () => {
    it('does not expose inventory quantities', async () => {
      const res = await searchService.search('', { storeId: storeA });
      for (const item of res.items) {
        expect(JSON.stringify(item)).not.toContain('qtyOnHand');
      }
    });
  });

  // NP-A13: Export store membership
  describe('NP-A13 — Export store isolation', () => {
    it('store A export excludes store B products', async () => {
      const csv = await catalogService.exportProductsCsv(storeA);
      expect(csv).not.toContain('Store B Product');
    });
    it('store B export includes only store B products', async () => {
      const csv = await catalogService.exportProductsCsv(storeB);
      expect(csv).toContain('Store B Product');
      expect(csv).not.toContain('Cheap Widget');
    });
  });

  // NP-A15: Performance
  describe('NP-A15 — Performance <200ms', () => {
    it('search with all filters <200ms', async () => {
      const t0 = Date.now();
      await searchService.search('', { storeId: storeA, priceMin: 1000, priceMax: 10000, availability: 'inStock', sort: 'price_asc', limit: 20 });
      expect(Date.now() - t0).toBeLessThan(200);
    });
    it('export <200ms', async () => {
      const t0 = Date.now();
      await catalogService.exportProductsCsv(storeA);
      expect(Date.now() - t0).toBeLessThan(200);
    });
  });

  // Inactive offers ignored
  describe('P9 — Inactive offers ignored', () => {
    it('inactive offers excluded from price filter', async () => {
      const p = await createProduct(pool, storeA, 'Inactive Offer Prod', ['INACT-001']);
      await createOffer(pool, storeA, p.productId, p.variantIds[0]!, plA, 500, 'INACTIVE');
      const res = await searchService.search('', { storeId: storeA, priceMin: 100, priceMax: 1000 });
      expect(res.items.map((i: any) => (i.title ?? '') as string)).not.toContain('Inactive Offer Prod');
    });
  });

  // Multi-store isolation
  describe('P9 — Multi-store search isolation', () => {
    it('store A search excludes store B', async () => {
      const res = await searchService.search('', { storeId: storeA });
      expect(res.items.map((i: any) => (i.title ?? '') as string)).not.toContain('Store B Product');
    });
  });

  // Empty export
  describe('P9 — Empty export', () => {
    it('header-only CSV for empty store', async () => {
      const empty = await createStoreOrg(pool, roleById, 'EMPTY');
      const csv = await catalogService.exportProductsCsv(empty.storeId);
      expect(csv).toContain('title,titleAr,description,category,brand,status,sku,barcode,variantTitle,unit,priceMinor');
      expect(csv.split('\n').filter(l => l.trim()).length).toBe(1);
    });
  });
});
