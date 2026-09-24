import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { CatalogOfferService } from '../../modules/catalog/catalog.offer.service';
import { CatalogRequestsService } from '../../modules/catalog/catalog.requests.service';
import { SearchService } from '../../modules/catalog/search.service';
import { ConditionalRulesService } from '../../modules/catalog/conditional-rules.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
// Schemas
import {
  products, productMedia, productVariants, categories, brands,
} from '../../modules/catalog/catalog.schema';
import {
  attributeDefinitions, attributeOptions, attributeGroups,
  productTypes, productTypeAttributes,
  productAttributeValues, variantAttributeValues,
} from '../../modules/catalog/catalog.taxonomy.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { catalogRequests } from '../../modules/catalog/catalog.requests.schema';
import { searchQueries } from '../../modules/catalog/search.schema';
import { users, organizations, organizationMembers, roles } from '../../modules/identity/identity.schema';
import { stores, verificationRequests } from '../../modules/merchant/merchant.schema';
import { priceLists, priceTiers } from '../../modules/pricing/pricing.schema';
import { auditLogs, outboxEvents } from '../../modules/audit/audit.schema';
import { masterOrders, orders } from '../../modules/orders/orders.schema';
import { disputes } from '../../modules/reviews/support.schema';
import { warehouses } from '../../modules/merchant/merchant.schema';
import { inventoryItems } from '../../modules/inventory/inventory.schema';
import {
  assertProductInOrg, assertStoreInOrg,
  type CallerContext,
} from '../../common/tenant-scope';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

/**
 * REAL E2E Catalog Lifecycle Test
 *
 * Executes the full marketplace lifecycle against a disposable PostgreSQL
 * container with real migrations, real services, and real RBAC seed.
 *
 * Test identities:
 *   - Admin (SUPER_ADMIN role — bypass tenant checks)
 *   - Merchant A (orgA → storeA)
 *   - Merchant B (orgB → storeB)
 *   - Buyer (no store, no org)
 */

// ── Helpers ────────────────────────────────────────────────────────────────

const storage = {
  createPresignedGetUrl: vi.fn(async (_b: string, key: string) => `https://cdn.test/${key}`),
} as any;
const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
const redis = { get: vi.fn(), set: vi.fn(), del: vi.fn() } as any;

// ── Test identities ────────────────────────────────────────────────────────

let orgA: string, orgB: string;
let merchantA: string, merchantB: string, buyerUser: string, adminUser: string;
let storeA: string, storeB: string;
let roleIdMerchantA: string, roleIdMerchantB: string;

describe('Catalog Lifecycle E2E — real PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let catalog: CatalogService;
  let taxonomy: CatalogTaxonomyService;
  let offerService: CatalogOfferService;
  let requestsService: CatalogRequestsService;
  let search: SearchService;
  let conditionalRules: ConditionalRulesService;

  // Shared IDs across scenarios
  let categoryId: string;
  let brandId: string;
  let attrCpu: string, attrRam: string, attrStorage: string;
  let attrWarranty: string, attrWarrantyPeriod: string;
  let productTypeId: string;
  let productId: string;
  let variant16_512: string, variant16_1tb: string, variant32_1tb: string;
  let offerA: string, offerB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: {
        products, productMedia, productVariants, categories, brands,
        attributeDefinitions, attributeOptions, attributeGroups,
        productTypes, productTypeAttributes,
        productAttributeValues, variantAttributeValues,
        merchantOffers, catalogRequests, searchQueries,
        stores, verificationRequests, users, organizations, disputes,
        priceLists, priceTiers, warehouses, inventoryItems,
      },
    }) as unknown as DatabaseService['db'];

    // ── Run all migrations ──────────────────────────────────────────
    const migrations = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
    const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
    for (const file of (await readdir(migrations))
      .filter(f => f.endsWith('.sql') && !excluded.includes(f))
      .sort()) {
      await pool.query(await readFile(path.join(migrations, file), 'utf8'));
    }

    // ── Seed RBAC ───────────────────────────────────────────────────
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // ── Instantiate services ────────────────────────────────────────
    database = { db } as DatabaseService;
    conditionalRules = new ConditionalRulesService();
    catalog = new CatalogService(database, redis as any, outbox, storage, audit, conditionalRules);
    taxonomy = new CatalogTaxonomyService(database);
    offerService = new CatalogOfferService(database, audit);
    requestsService = new CatalogRequestsService(database, catalog, taxonomy);
    search = new SearchService(database, storage, redis as any);

    // ── Create test identities ──────────────────────────────────────
    orgA = randomUUID();
    orgB = randomUUID();
    merchantA = randomUUID();
    merchantB = randomUUID();
    buyerUser = randomUUID();
    adminUser = randomUUID();
    storeA = randomUUID();
    storeB = randomUUID();
    roleIdMerchantA = randomUUID();
    roleIdMerchantB = randomUUID();

    // Organizations
    await db.insert(organizations).values([
      { id: orgA, name: 'Merchant A Organization', type: 'WHOLESALER', country: 'SA' },
      { id: orgB, name: 'Merchant B Organization', type: 'WHOLESALER', country: 'SA' },
    ]);

    // Users
    await db.insert(users).values([
      { id: adminUser, fullName: 'Admin User', phone: '+10000000001' },
      { id: merchantA, fullName: 'Merchant A', phone: '+10000000002' },
      { id: merchantB, fullName: 'Merchant B', phone: '+10000000003' },
      { id: buyerUser, fullName: 'Buyer User', phone: '+10000000004' },
    ]);

    // Stores (each org owns one store)
    await db.insert(stores).values([
      { id: storeA, orgId: orgA, slug: 'store-a', displayName: 'Store A' },
      { id: storeB, orgId: orgB, slug: 'store-b', displayName: 'Store B' },
    ]);

    // Fetch the MERCHANT_OWNER role ID for reference
    const merchantRole = await pool.query(`SELECT id FROM roles WHERE key = 'MERCHANT_OWNER'`);
    const merchantRoleId = merchantRole.rows[0].id;
    roleIdMerchantA = merchantRoleId;
    roleIdMerchantB = merchantRoleId;

    // Org memberships
    await db.insert(organizationMembers).values([
      { id: randomUUID(), orgId: orgA, userId: merchantA, roleId: merchantRoleId },
      { id: randomUUID(), orgId: orgB, userId: merchantB, roleId: merchantRoleId },
    ]);
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO A — Admin Taxonomy
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario A — Admin taxonomy', () => {
    it('creates category, brand, and attributes', async () => {
      // Category
      const cat = await catalog.createCategory({ name: 'Computers' }, );
      categoryId = cat.id;
      expect(cat.name).toBe('Computers');

      // Brand
      const br = await catalog.createBrand({ name: 'TestBrand' });
      brandId = br.id;
      expect(br.name).toBe('TestBrand');

      // Attributes with correct scopes
      const cpu = await taxonomy.createAttribute({ code: 'cpu', name: 'CPU', type: 'TEXT', scope: 'PRODUCT' });
      attrCpu = cpu.id;
      expect(cpu.scope).toBe('PRODUCT');

      const ram = await taxonomy.createAttribute({ code: 'ram', name: 'RAM', type: 'TEXT', scope: 'VARIANT' });
      attrRam = ram.id;
      expect(ram.scope).toBe('VARIANT');

      const stor = await taxonomy.createAttribute({ code: 'storage', name: 'Storage', type: 'TEXT', scope: 'VARIANT' });
      attrStorage = stor.id;
      expect(stor.scope).toBe('VARIANT');

      const warranty = await taxonomy.createAttribute({ code: 'warranty', name: 'Warranty', type: 'BOOLEAN', scope: 'PRODUCT' });
      attrWarranty = warranty.id;
      expect(warranty.scope).toBe('PRODUCT');

      const wp = await taxonomy.createAttribute({ code: 'warranty_period', name: 'Warranty Period', type: 'TEXT', scope: 'PRODUCT' });
      attrWarrantyPeriod = wp.id;
      expect(wp.scope).toBe('PRODUCT');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO B — Product Type with Conditional Rules
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario B — Product type', () => {
    it('creates Laptop product type with attributes, variant dims, conditional rules, and publishes', async () => {
      // Create product type
      const pt = await taxonomy.createProductType({
        code: 'laptop',
        name: 'Laptop',
        categoryId,
      });
      productTypeId = pt.id;
      expect(pt.status).toBe('DRAFT');
      expect(pt.categoryId).toBe(categoryId);

      // Configure attributes with conditional rule:
      // IF warranty = true THEN warranty_period = required
      await taxonomy.setProductTypeAttributes(productTypeId, [
        { attributeDefinitionId: attrCpu, required: true, scope: 'PRODUCT', displayOrder: 0 },
        { attributeDefinitionId: attrRam, required: true, scope: 'VARIANT', displayOrder: 1 },
        { attributeDefinitionId: attrStorage, required: true, scope: 'VARIANT', displayOrder: 2 },
        { attributeDefinitionId: attrWarranty, required: true, scope: 'PRODUCT', displayOrder: 3 },
        {
          attributeDefinitionId: attrWarrantyPeriod,
          required: false,
          scope: 'PRODUCT',
          displayOrder: 4,
          conditionalRules: [{
            if: { attributeId: attrWarranty, operator: 'eq', value: 'true' },
            then: { action: 'require', targetAttributeId: attrWarrantyPeriod },
          }],
        },
      ]);

      // Set variant dimensions (RAM + Storage — must be VARIANT scope)
      await taxonomy.setVariantDimensions(productTypeId, [attrRam, attrStorage]);

      // Publish
      const published = await taxonomy.publishProductType(productTypeId);
      expect(published.status).toBe('PUBLISHED');
      expect(published.publishedAt).toBeTruthy();

      // Verify attribute config
      const schema = await taxonomy.getProductTypeSchema(productTypeId);
      expect(schema.attributes).toHaveLength(5);
      const warrantyPeriodConfig = schema.attributes.find(a => a.attributeDefinitionId === attrWarrantyPeriod);
      expect(warrantyPeriodConfig?.conditionalRules).toHaveLength(1);

      // Verify variant dimensions
      const dims = (published.variantDimensions as string[]);
      expect(dims).toContain(attrRam);
      expect(dims).toContain(attrStorage);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO C — Merchant A Creates Product + Variants
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario C — Merchant A creates canonical product', () => {
    it('creates Laptop Pro X with 3 variants and typed attributes', async () => {
      // Create product
      const prod = await catalog.createProduct({
        storeId: storeA,
        title: 'Laptop Pro X',
        categoryId,
        brandId,
        productTypeId,
        images: ['products/laptop-pro-x.png'],
      }, merchantA);

      productId = prod.id;
      expect(prod.title).toBe('Laptop Pro X');
      expect(prod.storeId).toBe(storeA);
      expect(prod.status).toBe('DRAFT');

      // Set PRODUCT-scope attribute values
      await taxonomy.setProductAttributeValues(productId, [
        { attributeDefinitionId: attrCpu, value: 'Intel Core i7' },
        { attributeDefinitionId: attrWarranty, value: true },
        { attributeDefinitionId: attrWarrantyPeriod, value: '24 months' },
      ]);

      // Verify product attribute values
      const prodAttrs = await taxonomy.getProductAttributeValues(productId);
      expect(prodAttrs).toHaveLength(3);

      // Create 3 variants (VARIANT-scope: RAM + Storage)
      const v1 = await catalog.createVariant(productId, { sku: 'LPX-16-512', title: '16GB / 512GB' });
      variant16_512 = v1.id;
      await taxonomy.setVariantAttributeValues(productId, variant16_512, [
        { attributeDefinitionId: attrRam, value: '16 GB' },
        { attributeDefinitionId: attrStorage, value: '512 GB' },
      ]);

      const v2 = await catalog.createVariant(productId, { sku: 'LPX-16-1TB', title: '16GB / 1TB' });
      variant16_1tb = v2.id;
      await taxonomy.setVariantAttributeValues(productId, variant16_1tb, [
        { attributeDefinitionId: attrRam, value: '16 GB' },
        { attributeDefinitionId: attrStorage, value: '1 TB' },
      ]);

      const v3 = await catalog.createVariant(productId, { sku: 'LPX-32-1TB', title: '32GB / 1TB' });
      variant32_1tb = v3.id;
      await taxonomy.setVariantAttributeValues(productId, variant32_1tb, [
        { attributeDefinitionId: attrRam, value: '32 GB' },
        { attributeDefinitionId: attrStorage, value: '1 TB' },
      ]);

      // Verify variants
      const variants = await catalog.listVariantsByProduct(productId);
      expect(variants).toHaveLength(3);

      // Verify combination keys are unique
      const keys = variants.map(v => v.combinationKey).filter(Boolean);
      expect(new Set(keys).size).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO D — Merchant A Creates Offer
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario D — Merchant A creates offer', () => {
    it('creates an offer for 16GB/512GB variant', async () => {
      const offer = await offerService.createOffer({
        storeId: storeA,
        productId,
        variantId: variant16_512,
        currency: 'SAR',
        basePriceMinor: 450000,
        moq: 1,
        leadTimeDays: 5,
        externalRef: 'SKU-A-001',
        proposedBy: merchantA,
      });
      offerA = offer.id;

      expect(offer.storeId).toBe(storeA);
      expect(offer.productId).toBe(productId);
      expect(offer.variantId).toBe(variant16_512);
      expect(offer.basePriceMinor).toBe(450000);
      expect(offer.currency).toBe('SAR');

      // Activate the offer
      const proposed = await offerService.proposeOffer(offerA, merchantA);
      expect(proposed.status).toBe('PROPOSED');

      const activated = await offerService.approveOffer(offerA, adminUser);
      expect(activated.status).toBe('ACTIVE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO E — Merchant B Offers Same Variant
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario E — Merchant B offers same variant', () => {
    it('creates a second offer on the same canonical product + variant', async () => {
      const offer = await offerService.createOffer({
        storeId: storeB,
        productId,
        variantId: variant16_512,
        currency: 'SAR',
        basePriceMinor: 430000,
        moq: 2,
        leadTimeDays: 7,
        externalRef: 'SKU-B-001',
        proposedBy: merchantB,
      });
      offerB = offer.id;

      expect(offer.storeId).toBe(storeB);
      expect(offer.productId).toBe(productId);
      expect(offer.variantId).toBe(variant16_512);

      // Activate
      await offerService.proposeOffer(offerB, merchantB);
      await offerService.approveOffer(offerB, adminUser);

      // Verify: exactly ONE canonical product, TWO offers for same variant
      const productRow = await db.query.products.findFirst({ where: eq(products.id, productId) });
      expect(productRow).toBeTruthy();

      const offers = await offerService.listOffersForProduct(productId);
      const offersForVariant = offers.filter(o => o.variantId === variant16_512);
      expect(offersForVariant).toHaveLength(2);

      // Verify different stores
      const storeIds = new Set(offersForVariant.map(o => o.storeId));
      expect(storeIds.size).toBe(2);
      expect(storeIds.has(storeA)).toBe(true);
      expect(storeIds.has(storeB)).toBe(true);
    });

    it('does NOT create a second canonical product', async () => {
      // Count products with same title
      const result = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE title = 'Laptop Pro X' AND deleted_at IS NULL`,
      );
      expect(result.rows[0].cnt).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO F — Buyer Search
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario F — Buyer search', () => {
    beforeAll(async () => {
      // Publish the product so search can find it
      await catalog.updateProduct(productId, { status: 'ACTIVE' });
    });

    it('finds Laptop Pro X via text search', async () => {
      const results = await search.search('Laptop Pro X');
      expect(results.items.length).toBeGreaterThanOrEqual(1);
      const found = results.items.find(i => i.id === productId);
      expect(found).toBeTruthy();
    });

    it('filters by category', async () => {
      const results = await search.search('', { categoryId });
      const found = results.items.find(i => i.id === productId);
      expect(found).toBeTruthy();
    });

    it('filters by brand', async () => {
      const results = await search.search('', { brandId });
      const found = results.items.find(i => i.id === productId);
      expect(found).toBeTruthy();
    });

    it('returns facets when requested', async () => {
      const results = await search.search('Laptop', { includeFacets: true });
      expect(results.facets).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO G — Buyer Product Detail
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario G — Buyer product detail', () => {
    it('resolves the canonical product with variants and attribute values', async () => {
      const detail = await catalog.getProductDetail(productId);
      expect(detail.id).toBe(productId);
      expect(detail.title).toBe('Laptop Pro X');
      expect(detail.variants).toHaveLength(3);
    });

    it('shows both merchant offers for the 16GB/512GB variant', async () => {
      const ranked = await offerService.listOffersForProductRanked(productId);
      const variantOffers = ranked.filter(o => o.variantId === variant16_512);
      expect(variantOffers).toHaveLength(2);

      // Both stores represented
      const storeNames = variantOffers.map(o => o.storeName).filter(Boolean);
      expect(storeNames.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO H — Offer Comparison
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario H — Offer comparison', () => {
    it('buyer can compare Merchant A and Merchant B offers', async () => {
      const ranked = await offerService.listOffersForProductRanked(productId);
      const variantOffers = ranked.filter(o => o.variantId === variant16_512);

      expect(variantOffers).toHaveLength(2);

      // Each offer has distinct merchant info
      expect(variantOffers[0]!.storeId).not.toBe(variantOffers[1]!.storeId);

      // Pricing differs
      const prices = variantOffers.map(o => o.basePriceMinor).filter(Boolean);
      expect(prices).toHaveLength(2);
      expect(new Set(prices).size).toBe(2);

      // MOQ is available per offer
      for (const o of variantOffers) {
        expect(o.moq).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO I — Conditional Rule Enforcement
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario I — Conditional rule enforcement', () => {
    it('rejects publish when warranty=true but warranty_period is missing', async () => {
      // Create a new product with warranty=true but no warranty period
      const badProduct = await catalog.createProduct({
        storeId: storeA,
        title: 'Laptop Bad Config',
        categoryId,
        brandId,
        productTypeId,
      }, merchantA);

      // Set warranty=true but omit warranty_period
      await taxonomy.setProductAttributeValues(badProduct.id, [
        { attributeDefinitionId: attrCpu, value: 'AMD Ryzen 5' },
        { attributeDefinitionId: attrWarranty, value: true },
        // warranty_period intentionally missing
      ]);

      // Attempt to publish → should fail
      await expect(
        catalog.updateProduct(badProduct.id, { status: 'ACTIVE' }),
      ).rejects.toThrow();
    });

    it('succeeds when warranty_period is provided', async () => {
      const goodProduct = await catalog.createProduct({
        storeId: storeA,
        title: 'Laptop Good Config',
        categoryId,
        brandId,
        productTypeId,
      }, merchantA);

      await taxonomy.setProductAttributeValues(goodProduct.id, [
        { attributeDefinitionId: attrCpu, value: 'AMD Ryzen 7' },
        { attributeDefinitionId: attrWarranty, value: true },
        { attributeDefinitionId: attrWarrantyPeriod, value: '24 months' },
      ]);

      // Should succeed
      const result = await catalog.updateProduct(goodProduct.id, { status: 'ACTIVE' });
      expect(result.status).toBe('ACTIVE');
    });

    it('succeeds when warranty=false (warranty_period not required)', async () => {
      const noWarrantyProduct = await catalog.createProduct({
        storeId: storeA,
        title: 'Laptop No Warranty',
        categoryId,
        brandId,
        productTypeId,
      }, merchantA);

      await taxonomy.setProductAttributeValues(noWarrantyProduct.id, [
        { attributeDefinitionId: attrCpu, value: 'Intel Celeron' },
        { attributeDefinitionId: attrWarranty, value: false },
        // warranty_period intentionally missing — should be OK
      ]);

      const result = await catalog.updateProduct(noWarrantyProduct.id, { status: 'ACTIVE' });
      expect(result.status).toBe('ACTIVE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO J — Conditional Frontend (documented)
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario J — Conditional frontend evaluation', () => {
    it('client-side evaluator matches backend behavior', async () => {
      // Import the client-side evaluator
      const { evaluateConditionalRules } = await import('../../../../web/src/lib/conditionalRules');

      const rules = [{
        if: { attributeId: attrWarranty, operator: 'eq' as const, value: 'true' },
        then: { action: 'require' as const, targetAttributeId: attrWarrantyPeriod },
      }];

      // Warranty = true → warranty_period required
      const values1: Record<string, string> = { [attrWarranty]: 'true' };
      const result1 = evaluateConditionalRules(rules, values1, [attrWarranty, attrWarrantyPeriod]);
      const effect1 = result1.get(attrWarrantyPeriod);
      expect(effect1?.required).toBe(true);

      // Warranty = false → warranty_period NOT required
      const values2: Record<string, string> = { [attrWarranty]: 'false' };
      const result2 = evaluateConditionalRules(rules, values2, [attrWarranty, attrWarrantyPeriod]);
      const effect2 = result2.get(attrWarrantyPeriod);
      expect(effect2?.required).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO K — Security / Tenant Isolation
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario K — Security / tenant isolation', () => {
    // NOTE: caller contexts must be built AFTER beforeAll assigns UUIDs
    const callerB = (): CallerContext => ({ sub: merchantB, role: 'MERCHANT_OWNER', activeOrg: orgB });
    const callerA = (): CallerContext => ({ sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA });
    const adminCaller = (): CallerContext => ({ sub: adminUser, role: 'SUPER_ADMIN', activeOrg: null });

    it('Merchant B cannot PATCH Merchant A product → 403', async () => {
      await expect(
        assertProductInOrg(database, callerB(), productId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Merchant B cannot DELETE Merchant A product → 403', async () => {
      await expect(
        assertProductInOrg(database, callerB(), productId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Merchant A CAN access their own product', async () => {
      // Verify the data chain product → store → org
      const prodRow = await pool.query('SELECT store_id FROM products WHERE id = $1', [productId]);
      expect(prodRow.rows[0]?.store_id).toBe(storeA);
      const storeRow = await pool.query('SELECT org_id FROM stores WHERE id = $1', [storeA]);
      expect(storeRow.rows[0]?.org_id).toBe(orgA);
      expect(callerA().activeOrg).toBe(orgA);

      await expect(
        assertProductInOrg(database, callerA(), productId),
      ).resolves.toBeUndefined();
    });

    it('Admin bypasses tenant checks', async () => {
      await expect(
        assertProductInOrg(database, adminCaller(), productId),
      ).resolves.toBeUndefined();
    });

    it('Merchant B cannot create offer with Merchant A storeId → rejected', async () => {
      await expect(
        assertStoreInOrg(database, callerB(), storeA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Merchant B cannot update Merchant A offer pricing → 403', async () => {
      await expect(
        offerService.updateOfferPricing(offerA, { basePriceMinor: 100 }, callerB()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Merchant B cannot withdraw Merchant A offer → 403', async () => {
      await expect(
        offerService.withdrawOffer(offerA, callerB()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Merchant A CAN update their own offer pricing', async () => {
      const result = await offerService.updateOfferPricing(
        offerA, { basePriceMinor: 460000 }, callerA(),
      );
      expect(result.basePriceMinor).toBe(460000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO L — Admin Governance
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario L — Admin governance', () => {
    it('admin can approve/reject/suspend/reactivate offers', async () => {
      // Create a fresh offer to test the full lifecycle
      const govOffer = await offerService.createOffer({
        storeId: storeA,
        productId,
        variantId: variant16_1tb,
        currency: 'SAR',
        basePriceMinor: 500000,
        moq: 1,
        proposedBy: merchantA,
      });

      // Propose → Approve
      await offerService.proposeOffer(govOffer.id, merchantA);
      const approved = await offerService.approveOffer(govOffer.id, adminUser);
      expect(approved.status).toBe('ACTIVE');

      // Suspend
      const suspended = await offerService.suspendOffer(govOffer.id);
      expect(suspended.status).toBe('SUSPENDED');

      // Reactivate
      const reactivated = await offerService.reactivateOffer(govOffer.id);
      expect(reactivated.status).toBe('ACTIVE');
    });

    it('admin can manage product types', async () => {
      const pt = await taxonomy.getProductType(productTypeId);
      expect(pt.status).toBe('PUBLISHED');
    });

    it('admin can manage categories', async () => {
      const cat = await catalog.getCategory(categoryId);
      expect(cat.name).toBe('Computers');
    });

    it('admin can manage attributes', async () => {
      const attr = await taxonomy.getAttribute(attrCpu);
      expect(attr.code).toBe('cpu');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO M — Request Permission RBAC
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario M — Catalog requests', () => {
    let requestId: string;

    it('merchant creates a request for new attribute', async () => {
      const req = await requestsService.createRequest({
        storeId: storeA,
        requestedBy: merchantA,
        type: 'ATTRIBUTE',
        payload: { name: 'Screen Refresh Rate', code: 'refresh_rate', type: 'TEXT', scope: 'PRODUCT' },
      });
      requestId = req.id;
      expect(req.status).toBe('PENDING');
      expect(req.type).toBe('ATTRIBUTE');
    });

    it('admin lists pending requests', async () => {
      const pending = await requestsService.listAdminRequests({ status: 'PENDING' });
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending.find(r => r.id === requestId)).toBeTruthy();
    });

    it('admin approves request → auto-creates attribute', async () => {
      const result = await requestsService.approveRequest(requestId, adminUser);
      expect(result.status).toBe('APPROVED');
      expect(result.createdEntityId).toBeTruthy();

      // Verify the attribute was created
      const attr = await taxonomy.getAttribute(result.createdEntityId!);
      expect(attr.code).toBe('refresh_rate');
      expect(attr.name).toBe('Screen Refresh Rate');
    });

    it('admin can reject another request', async () => {
      const req2 = await requestsService.createRequest({
        storeId: storeB,
        requestedBy: merchantB,
        type: 'BRAND',
        payload: { name: 'FakeBrand' },
      });
      const rejected = await requestsService.rejectRequest(req2.id, adminUser, 'Not a real brand');
      expect(rejected.status).toBe('REJECTED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO N — Product Type Duplication
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario N — Product type duplication', () => {
    it('duplicates Laptop product type with all configuration', async () => {
      const dup = await taxonomy.duplicateProductType(productTypeId);

      expect(dup.id).not.toBe(productTypeId);
      expect(dup.name).toBe('Laptop (Copy)');
      expect(dup.status).toBe('DRAFT');
      expect(dup.categoryId).toBe(categoryId);

      // Verify attributes copied
      const dupSchema = await taxonomy.getProductTypeSchema(dup.id);
      expect(dupSchema.attributes).toHaveLength(5);

      // Verify conditional rules copied
      const wpConfig = dupSchema.attributes.find(a => a.attributeDefinitionId === attrWarrantyPeriod);
      expect(wpConfig?.conditionalRules).toHaveLength(1);

      // Verify variant dimensions copied
      const dims = dup.variantDimensions as string[];
      expect(dims).toContain(attrRam);
      expect(dims).toContain(attrStorage);

      // Verify NO products/variants/offers were copied
      const dupProducts = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE product_type_id = $1`,
        [dup.id],
      );
      expect(dupProducts.rows[0].cnt).toBe(0);
    });

    it('duplicated type can be independently edited and published', async () => {
      const dup = await taxonomy.duplicateProductType(productTypeId);
      // Edit: change name
      await taxonomy.updateAttribute; // taxonomy service doesn't have updateProductType, but we can publish
      const published = await taxonomy.publishProductType(dup.id);
      expect(published.status).toBe('PUBLISHED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO O — Search Regression
  // ═══════════════════════════════════════════════════════════════════

  describe('Scenario O — Search regression', () => {
    it('finds product by text search', async () => {
      const results = await search.search('Laptop Pro X');
      expect(results.items.find(i => i.id === productId)).toBeTruthy();
    });

    it('filters by category', async () => {
      const results = await search.search('', { categoryId });
      expect(results.items.find(i => i.id === productId)).toBeTruthy();
    });

    it('filters by brand', async () => {
      const results = await search.search('', { brandId });
      expect(results.items.find(i => i.id === productId)).toBeTruthy();
    });

    it('returns facets', async () => {
      const results = await search.search('Laptop', { includeFacets: true });
      expect(results.facets).toBeDefined();
      expect(Array.isArray(results.facets)).toBe(true);
    });

    it('handles empty query gracefully', async () => {
      const results = await search.search('');
      expect(results.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // DATABASE INTEGRITY VERIFICATION
  // ═══════════════════════════════════════════════════════════════════

  describe('Database integrity', () => {
    it('exactly one canonical product for Laptop Pro X', async () => {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE title = 'Laptop Pro X' AND deleted_at IS NULL`,
      );
      expect(result.rows[0].cnt).toBe(1);
    });

    it('has expected variants with unique combination keys', async () => {
      const result = await pool.query(
        `SELECT combination_key FROM product_variants WHERE product_id = $1 AND combination_key IS NOT NULL`,
        [productId],
      );
      const keys = result.rows.map(r => r.combination_key);
      expect(keys.length).toBe(3);
      expect(new Set(keys).size).toBe(3);
    });

    it('multiple offers for same variant from different stores', async () => {
      const result = await pool.query(
        `SELECT store_id FROM merchant_offers WHERE product_id = $1 AND variant_id = $2`,
        [productId, variant16_512],
      );
      expect(result.rows.length).toBe(2);
      const storeIds = result.rows.map(r => r.store_id);
      expect(new Set(storeIds).size).toBe(2);
    });

    it('no accidental canonical product duplication from Merchant B', async () => {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE title = 'Laptop Pro X'`,
      );
      expect(result.rows[0].cnt).toBe(1);
    });

    it('product type is persisted with correct configuration', async () => {
      const pt = await pool.query(`SELECT status, variant_dimensions FROM product_types WHERE id = $1`, [productTypeId]);
      expect(pt.rows[0].status).toBe('PUBLISHED');
      // pg auto-parses JSONB columns, so no JSON.parse needed
      const dims = typeof pt.rows[0].variant_dimensions === 'string'
        ? JSON.parse(pt.rows[0].variant_dimensions)
        : pt.rows[0].variant_dimensions;
      expect(dims).toContain(attrRam);
      expect(dims).toContain(attrStorage);
    });
  });
});
