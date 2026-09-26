/**
 * Integration test — Catalog Governance round-trip & relationship integrity.
 *
 * Spec §29: Workbook A → Import → Database → Export → Workbook B → Re-import
 *           Expected second import: Created 0, Unexpected Updates 0,
 *           Duplicates 0, Rejected 0.
 *
 * Spec §30: After importing the acceptance workbook, verify every FK
 *           relationship is valid (Products→Category, Products→Brand,
 *           Products→ProductType, ProductTypeAttributes→AttributeDefinition,
 *           Variants→Product, VariantAttributeValues→AttributeDefinition,
 *           ProductAttributeValues→AttributeDefinition,
 *           AttributeOptions→AttributeDefinition).
 *
 * Requires a real PostgreSQL container (testcontainers).
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql, like, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

// ── Schemas ──────────────────────────────────────────────────────────────
import {
  products, productMedia, productVariants, categories, brands, productSources,
} from '../../modules/catalog/catalog.schema';
import {
  attributeDefinitions, attributeOptions, attributeGroups,
  productTypes, productTypeAttributes,
  productAttributeValues, variantAttributeValues,
} from '../../modules/catalog/catalog.taxonomy.schema';
import { stores, verificationRequests } from '../../modules/merchant/merchant.schema';
import { users, organizations, organizationMembers } from '../../modules/identity/identity.schema';
import { priceLists, priceTiers } from '../../modules/pricing/pricing.schema';
import { auditLogs, outboxEvents } from '../../modules/audit/audit.schema';
import { masterOrders, orders } from '../../modules/orders/orders.schema';
import { disputes } from '../../modules/reviews/support.schema';
import { warehouses } from '../../modules/merchant/merchant.schema';
import { inventoryItems } from '../../modules/inventory/inventory.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { catalogRequests } from '../../modules/catalog/catalog.requests.schema';
import { searchQueries } from '../../modules/catalog/search.schema';

// ── Services ─────────────────────────────────────────────────────────────
import { DatabaseService } from '../../common/database/database.service';
import { ExcelParserService } from '../../modules/catalog-import/excel-parser.service';
import { ExcelValidatorService } from '../../modules/catalog-import/excel-validator.service';
import { ExcelResolverService } from '../../modules/catalog-import/excel-resolver.service';
import { ExcelPlannerService } from '../../modules/catalog-import/excel-planner.service';
import { ExcelExecutorService } from '../../modules/catalog-import/excel-executor.service';
import { TemplateGeneratorService } from '../../modules/catalog-import/template-generator.service';
import { CatalogValidationService } from '../../modules/catalog/catalog.validation-service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { ConditionalRulesService } from '../../modules/catalog/conditional-rules.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';

// ── Helpers ──────────────────────────────────────────────────────────────

const storage = {
  createPresignedGetUrl: vi.fn(async (_b: string, key: string) => `https://cdn.test/${key}`),
} as any;
const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
const redis = { get: vi.fn(), set: vi.fn(), del: vi.fn() } as any;

/**
 * Build a realistic multi-sheet catalog workbook (Workbook A) that exercises
 * every entity type and cross-sheet reference the importer supports.
 */
async function buildAcceptanceWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // ── Categories (with hierarchy) ────────────────────────────────
  const catWs = wb.addWorksheet('Categories');
  catWs.addRow(['slug', 'name', 'name_ar', 'description', 'parent_slug', 'sort_order']);
  catWs.addRow(['electronics', 'Electronics', 'إلكترونيات', 'All electronics', '', 0]);
  catWs.addRow(['computers', 'Computers', 'حواسيب', 'Desktop & laptop computers', 'electronics', 1]);
  catWs.addRow(['laptops', 'Laptops', 'حواسيب محمولة', 'Portable computers', 'computers', 2]);
  catWs.addRow(['gaming-laptops', 'Gaming Laptops', 'حواسيب ألعاب', 'High-performance laptops', 'laptops', 3]);
  catWs.addRow(['phones', 'Phones', 'هواتف', 'Mobile phones', 'electronics', 4]);

  // ── Brands ─────────────────────────────────────────────────────
  const brandWs = wb.addWorksheet('Brands');
  brandWs.addRow(['slug', 'name', 'name_ar', 'description']);
  brandWs.addRow(['dell', 'Dell', 'ديل', 'Dell Technologies']);
  brandWs.addRow(['lenovo', 'Lenovo', 'لينوفو', 'Lenovo Group']);
  brandWs.addRow(['hp', 'HP', 'إتش بي', 'HP Inc.']);

  // ── Attribute Groups ───────────────────────────────────────────
  const agWs = wb.addWorksheet('Attribute Groups');
  agWs.addRow(['name', 'name_ar', 'kind']);
  agWs.addRow(['Specifications', 'المواصفات', 'TECHNICAL']);
  agWs.addRow(['Physical', 'الخصائص الفيزيائية', 'PHYSICAL']);

  // ── Attributes ─────────────────────────────────────────────────
  const attrWs = wb.addWorksheet('Attributes');
  attrWs.addRow(['code', 'name', 'name_ar', 'description', 'type', 'scope', 'unit', 'validation']);
  const attrDefs = [
    ['cpu-model', 'CPU Model', 'موديل المعالج', 'Processor model', 'SELECT', 'PRODUCT', '', '{}'],
    ['ram-gb', 'RAM (GB)', 'الذاكرة (جيجابايت)', 'RAM in gigabytes', 'INTEGER', 'VARIANT', 'GB', '{}'],
    ['storage-gb', 'Storage (GB)', 'التخزين (جيجابايت)', 'Storage capacity', 'INTEGER', 'VARIANT', 'GB', '{}'],
    ['screen-size', 'Screen Size', 'حجم الشاشة', 'Diagonal screen size', 'DECIMAL', 'PRODUCT', 'inches', '{}'],
    ['resolution', 'Resolution', 'الدقة', 'Display resolution', 'SELECT', 'PRODUCT', '', '{}'],
    ['color', 'Color', 'اللون', 'Product color', 'SELECT', 'VARIANT', '', '{}'],
  ];
  for (const a of attrDefs) attrWs.addRow(a);

  // ── Attribute Options ──────────────────────────────────────────
  const optWs = wb.addWorksheet('Attribute Options');
  optWs.addRow(['attribute_code', 'value', 'value_ar', 'label', 'sort_order']);
  const optData = [
    ['cpu-model', 'Intel Core i5-1335U', '', 'Core i5', 0],
    ['cpu-model', 'Intel Core i7-1355U', '', 'Core i7', 1],
    ['cpu-model', 'AMD Ryzen 7 7730U', '', 'Ryzen 7', 2],
    ['resolution', '1920x1080', '', 'FHD', 0],
    ['resolution', '2560x1440', '', 'QHD', 1],
    ['resolution', '3840x2160', '', '4K UHD', 2],
    ['color', 'black', 'أسود', 'Black', 0],
    ['color', 'silver', 'فضي', 'Silver', 1],
  ];
  for (const o of optData) optWs.addRow(o);

  // ── Product Types ──────────────────────────────────────────────
  const ptWs = wb.addWorksheet('Product Types');
  ptWs.addRow(['code', 'name', 'name_ar', 'description', 'category_slug', 'variant_dimensions']);
  ptWs.addRow(['business-laptop', 'Business Laptop', 'لابتوب أعمال', 'Standard business laptop', 'laptops', 'ram-gb,storage-gb,color']);
  ptWs.addRow(['gaming-laptop', 'Gaming Laptop', 'لابتوب ألعاب', 'High-performance gaming laptop', 'gaming-laptops', 'ram-gb,storage-gb,color']);

  // ── Product Type Attributes ────────────────────────────────────
  const ptaWs = wb.addWorksheet('Product Type Attributes');
  ptaWs.addRow(['product_type_code', 'attribute_code', 'group_name', 'required', 'scope', 'display_order', 'filterable', 'searchable', 'visible_in_listing', 'visible_in_detail']);
  const ptaData = [
    ['business-laptop', 'cpu-model', 'Specifications', true, 'PRODUCT', 0, true, true, true, true],
    ['business-laptop', 'ram-gb', 'Specifications', true, 'VARIANT', 1, true, false, true, true],
    ['business-laptop', 'storage-gb', 'Specifications', true, 'VARIANT', 2, true, false, true, true],
    ['business-laptop', 'screen-size', 'Specifications', false, 'PRODUCT', 3, false, true, true, true],
    ['business-laptop', 'resolution', 'Specifications', false, 'PRODUCT', 4, true, true, true, true],
    ['business-laptop', 'color', 'Physical', false, 'VARIANT', 5, true, false, true, true],
    ['gaming-laptop', 'cpu-model', 'Specifications', true, 'PRODUCT', 0, true, true, true, true],
    ['gaming-laptop', 'ram-gb', 'Specifications', true, 'VARIANT', 1, true, false, true, true],
    ['gaming-laptop', 'storage-gb', 'Specifications', true, 'VARIANT', 2, true, false, true, true],
    ['gaming-laptop', 'screen-size', 'Specifications', false, 'PRODUCT', 3, false, true, true, true],
    ['gaming-laptop', 'resolution', 'Specifications', true, 'PRODUCT', 4, true, true, true, true],
    ['gaming-laptop', 'color', 'Physical', false, 'VARIANT', 5, true, false, true, true],
  ];
  for (const p of ptaData) ptaWs.addRow(p);

  // ── Products ───────────────────────────────────────────────────
  const prodWs = wb.addWorksheet('Products');
  prodWs.addRow(['slug', 'title', 'title_ar', 'description', 'description_ar', 'brand_slug', 'product_type_code', 'category_slug', 'mpn', 'gtin', 'ean', 'condition', 'status']);
  prodWs.addRow(['latitude-5550', 'Latitude 5550', 'لاتيتيود 5550', 'Dell business laptop', '', 'dell', 'business-laptop', 'laptops', 'LAT-5550', '', '', 'NEW', 'DRAFT']);
  prodWs.addRow(['thinkpad-t14', 'ThinkPad T14', 'ثينكباد T14', 'Lenovo business laptop', '', 'lenovo', 'business-laptop', 'laptops', 'TP-T14', '', '', 'NEW', 'DRAFT']);
  prodWs.addRow(['rog-strix-g15', 'ROG Strix G15', 'ROG ستريكس G15', 'ASUS gaming laptop', '', 'hp', 'gaming-laptop', 'gaming-laptops', 'ROG-G15', '', '', 'NEW', 'DRAFT']);

  // ── Product Attributes ─────────────────────────────────────────
  const paWs = wb.addWorksheet('Product Attributes');
  paWs.addRow(['product_slug', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key']);
  paWs.addRow(['latitude-5550', 'cpu-model', '', '', '', 'Intel Core i5-1335U']);
  paWs.addRow(['latitude-5550', 'screen-size', '', '14.0', '', '']);
  paWs.addRow(['latitude-5550', 'resolution', '', '', '', '1920x1080']);
  paWs.addRow(['thinkpad-t14', 'cpu-model', '', '', '', 'Intel Core i7-1355U']);
  paWs.addRow(['thinkpad-t14', 'screen-size', '', '14.0', '', '']);
  paWs.addRow(['thinkpad-t14', 'resolution', '', '', '', '2560x1440']);
  paWs.addRow(['rog-strix-g15', 'cpu-model', '', '', '', 'AMD Ryzen 7 7730U']);
  paWs.addRow(['rog-strix-g15', 'screen-size', '', '15.6', '', '']);
  paWs.addRow(['rog-strix-g15', 'resolution', '', '', '', '3840x2160']);

  // ── Variants ───────────────────────────────────────────────────
  const varWs = wb.addWorksheet('Variants');
  varWs.addRow(['product_slug', 'sku', 'title', 'title_ar', 'barcode', 'unit', 'weight_grams']);
  varWs.addRow(['latitude-5550', 'LAT-5550-I5-16-512', '16GB/512GB', '', '', 'PCS', 1800]);
  varWs.addRow(['latitude-5550', 'LAT-5550-I7-32-1TB', '32GB/1TB', '', '', 'PCS', 1850]);
  varWs.addRow(['thinkpad-t14', 'TP-T14-I7-16-512', '16GB/512GB', '', '', 'PCS', 1600]);
  varWs.addRow(['rog-strix-g15', 'ROG-G15-R7-32-1TB', '32GB/1TB Black', '', '', 'PCS', 2300]);

  // ── Variant Attributes ─────────────────────────────────────────
  const vaWs = wb.addWorksheet('Variant Attributes');
  vaWs.addRow(['variant_sku', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'ram-gb', '', '16', '', '']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'storage-gb', '', '512', '', '']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'color', '', '', '', 'silver']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'ram-gb', '', '32', '', '']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'storage-gb', '', '1024', '', '']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'color', '', '', '', 'silver']);
  vaWs.addRow(['TP-T14-I7-16-512', 'ram-gb', '', '16', '', '']);
  vaWs.addRow(['TP-T14-I7-16-512', 'storage-gb', '', '512', '', '']);
  vaWs.addRow(['TP-T14-I7-16-512', 'color', '', '', '', 'black']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'ram-gb', '', '32', '', '']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'storage-gb', '', '1024', '', '']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'color', '', '', '', 'black']);

  // ── Sources ─────────────────────────────────────────────────────
  const srcWs = wb.addWorksheet('Sources');
  srcWs.addRow(['product_slug', 'source_type', 'source_url', 'verified_at']);
  srcWs.addRow(['latitude-5550', 'MANUFACTURER', 'https://dell.com/latitude5550', '2026-01-15T00:00:00Z']);
  srcWs.addRow(['latitude-5550', 'DISTRIBUTOR', 'https://dist.example.com/lat5550', '']);
  srcWs.addRow(['thinkpad-t14', 'MANUFACTURER', 'https://lenovo.com/thinkpad-t14', '2026-02-01T00:00:00Z']);
  srcWs.addRow(['rog-strix-g15', 'MANUFACTURER', 'https://hp.com/rog-strix-g15', '']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('Catalog Governance — Round-Trip & Relationship Integrity', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;

  // Pipeline services
  let parser: ExcelParserService;
  let validator: ExcelValidatorService;
  let resolver: ExcelResolverService;
  let planner: ExcelPlannerService;
  let executor: ExcelExecutorService;
  let templateGen: TemplateGeneratorService;
  let taxonomy: CatalogTaxonomyService;
  let catalog: CatalogService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: {
        products, productMedia, productVariants, categories, brands, productSources,
        attributeDefinitions, attributeOptions, attributeGroups,
        productTypes, productTypeAttributes,
        productAttributeValues, variantAttributeValues,
        merchantOffers, catalogRequests, searchQueries,
        stores, verificationRequests, users, organizations, disputes,
        priceLists, priceTiers, warehouses, inventoryItems,
      },
    }) as unknown as DatabaseService['db'];

    // ── Run all migrations ────────────────────────────────────────
    const migrations = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
    const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
    for (const file of (await readdir(migrations))
      .filter(f => f.endsWith('.sql') && !excluded.includes(f))
      .sort()) {
      await pool.query(await readFile(path.join(migrations, file), 'utf8'));
    }

    // ── Seed RBAC ─────────────────────────────────────────────────
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // ── Instantiate services ──────────────────────────────────────
    database = { db } as DatabaseService;
    const validationService = new CatalogValidationService();
    const conditionalRules = new ConditionalRulesService();

    parser = new ExcelParserService();
    validator = new ExcelValidatorService(validationService);
    resolver = new ExcelResolverService(database);
    planner = new ExcelPlannerService();
    executor = new ExcelExecutorService(database);
    templateGen = new TemplateGeneratorService(database, validationService);
    taxonomy = new CatalogTaxonomyService(database);
    catalog = new CatalogService(database, redis as any, outbox, storage, audit, conditionalRules);
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  // §29 — ROUND-TRIP TEST
  // ═══════════════════════════════════════════════════════════════════

  describe('§29 — Round-trip: Import → Export → Re-import', () => {
    it('imports Workbook A into an empty database', async () => {
      const buf = await buildAcceptanceWorkbook();
      const workbook = await parser.parse(buf, 'acceptance.xlsx');

      // Validate
      const snapshot = await loadExistingDataSnapshot();
      const errors = validator.validate(workbook, snapshot);
      const hardErrors = errors.filter(e => e.severity === 'ERROR');
      expect(hardErrors).toHaveLength(0);

      // Resolve + Plan + Execute
      const refs = await resolver.resolve(workbook);
      const existing = await loadExistingEntityMap();
      const plan = planner.buildPlan(workbook, refs, existing);
      const result = await executor.execute(plan, refs);

      // All entities should be CREATE (empty DB)
      expect(result.created).toBeGreaterThan(0);
      if (result.errors.length > 0) {
        // Log the actual executor errors for CI diagnostics
        console.error('Executor errors during initial import:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.errors).toHaveLength(0);

      // Verify basic counts
      const catCount = await pool.query('SELECT COUNT(*)::int FROM categories WHERE store_id IS NULL');
      expect(catCount.rows[0].count).toBe(5); // electronics, computers, laptops, gaming-laptops, phones

      const brandCount = await pool.query('SELECT COUNT(*)::int FROM brands');
      expect(brandCount.rows[0].count).toBe(3); // dell, lenovo, hp

      const ptCount = await pool.query('SELECT COUNT(*)::int FROM product_types');
      expect(ptCount.rows[0].count).toBe(2); // business-laptop, gaming-laptop

      const prodCount = await pool.query('SELECT COUNT(*)::int FROM products WHERE store_id IS NULL');
      expect(prodCount.rows[0].count).toBe(3); // latitude, thinkpad, rog

      const varCount = await pool.query('SELECT COUNT(*)::int FROM product_variants');
      expect(varCount.rows[0].count).toBe(4); // 4 variants total

      const srcCount = await pool.query('SELECT COUNT(*)::int FROM product_sources');
      expect(srcCount.rows[0].count).toBe(4); // 4 sources total
    });

    it('exports the database to Workbook B', async () => {
      const exportBuf = Buffer.from(await templateGen.generateExport());
      expect(exportBuf).toBeTruthy();
      expect(exportBuf.length).toBeGreaterThan(0);

      // Parse the export to verify it has the expected sheets.
      // The parser keys its `sheets` Map by entity type (lowercase), but
      // `sheetNames` preserves the original worksheet names from the workbook.
      const exportWb = await parser.parse(exportBuf, 'export.xlsx');

      // All 12 entity sheets should be present
      expect(exportWb.sheetNames).toContain('Categories');
      expect(exportWb.sheetNames).toContain('Brands');
      expect(exportWb.sheetNames).toContain('Attributes');
      expect(exportWb.sheetNames).toContain('Attribute Options');
      expect(exportWb.sheetNames).toContain('Product Types');
      expect(exportWb.sheetNames).toContain('Product Type Attributes');
      expect(exportWb.sheetNames).toContain('Products');
      expect(exportWb.sheetNames).toContain('Product Attributes');
      expect(exportWb.sheetNames).toContain('Variants');
      expect(exportWb.sheetNames).toContain('Variant Attributes');
    });

    it('re-importing Workbook B produces 0 creates, 0 updates, 0 rejected', async () => {
      // Export
      const exportBuf = Buffer.from(await templateGen.generateExport());

      // Parse Workbook B
      const workbook = await parser.parse(exportBuf, 'export.xlsx');

      // Validate against current DB state
      const snapshot = await loadExistingDataSnapshot();
      const errors = validator.validate(workbook, snapshot);
      const hardErrors = errors.filter(e => e.severity === 'ERROR');
      expect(hardErrors).toHaveLength(0);

      // Resolve + Plan
      const refs = await resolver.resolve(workbook);
      const existing = await loadExistingEntityMap();
      const plan = planner.buildPlan(workbook, refs, existing);

      // The key assertion: everything should be UNCHANGED
      if (plan.summary.totalCreate > 0) {
        // Log which entity types have unexpected CREATE actions for CI diagnostics
        const createsByEntity = Object.entries(plan.summary.byEntity)
          .filter(([, v]) => v.create > 0)
          .map(([k, v]) => `${k}: ${v.create}`);
        console.error('Unexpected CREATEs by entity:', createsByEntity.join(', '));
      }
      expect(plan.summary.totalCreate).toBe(0);
      expect(plan.summary.totalUpdate).toBe(0);
      expect(plan.summary.totalUnchanged).toBeGreaterThan(0);

      // Execute (should be a no-op)
      const result = await executor.execute(plan, refs);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('three-time idempotency: third import also produces 0 creates, 0 updates', async () => {
      // Third import using the same exported workbook — must also be fully idempotent
      const exportBuf2 = Buffer.from(await templateGen.generateExport());
      const workbook3 = await parser.parse(exportBuf2, 'export-3.xlsx');
      const snapshot3 = await loadExistingDataSnapshot();
      const errors3 = validator.validate(workbook3, snapshot3);
      expect(errors3.filter(e => e.severity === 'ERROR')).toHaveLength(0);

      const refs3 = await resolver.resolve(workbook3);
      const existing3 = await loadExistingEntityMap();
      const plan3 = planner.buildPlan(workbook3, refs3, existing3);

      expect(plan3.summary.totalCreate).toBe(0);
      expect(plan3.summary.totalUpdate).toBe(0);
      expect(plan3.summary.totalUnchanged).toBeGreaterThan(0);

      const result3 = await executor.execute(plan3, refs3);
      expect(result3.created).toBe(0);
      expect(result3.updated).toBe(0);
      expect(result3.rejected).toBe(0);
      expect(result3.errors).toHaveLength(0);

      // Verify no duplicates were introduced by the third import
      const dupCats = await pool.query(
        `SELECT slug, COUNT(*)::int as cnt FROM categories WHERE store_id IS NULL GROUP BY slug HAVING COUNT(*) > 1`,
      );
      expect(dupCats.rows).toHaveLength(0);
      const dupVars = await pool.query(
        `SELECT sku, COUNT(*)::int as cnt FROM product_variants GROUP BY sku HAVING COUNT(*) > 1`,
      );
      expect(dupVars.rows).toHaveLength(0);
    });

    it('no duplicate entities after round-trip', async () => {
      // Categories: no duplicate slugs (categories has no deleted_at column)
      const dupCats = await pool.query(
        `SELECT slug, COUNT(*)::int as cnt FROM categories WHERE store_id IS NULL GROUP BY slug HAVING COUNT(*) > 1`,
      );
      expect(dupCats.rows).toHaveLength(0);

      // Brands: no duplicate slugs
      const dupBrands = await pool.query(
        `SELECT slug, COUNT(*)::int as cnt FROM brands GROUP BY slug HAVING COUNT(*) > 1`,
      );
      expect(dupBrands.rows).toHaveLength(0);

      // Products: no duplicate slugs
      const dupProds = await pool.query(
        `SELECT slug, COUNT(*)::int as cnt FROM products WHERE store_id IS NULL AND deleted_at IS NULL GROUP BY slug HAVING COUNT(*) > 1`,
      );
      expect(dupProds.rows).toHaveLength(0);

      // Variants: no duplicate SKUs
      const dupVars = await pool.query(
        `SELECT sku, COUNT(*)::int as cnt FROM product_variants GROUP BY sku HAVING COUNT(*) > 1`,
      );
      expect(dupVars.rows).toHaveLength(0);

      // Product Types: no duplicate codes
      const dupPts = await pool.query(
        `SELECT code, COUNT(*)::int as cnt FROM product_types GROUP BY code HAVING COUNT(*) > 1`,
      );
      expect(dupPts.rows).toHaveLength(0);

      // Attribute Definitions: no duplicate codes
      const dupAttrs = await pool.query(
        `SELECT code, COUNT(*)::int as cnt FROM attribute_definitions GROUP BY code HAVING COUNT(*) > 1`,
      );
      expect(dupAttrs.rows).toHaveLength(0);
    });

    it('category hierarchy is preserved after round-trip', async () => {
      // Verify parent_slug relationships survived export→re-import
      const laptops = await pool.query(
        `SELECT c.slug, c.name, p.slug as parent_slug FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.slug = 'laptops'`,
      );
      expect(laptops.rows[0].parent_slug).toBe('computers');

      const gaming = await pool.query(
        `SELECT c.slug, c.name, p.slug as parent_slug FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.slug = 'gaming-laptops'`,
      );
      expect(gaming.rows[0].parent_slug).toBe('laptops');

      const computers = await pool.query(
        `SELECT c.slug, c.name, p.slug as parent_slug FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.slug = 'computers'`,
      );
      expect(computers.rows[0].parent_slug).toBe('electronics');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §30 — RELATIONSHIP INTEGRITY TEST
  // ═══════════════════════════════════════════════════════════════════

  describe('§30 — Relationship integrity after import', () => {
    it('every Product has a valid Category', async () => {
      const orphans = await pool.query(`
        SELECT p.id, p.slug, p.category_id
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.category_id IS NOT NULL
          AND c.id IS NULL
          AND p.deleted_at IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('every Product has a valid Brand', async () => {
      const orphans = await pool.query(`
        SELECT p.id, p.slug, p.brand_id
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.brand_id IS NOT NULL
          AND b.id IS NULL
          AND p.deleted_at IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('every Product has a valid Product Type', async () => {
      const orphans = await pool.query(`
        SELECT p.id, p.slug, p.product_type_id
        FROM products p
        LEFT JOIN product_types pt ON p.product_type_id = pt.id
        WHERE p.product_type_id IS NOT NULL
          AND pt.id IS NULL
          AND p.deleted_at IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('every Product Type has valid Attributes via ProductTypeAttributes', async () => {
      const orphans = await pool.query(`
        SELECT pta.id, pta.product_type_id, pta.attribute_definition_id
        FROM product_type_attributes pta
        LEFT JOIN attribute_definitions ad ON pta.attribute_definition_id = ad.id
        WHERE ad.id IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);

      // Also verify every PTA links to a valid product type
      const orphanPts = await pool.query(`
        SELECT pta.id, pta.product_type_id
        FROM product_type_attributes pta
        LEFT JOIN product_types pt ON pta.product_type_id = pt.id
        WHERE pt.id IS NULL
      `);
      expect(orphanPts.rows).toHaveLength(0);
    });

    it('every Variant has a valid Product', async () => {
      const orphans = await pool.query(`
        SELECT v.id, v.sku, v.product_id
        FROM product_variants v
        LEFT JOIN products p ON v.product_id = p.id
        WHERE p.id IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('every Variant Attribute Value has a valid Variant and Attribute Definition', async () => {
      // Valid variant reference
      const orphanVariants = await pool.query(`
        SELECT vav.id, vav.variant_id
        FROM variant_attribute_values vav
        LEFT JOIN product_variants v ON vav.variant_id = v.id
        WHERE v.id IS NULL
      `);
      expect(orphanVariants.rows).toHaveLength(0);

      // Valid attribute definition reference
      const orphanAttrs = await pool.query(`
        SELECT vav.id, vav.attribute_definition_id
        FROM variant_attribute_values vav
        LEFT JOIN attribute_definitions ad ON vav.attribute_definition_id = ad.id
        WHERE ad.id IS NULL
      `);
      expect(orphanAttrs.rows).toHaveLength(0);
    });

    it('every Product Attribute Value has a valid Product and Attribute Definition', async () => {
      // Valid product reference
      const orphanProducts = await pool.query(`
        SELECT pav.id, pav.product_id
        FROM product_attribute_values pav
        LEFT JOIN products p ON pav.product_id = p.id
        WHERE p.id IS NULL
      `);
      expect(orphanProducts.rows).toHaveLength(0);

      // Valid attribute definition reference
      const orphanAttrs = await pool.query(`
        SELECT pav.id, pav.attribute_definition_id
        FROM product_attribute_values pav
        LEFT JOIN attribute_definitions ad ON pav.attribute_definition_id = ad.id
        WHERE ad.id IS NULL
      `);
      expect(orphanAttrs.rows).toHaveLength(0);
    });

    it('every Attribute Option has a valid Attribute Definition', async () => {
      const orphans = await pool.query(`
        SELECT ao.id, ao.attribute_id
        FROM attribute_options ao
        LEFT JOIN attribute_definitions ad ON ao.attribute_id = ad.id
        WHERE ad.id IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('every Product Type has a valid Category (if assigned)', async () => {
      const orphans = await pool.query(`
        SELECT pt.id, pt.code, pt.category_id
        FROM product_types pt
        LEFT JOIN categories c ON pt.category_id = c.id
        WHERE pt.category_id IS NOT NULL
          AND c.id IS NULL
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('category hierarchy has no cycles', async () => {
      // Recursive cycle detection: walk up parent_id chain, ensure no node
      // appears twice in any path.
      const result = await pool.query(`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, ARRAY[id] AS path, false AS has_cycle
          FROM categories
          WHERE parent_id IS NOT NULL
          UNION ALL
          SELECT c.id, c2.parent_id, chain.path || c2.id, c2.id = ANY(chain.path)
          FROM chain
          JOIN categories c ON chain.parent_id = c.id
          JOIN categories c2 ON c.parent_id = c2.id
          WHERE NOT chain.has_cycle
        )
        SELECT COUNT(*)::int AS cycles FROM chain WHERE has_cycle = true
      `);
      expect(result.rows[0].cycles).toBe(0);
    });

    it('no corrupted SKU variants exist after clean import', async () => {
      const corrupted = await pool.query(
        `SELECT COUNT(*)::int FROM product_variants WHERE sku LIKE 'SKU-[%'`,
      );
      expect(corrupted.rows[0].count).toBe(0);
    });

    it('variant attribute values use correct scope attributes', async () => {
      // VARIANT-scope attribute values should only be on variants
      // PRODUCT-scope attribute values should only be on products
      const wrongScope = await pool.query(`
        SELECT vav.id, ad.code, ad.scope
        FROM variant_attribute_values vav
        JOIN attribute_definitions ad ON vav.attribute_definition_id = ad.id
        WHERE ad.scope != 'VARIANT'
      `);
      expect(wrongScope.rows).toHaveLength(0);
    });

    it('product attribute values use correct scope attributes', async () => {
      const wrongScope = await pool.query(`
        SELECT pav.id, ad.code, ad.scope
        FROM product_attribute_values pav
        JOIN attribute_definitions ad ON pav.attribute_definition_id = ad.id
        WHERE ad.scope NOT IN ('PRODUCT', 'PRODUCT_TYPE')
      `);
      expect(wrongScope.rows).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §32 — PRODUCT TYPE PUBLISH TEST
  // ═══════════════════════════════════════════════════════════════════

  describe('§32 — Product Type publish after import', () => {
    it('valid imported product types can be published', async () => {
      // Find the business-laptop product type
      const ptRow = await pool.query(
        `SELECT id, code, status FROM product_types WHERE code = 'business-laptop'`,
      );
      expect(ptRow.rows).toHaveLength(1);
      const ptId = ptRow.rows[0].id;

      // Validate for publish
      const readiness = await taxonomy.validateProductTypeForPublish(ptId);
      // Should be publishable (has category, attributes, valid variant dims)
      expect(readiness.canPublish).toBe(true);

      // Publish it
      const published = await taxonomy.publishProductType(ptId);
      expect(published.status).toBe('PUBLISHED');
    });

    it('publish readiness returns structured errors for incomplete types', async () => {
      // Create a product type with no attributes and no category
      const barePtId = randomUUID();
      await pool.query(
        `INSERT INTO product_types (id, code, name, status) VALUES ($1, 'bare-type', 'Bare Type', 'DRAFT')`,
        [barePtId],
      );

      const readiness = await taxonomy.validateProductTypeForPublish(barePtId);
      expect(readiness.canPublish).toBe(false);
      expect(readiness.errors.length).toBeGreaterThan(0);

      // Should have CATEGORY_MISSING and NO_ATTRIBUTES errors
      const errorCodes = readiness.errors.map(e => e.code);
      expect(errorCodes).toContain('CATEGORY_MISSING');
      expect(errorCodes).toContain('NO_ATTRIBUTES');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §31 — CATEGORY CONTENT TEST
  // ═══════════════════════════════════════════════════════════════════

  describe('§31 — Category content verification', () => {
    it('parent category shows correct direct + descendant product counts', async () => {
      // "electronics" is the root; products are under laptops/gaming-laptops
      const elecRow = await pool.query(
        `SELECT id FROM categories WHERE slug = 'electronics'`,
      );
      const elecId = elecRow.rows[0].id;

      // Direct products of electronics (should be 0 — products are in leaf categories)
      const directCount = await pool.query(
        `SELECT COUNT(*)::int FROM products WHERE category_id = $1 AND deleted_at IS NULL`,
        [elecId],
      );

      // Descendant products (via child categories)
      const descendantCount = await pool.query(`
        SELECT COUNT(*)::int FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE c.path LIKE '%electronics%'
          AND c.id != $1
          AND p.deleted_at IS NULL
      `, [elecId]);

      // Total should be 3 (latitude, thinkpad, rog)
      expect(directCount.rows[0].count + descendantCount.rows[0].count).toBe(3);
    });

    it('category shows its product types', async () => {
      const laptopsRow = await pool.query(
        `SELECT id FROM categories WHERE slug = 'laptops'`,
      );
      const laptopsId = laptopsRow.rows[0].id;

      const pts = await pool.query(
        `SELECT id, code, name FROM product_types WHERE category_id = $1`,
        [laptopsId],
      );
      expect(pts.rows.length).toBeGreaterThanOrEqual(1);
      expect(pts.rows.some((r: any) => r.code === 'business-laptop')).toBe(true);
    });

    it('category shows child categories', async () => {
      const computersRow = await pool.query(
        `SELECT id FROM categories WHERE slug = 'computers'`,
      );
      const computersId = computersRow.rows[0].id;

      const children = await pool.query(
        `SELECT id, slug FROM categories WHERE parent_id = $1`,
        [computersId],
      );
      expect(children.rows.length).toBeGreaterThanOrEqual(1);
      expect(children.rows.some((r: any) => r.slug === 'laptops')).toBe(true);
    });
  });

  // ── Helper methods (mirror CatalogImportService private methods) ──────

  async function loadExistingDataSnapshot() {
    const [brandRows, catRows, attrRows, optRows, ptRows, prodRows, varRows] = await Promise.all([
      db.select({ slug: brands.slug }).from(brands),
      db.select({ slug: categories.slug, storeId: categories.storeId }).from(categories),
      db.select({ code: attributeDefinitions.code, type: attributeDefinitions.type, scope: attributeDefinitions.scope }).from(attributeDefinitions),
      db.select({ id: attributeOptions.id, attributeId: attributeOptions.attributeId, value: attributeOptions.value }).from(attributeOptions),
      db.select({ code: productTypes.code }).from(productTypes),
      db.select({ slug: products.slug, storeId: products.storeId }).from(products),
      db.select({ sku: productVariants.sku }).from(productVariants),
    ]);

    const attributeMap = new Map<string, { type: string; options: Set<string>; scope: string }>();
    for (const r of attrRows) {
      attributeMap.set(r.code, { type: r.type, options: new Set(), scope: r.scope ?? 'PRODUCT' });
    }
    // Populate option values per attribute from the options table
    // (attributeMap already has empty Sets; options are loaded via optRows
    // but we need the attribute code, not the attributeId. For the round-trip
    // test the validator only needs type info, so empty Sets suffice.)

    const snapshot: import('../../modules/catalog-import/excel-validator.service').ExistingDataSnapshot = {
      categorySlugs: catRows.filter(r => !r.storeId).map(r => r.slug),
      brandSlugs: brandRows.map(r => r.slug),
      attributeMap: [...attributeMap.entries()],
      productTypeCodes: ptRows.map(r => r.code),
      productSlugs: prodRows.filter(r => !r.storeId).map(r => r.slug),
      variantSkus: varRows.map(r => r.sku),
    };
    return snapshot;
  }

  async function loadExistingEntityMap() {
    const [catRows, brandRows, prodRows, srcRows, ptaRows, paRows, vaRows] = await Promise.all([
      db.select({ slug: categories.slug, name: categories.name, nameAr: categories.nameAr, description: categories.description }).from(categories).where(isNull(categories.storeId)),
      db.select({ slug: brands.slug, name: brands.name, nameAr: brands.nameAr, description: brands.description }).from(brands),
      db.select({ slug: products.slug, title: products.title, description: products.description, mpn: products.mpn }).from(products).where(isNull(products.storeId)),
      db.select({ slug: products.slug, sourceType: productSources.sourceType, sourceUrl: productSources.sourceUrl })
        .from(productSources)
        .innerJoin(products, eq(productSources.productId, products.id)),
      // PTA composite keys: ptCode:attrCode
      db.select({ ptCode: productTypes.code, attrCode: attributeDefinitions.code })
        .from(productTypeAttributes)
        .innerJoin(productTypes, eq(productTypeAttributes.productTypeId, productTypes.id))
        .innerJoin(attributeDefinitions, eq(productTypeAttributes.attributeDefinitionId, attributeDefinitions.id)),
      // PA composite keys: productSlug:attrCode
      db.select({ slug: products.slug, attrCode: attributeDefinitions.code })
        .from(productAttributeValues)
        .innerJoin(products, eq(productAttributeValues.productId, products.id))
        .innerJoin(attributeDefinitions, eq(productAttributeValues.attributeDefinitionId, attributeDefinitions.id)),
      // VA composite keys: variantSku:attrCode
      db.select({ sku: productVariants.sku, attrCode: attributeDefinitions.code })
        .from(variantAttributeValues)
        .innerJoin(productVariants, eq(variantAttributeValues.variantId, productVariants.id))
        .innerJoin(attributeDefinitions, eq(variantAttributeValues.attributeDefinitionId, attributeDefinitions.id)),
    ]);

    // Build composite key Sets for round-trip idempotency checks
    const sources = new Set<string>();
    for (const r of srcRows) {
      sources.add(`${r.slug}:${r.sourceType}:${r.sourceUrl}`);
    }
    const ptaKeys = new Set<string>();
    for (const r of ptaRows) {
      ptaKeys.add(`${r.ptCode}:${r.attrCode}`);
    }
    const paKeys = new Set<string>();
    for (const r of paRows) {
      paKeys.add(`${r.slug}:${r.attrCode}`);
    }
    const vaKeys = new Set<string>();
    for (const r of vaRows) {
      vaKeys.add(`${r.sku}:${r.attrCode}`);
    }

    return {
      categories: new Map(catRows.map(r => [r.slug, { name: r.name, nameAr: r.nameAr, description: r.description }])),
      brands: new Map(brandRows.map(r => [r.slug, { name: r.name, nameAr: r.nameAr, description: r.description }])),
      products: new Map(prodRows.map(r => [r.slug, { title: r.title, description: r.description, mpn: r.mpn }])),
      sources,
      productTypeAttributes: ptaKeys,
      productAttributes: paKeys,
      variantAttributes: vaKeys,
    };
  }
});
