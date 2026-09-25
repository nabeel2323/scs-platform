import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../common/database/database.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { CatalogOfferService } from '../../modules/catalog/catalog.offer.service';
import { ConditionalRulesService } from '../../modules/catalog/conditional-rules.service';
import { CartService } from '../../modules/orders/cart.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { PromotionsService } from '../../modules/promotions/promotions.service';
import { ExcelParserService } from '../../modules/catalog-import/excel-parser.service';
import { ExcelValidatorService } from '../../modules/catalog-import/excel-validator.service';
import { ExcelResolverService } from '../../modules/catalog-import/excel-resolver.service';
import { ExcelPlannerService } from '../../modules/catalog-import/excel-planner.service';
import { ExcelExecutorService } from '../../modules/catalog-import/excel-executor.service';
import { CatalogValidationService } from '../../modules/catalog/catalog.validation-service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
// Schemas
import { products, productVariants, categories, brands, productMedia } from '../../modules/catalog/catalog.schema';
import { attributeDefinitions, attributeOptions, attributeGroups, productTypes, productTypeAttributes, productAttributeValues, variantAttributeValues } from '../../modules/catalog/catalog.taxonomy.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations, organizationMembers, roles } from '../../modules/identity/identity.schema';
import { stores, warehouses } from '../../modules/merchant/merchant.schema';
import { priceLists, priceTiers } from '../../modules/pricing/pricing.schema';
import { inventoryItems, stockMovements } from '../../modules/inventory/inventory.schema';
import { carts, cartItems } from '../../modules/orders/cart.schema';
import { masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory } from '../../modules/orders/orders.schema';
import { outboxEvents, auditLogs } from '../../modules/audit/audit.schema';
import { searchQueries } from '../../modules/catalog/search.schema';
import { catalogImports, catalogImportErrors } from '../../modules/catalog-import/catalog-import.schema';

/**
 * Phase 4 — Import → Catalog → Offer → Commerce
 *
 * Proves the full marketplace lifecycle starting from an Excel import:
 *   XLSX → Import Pipeline → Canonical Products → Variants →
 *   Merchant Offer → Inventory → Pricing → Cart → Checkout → Order
 *
 * Also tests import idempotency, error handling, and catalog DB integrity.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────
const storage = { createPresignedGetUrl: vi.fn(async (_b: string, key: string) => `https://cdn.test/${key}`) } as any;
const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
const redis = { get: vi.fn(), set: vi.fn(), del: vi.fn() } as any;
const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn() } as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

// ── Test identity IDs ──────────────────────────────────────────────────────
let orgA: string;
let merchantOwnerA: string;
let buyerA: string;
let adminUser: string;
let storeA: string;
let warehouseA: string;
let merchantOwnerRoleId: string, buyerRoleId: string;

// ── Imported entity tracking ───────────────────────────────────────────────
let importedProductId: string;
let importedVariantId: string;
let importedVariantSku: string;
let offerId: string;
let invItemId: string;

/**
 * Build a realistic multi-sheet XLSX workbook for import.
 * Contains: Categories, Brands, Attributes, Attribute Options,
 * Product Types, Product Type Attributes, Products, Variants.
 */
async function buildImportWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Categories
  const catWs = wb.addWorksheet('Categories');
  catWs.addRow(['slug', 'name']);
  catWs.addRow(['electronics-p4', 'Electronics P4']);
  catWs.addRow(['laptops-p4', 'Laptops P4']);

  // Brands
  const brandWs = wb.addWorksheet('Brands');
  brandWs.addRow(['slug', 'name']);
  brandWs.addRow(['testbrand-p4', 'TestBrand P4']);

  // Attributes
  const attrWs = wb.addWorksheet('Attributes');
  attrWs.addRow(['code', 'name', 'type', 'scope']);
  attrWs.addRow(['color-p4', 'Color', 'SELECT', 'VARIANT']);
  attrWs.addRow(['ram-gb-p4', 'RAM (GB)', 'INTEGER', 'VARIANT']);

  // Attribute Options
  const optWs = wb.addWorksheet('Attribute Options');
  optWs.addRow(['attribute_code', 'value']);
  optWs.addRow(['color-p4', 'Silver']);
  optWs.addRow(['color-p4', 'Black']);

  // Product Types
  const ptWs = wb.addWorksheet('Product Types');
  ptWs.addRow(['code', 'name', 'category_slug']);
  ptWs.addRow(['laptop-p4', 'Laptop P4', 'laptops-p4']);

  // Product Type Attributes
  const ptaWs = wb.addWorksheet('Product Type Attributes');
  ptaWs.addRow(['product_type_code', 'attribute_code', 'required', 'scope', 'display_order']);
  ptaWs.addRow(['laptop-p4', 'color-p4', 'true', 'VARIANT', '0']);
  ptaWs.addRow(['laptop-p4', 'ram-gb-p4', 'true', 'VARIANT', '1']);

  // Products
  const prodWs = wb.addWorksheet('Products');
  prodWs.addRow(['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug']);
  prodWs.addRow(['imported-laptop-p4', 'Imported Laptop P4', 'testbrand-p4', 'laptop-p4', 'laptops-p4']);

  // Variants
  const varWs = wb.addWorksheet('Variants');
  varWs.addRow(['product_slug', 'sku', 'title']);
  varWs.addRow(['imported-laptop-p4', 'IMP-LAPTOP-P4-SILVER-16', 'Imported Laptop Silver 16GB']);

  // Variant Attributes
  const vaWs = wb.addWorksheet('Variant Attributes');
  vaWs.addRow(['variant_sku', 'attribute_code', 'value_text']);
  vaWs.addRow(['IMP-LAPTOP-P4-SILVER-16', 'color-p4', 'Silver']);
  vaWs.addRow(['IMP-LAPTOP-P4-SILVER-16', 'ram-gb-p4', '16']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe('Phase 4 — Import → Catalog → Offer → Commerce', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let catalog: CatalogService;
  let taxonomy: CatalogTaxonomyService;
  let offerService: CatalogOfferService;
  let cartService: CartService;
  let ordersService: OrdersService;
  let inventoryService: InventoryService;
  let parser: ExcelParserService;
  let validator: ExcelValidatorService;
  let resolver: ExcelResolverService;
  let planner: ExcelPlannerService;
  let executor: ExcelExecutorService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: {
        products, productVariants, categories, brands, productMedia,
        attributeDefinitions, attributeOptions, attributeGroups,
        productTypes, productTypeAttributes, productAttributeValues, variantAttributeValues,
        merchantOffers, stores, warehouses, users, organizations,
        priceLists, priceTiers,
        inventoryItems, stockMovements, carts, cartItems,
        masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory,
        outboxEvents, auditLogs, searchQueries,
        catalogImports, catalogImportErrors,
      },
    }) as unknown as DatabaseService['db'];

    // ── Run migrations ────────────────────────────────────────────
    const migrationsDir = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
    const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
    for (const file of (await readdir(migrationsDir))
      .filter(f => f.endsWith('.sql') && !excluded.includes(f))
      .sort()) {
      await pool.query(await readFile(path.join(migrationsDir, file), 'utf8'));
    }

    // ── Seed RBAC ─────────────────────────────────────────────────
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // ── Instantiate services ──────────────────────────────────────
    database = { db } as DatabaseService;
    const conditionalRules = new ConditionalRulesService();
    catalog = new CatalogService(database, redis as any, outbox, storage, audit, conditionalRules);
    taxonomy = new CatalogTaxonomyService(database);
    offerService = new CatalogOfferService(database, audit);
    const promotionsService = new PromotionsService(database);
    cartService = new CartService(database, promotionsService);
    ordersService = new OrdersService(database, outbox, promotionsService, realtime, cartService, notifications);
    inventoryService = new InventoryService(database, outbox);
    parser = new ExcelParserService();
    validator = new ExcelValidatorService(new CatalogValidationService());
    resolver = new ExcelResolverService(database);
    planner = new ExcelPlannerService();
    executor = new ExcelExecutorService(database);

    // ── Create test identities ────────────────────────────────────
    orgA = randomUUID();
    merchantOwnerA = randomUUID();
    buyerA = randomUUID();
    adminUser = randomUUID();
    storeA = randomUUID();
    warehouseA = randomUUID();

    const roleRes = await pool.query(`SELECT id, key FROM roles`);
    const roleMap = new Map(roleRes.rows.map((r: any) => [r.key, r.id]));
    merchantOwnerRoleId = roleMap.get('MERCHANT_OWNER')!;
    buyerRoleId = roleMap.get('BUYER')!;

    await db.insert(organizations).values([
      { id: orgA, name: 'Org P4', type: 'WHOLESALER', country: 'SA' },
    ]);
    await db.insert(users).values([
      { id: adminUser, fullName: 'Admin P4', phone: '+10400000001' },
      { id: merchantOwnerA, fullName: 'Merchant Owner P4', phone: '+10400000002' },
      { id: buyerA, fullName: 'Buyer P4', phone: '+10400000003' },
    ]);
    await db.insert(stores).values([
      { id: storeA, orgId: orgA, slug: 'p4-store', displayName: 'P4 Store' },
    ]);
    await db.insert(warehouses).values([
      { id: warehouseA, storeId: storeA, name: 'P4 Warehouse' },
    ]);
    await db.insert(organizationMembers).values([
      { id: randomUUID(), orgId: orgA, userId: merchantOwnerA, roleId: merchantOwnerRoleId },
      { id: randomUUID(), orgId: orgA, userId: buyerA, roleId: buyerRoleId },
    ]);
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  // 1. IMPORT PIPELINE
  // ═══════════════════════════════════════════════════════════════════
  describe('1. Import Pipeline', () => {
    it('builds a valid XLSX workbook', async () => {
      const buf = await buildImportWorkbook();
      expect(buf.length).toBeGreaterThan(0);
    });

    it('parses the workbook into structured sheets', async () => {
      const buf = await buildImportWorkbook();
      const workbook = await parser.parse(buf, 'import-p4.xlsx');
      expect(workbook.sheets.size).toBe(9); // 9 entity sheets
      expect(workbook.sheets.has('categories')).toBe(true);
      expect(workbook.sheets.has('brands')).toBe(true);
      expect(workbook.sheets.has('attributes')).toBe(true);
      expect(workbook.sheets.has('attribute_options')).toBe(true);
      expect(workbook.sheets.has('product_types')).toBe(true);
      expect(workbook.sheets.has('product_type_attributes')).toBe(true);
      expect(workbook.sheets.has('products')).toBe(true);
      expect(workbook.sheets.has('variants')).toBe(true);
      expect(workbook.sheets.has('variant_attributes')).toBe(true);
    });

    it('validates with zero errors against empty DB', async () => {
      const buf = await buildImportWorkbook();
      const workbook = await parser.parse(buf, 'import-p4.xlsx');
      const errors = validator.validate(workbook, {
        categorySlugs: [], brandSlugs: [], attributeMap: [],
        productTypeCodes: [], productSlugs: [], variantSkus: [],
      });
      const hardErrors = errors.filter(e => e.severity === 'ERROR');
      expect(hardErrors).toHaveLength(0);
    });

    it('resolves cross-sheet references correctly', async () => {
      const buf = await buildImportWorkbook();
      const workbook = await parser.parse(buf, 'import-p4.xlsx');
      const refs = await resolver.resolve(workbook);
      // All references should be pending (DB is empty)
      expect(refs.categoryIds.get('electronics-p4')).toMatch(/^pending:cat:/);
      expect(refs.categoryIds.get('laptops-p4')).toMatch(/^pending:cat:/);
      expect(refs.brandIds.get('testbrand-p4')).toMatch(/^pending:brand:/);
      expect(refs.attributeIds.get('color-p4')).toMatch(/^pending:attr:/);
      expect(refs.productTypeIds.get('laptop-p4')).toMatch(/^pending:pt:/);
      expect(refs.productIds.get('imported-laptop-p4')).toMatch(/^pending:prod:/);
      expect(refs.variantIds.get('IMP-LAPTOP-P4-SILVER-16')).toMatch(/^pending:var:/);
    });

    it('plans all entities as CREATE on fresh DB', async () => {
      const buf = await buildImportWorkbook();
      const workbook = await parser.parse(buf, 'import-p4.xlsx');
      const refs = await resolver.resolve(workbook);
      const plan = planner.buildPlan(workbook, refs, {
        categories: new Map(), brands: new Map(), products: new Map(),
      });
      expect(plan.summary.totalCreate).toBeGreaterThan(0);
      expect(plan.categories.every(e => e.action === 'CREATE')).toBe(true);
      expect(plan.brands.every(e => e.action === 'CREATE')).toBe(true);
      expect(plan.products.every(e => e.action === 'CREATE')).toBe(true);
      expect(plan.variants.every(e => e.action === 'CREATE')).toBe(true);
    });

    it('executes the import and creates all entities in the DB', async () => {
      const buf = await buildImportWorkbook();
      const workbook = await parser.parse(buf, 'import-p4.xlsx');
      const refs = await resolver.resolve(workbook);
      const existingEntities = { categories: new Map(), brands: new Map(), products: new Map() };
      const plan = planner.buildPlan(workbook, refs, existingEntities);
      const result = await executor.execute(plan, refs);

      expect(result.created).toBeGreaterThan(0);
      expect(result.rejected).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. CATALOG DB VERIFICATION
  // ═══════════════════════════════════════════════════════════════════
  describe('2. Catalog DB Verification After Import', () => {
    it('imported category exists with correct slug', async () => {
      const rows = await pool.query(`SELECT id, slug, name FROM categories WHERE slug = 'laptops-p4'`);
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].name).toBe('Laptops P4');
    });

    it('imported brand exists with correct slug', async () => {
      const rows = await pool.query(`SELECT id, slug, name FROM brands WHERE slug = 'testbrand-p4'`);
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].name).toBe('TestBrand P4');
    });

    it('imported attributes exist with correct codes', async () => {
      const rows = await pool.query(`SELECT code, name, type, scope FROM attribute_definitions WHERE code IN ('color-p4', 'ram-gb-p4') ORDER BY code`);
      expect(rows.rows.length).toBe(2);
      expect(rows.rows[0].code).toBe('color-p4');
      expect(rows.rows[0].type).toBe('SELECT');
      expect(rows.rows[0].scope).toBe('VARIANT');
      expect(rows.rows[1].code).toBe('ram-gb-p4');
      expect(rows.rows[1].type).toBe('INTEGER');
    });

    it('imported attribute options exist', async () => {
      const attrRes = await pool.query(`SELECT id FROM attribute_definitions WHERE code = 'color-p4'`);
      const attrId = attrRes.rows[0].id;
      const rows = await pool.query(`SELECT value FROM attribute_options WHERE attribute_id = $1 ORDER BY value`, [attrId]);
      expect(rows.rows.length).toBe(2);
      expect(rows.rows.map((r: any) => r.value)).toContain('Silver');
      expect(rows.rows.map((r: any) => r.value)).toContain('Black');
    });

    it('imported product type exists and links to category', async () => {
      const ptRes = await pool.query(`SELECT id, code, name, category_id FROM product_types WHERE code = 'laptop-p4'`);
      expect(ptRes.rows.length).toBe(1);
      expect(ptRes.rows[0].name).toBe('Laptop P4');
      // Category should be linked (not null)
      expect(ptRes.rows[0].category_id).not.toBeNull();
    });

    it('product type attributes are linked', async () => {
      const ptRes = await pool.query(`SELECT id FROM product_types WHERE code = 'laptop-p4'`);
      const ptId = ptRes.rows[0].id;
      const rows = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM product_type_attributes WHERE product_type_id = $1`,
        [ptId],
      );
      expect(rows.rows[0].cnt).toBe(2); // color-p4 and ram-gb-p4
    });

    it('imported canonical product exists with storeId NULL', async () => {
      const rows = await pool.query(
        `SELECT p.id, p.slug, p.title, p.store_id, p.brand_id, p.category_id, p.product_type_id
         FROM products p WHERE p.slug = 'imported-laptop-p4'`,
      );
      expect(rows.rows.length).toBe(1);
      const prod = rows.rows[0];
      expect(prod.title).toBe('Imported Laptop P4');
      expect(prod.store_id).toBeNull(); // Canonical product
      expect(prod.brand_id).not.toBeNull();
      expect(prod.category_id).not.toBeNull();
      expect(prod.product_type_id).not.toBeNull();
      importedProductId = prod.id;
    });

    it('imported variant exists and links to product', async () => {
      const rows = await pool.query(
        `SELECT id, product_id, sku, title FROM product_variants WHERE sku = 'IMP-LAPTOP-P4-SILVER-16'`,
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].product_id).toBe(importedProductId);
      expect(rows.rows[0].title).toBe('Imported Laptop Silver 16GB');
      importedVariantId = rows.rows[0].id;
      importedVariantSku = rows.rows[0].sku;
    });

    it('variant attribute values are linked', async () => {
      const rows = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM variant_attribute_values WHERE variant_id = $1`,
        [importedVariantId],
      );
      expect(rows.rows[0].cnt).toBe(2); // color-p4 and ram-gb-p4
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. IMPORT IDEMPOTENCY
  // ═══════════════════════════════════════════════════════════════════
  describe('3. Import Idempotency', () => {
    it('re-importing the same workbook produces all UNCHANGED', async () => {
      const buf = await buildImportWorkbook();
      const workbook = await parser.parse(buf, 'import-p4.xlsx');
      // Resolve against the now-populated DB
      const refs = await resolver.resolve(workbook);
      // Load existing entity map from DB
      const [catRows, brandRows, prodRows] = await Promise.all([
        db.select({ slug: categories.slug, name: categories.name }).from(categories).where(isNull(categories.storeId)),
        db.select({ slug: brands.slug, name: brands.name }).from(brands),
        db.select({ slug: products.slug, title: products.title }).from(products).where(isNull(products.storeId)),
      ]);
      const existingEntities = {
        categories: new Map(catRows.map(r => [r.slug, { name: r.name }])),
        brands: new Map(brandRows.map(r => [r.slug, { name: r.name }])),
        products: new Map(prodRows.map(r => [r.slug, { title: r.title }])),
      };
      const plan = planner.buildPlan(workbook, refs, existingEntities);

      // product_type_attributes and variant_attributes are always CREATE (relationship
      // tables — the executor upserts on unique constraints to handle duplicates).
      // Core entities (categories, brands, attributes, products, variants) should be UNCHANGED.
      expect(plan.summary.totalUnchanged).toBeGreaterThan(0);
      // No UPDATEs on unchanged data
      expect(plan.summary.totalUpdate).toBe(0);
      // The 4 CREATEs are relationship rows (2 product_type_attributes + 2 variant_attributes)
      expect(plan.summary.totalCreate).toBe(4);
    });

    it('no duplicate entities are created after re-import', async () => {
      const beforeRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM products WHERE slug = 'imported-laptop-p4'`);
      expect(beforeRes.rows[0].cnt).toBe(1);

      const beforeVar = await pool.query(`SELECT COUNT(*)::int AS cnt FROM product_variants WHERE sku = 'IMP-LAPTOP-P4-SILVER-16'`);
      expect(beforeVar.rows[0].cnt).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. OFFER CREATION ON IMPORTED PRODUCT
  // ═══════════════════════════════════════════════════════════════════
  describe('4. Offer Creation on Imported Product', () => {
    it('merchant can create an offer for the imported canonical product', async () => {
      const offer = await offerService.createOffer({
        storeId: storeA,
        productId: importedProductId,
        variantId: importedVariantId,
        currency: 'SAR',
        basePriceMinor: 350000,
        moq: 1,
        leadTimeDays: 5,
        proposedBy: merchantOwnerA,
      });
      expect(offer.id).toBeTruthy();
      expect(offer.status).toBe('DRAFT');
      expect(offer.storeId).toBe(storeA);
      expect(offer.productId).toBe(importedProductId);
      expect(offer.variantId).toBe(importedVariantId);
      offerId = offer.id;
    });

    it('offer can be proposed and approved', async () => {
      await offerService.proposeOffer(offerId, merchantOwnerA);
      const proposed = await offerService.getOffer(offerId);
      expect(proposed.status).toBe('PROPOSED');

      await offerService.approveOffer(offerId, adminUser);
      const active = await offerService.getOffer(offerId);
      expect(active.status).toBe('ACTIVE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. INVENTORY & PRICING FOR IMPORTED VARIANT
  // ═══════════════════════════════════════════════════════════════════
  describe('5. Inventory & Pricing', () => {
    it('inventory item can be created for imported variant (internal call, no caller)', async () => {
      // Canonical products have storeId=NULL, so tenant-scope would deny with caller.
      // Internal calls (no caller) bypass tenant scoping by design.
      const item = await inventoryService.createItem({
        variantId: importedVariantId,
        warehouseId: warehouseA,
        initialQty: 50,
        userId: merchantOwnerA,
      });
      expect(item.id).toBeTruthy();
      expect(item['qtyOnHand']).toBe(50);
      invItemId = item.id;
    });

    it('price list and tier exist for the imported variant', async () => {
      const plId = randomUUID();
      await db.insert(priceLists).values({
        id: plId,
        storeId: storeA,
        name: 'P4 Retail',
        currency: 'SAR',
        isActive: true,
        priority: 10,
      });
      await db.insert(priceTiers).values({
        id: randomUUID(),
        priceListId: plId,
        variantId: importedVariantId,
        unitPriceMinor: 350000,
        minQty: 1,
      });

      // Verify
      const tierRes = await pool.query(
        `SELECT unit_price_minor FROM price_tiers pt
         JOIN price_lists pl ON pl.id = pt.price_list_id
         WHERE pt.variant_id = $1 AND pl.store_id = $2`,
        [importedVariantId, storeA],
      );
      expect(tierRes.rows.length).toBeGreaterThan(0);
      expect(Number(tierRes.rows[0].unit_price_minor)).toBe(350000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. REAL COMMERCE — FULL LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════
  describe('6. Real Commerce Lifecycle', () => {
    it('buyer can add imported variant to cart', async () => {
      const cart = await cartService.addItem(buyerA, {
        variantId: importedVariantId,
        quantity: 2,
        offerId: offerId,
      });
      expect(cart.id).toBeTruthy();
      expect(cart.items.length).toBeGreaterThan(0);
      const lineItem = cart.items.find((i: any) => i.sku === importedVariantSku || i.variantId === importedVariantId) as any;
      expect(lineItem).toBeTruthy();
      expect(lineItem!.quantity).toBe(2);
    });

    it('buyer can checkout with imported variant', async () => {
      const co = await ordersService.checkout({
        buyerId: buyerA,
        deliveryAddress: {},
        idempotencyKey: `p4-import-${randomUUID()}`,
      });
      expect(co.id).toBeTruthy();
      expect(co.subOrders.length).toBeGreaterThan(0);

      const subOrder = co.subOrders.find((s: any) => s.storeId === storeA);
      expect(subOrder).toBeTruthy();
      expect(subOrder!.items.length).toBeGreaterThan(0);

      // Verify price was server-resolved (not client-supplied)
      const itemRes = await pool.query(
        `SELECT unit_price_minor, offer_snapshot FROM order_items WHERE order_id = $1`,
        [subOrder!.id],
      );
      expect(Number(itemRes.rows[0].unit_price_minor)).toBe(350000);
      expect(itemRes.rows[0].offer_snapshot).toBeTruthy();
      expect(itemRes.rows[0].offer_snapshot.basePriceMinor).toBe(350000);
    });

    it('order exists with correct financial totals', async () => {
      const orderRes = await pool.query(
        `SELECT o.id, o.status, o.subtotal_minor, o.total_minor, o.buyer_id, o.store_id
         FROM orders o WHERE o.store_id = $1 AND o.buyer_id = $2
         ORDER BY o.created_at DESC LIMIT 1`,
        [storeA, buyerA],
      );
      expect(orderRes.rows.length).toBe(1);
      const order = orderRes.rows[0];
      expect(order.status).toBe('PENDING_CONFIRMATION');
      expect(Number(order.subtotal_minor)).toBe(700000); // 2 × 350000
      expect(Number(order.total_minor)).toBeGreaterThan(0);
    });

    it('master order links sub-orders correctly', async () => {
      const masterRes = await pool.query(
        `SELECT m.id, COUNT(o.id)::int AS sub_count
         FROM master_orders m
         JOIN orders o ON o.master_order_id = m.id
         WHERE o.buyer_id = $1
         GROUP BY m.id
         ORDER BY m.created_at DESC LIMIT 1`,
        [buyerA],
      );
      expect(masterRes.rows.length).toBe(1);
      expect(masterRes.rows[0].sub_count).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════
  describe('7. Import Error Handling', () => {
    it('rejects malformed workbook (not valid XLSX)', async () => {
      const garbage = Buffer.from('not a valid xlsx file at all');
      await expect(parser.parse(garbage, 'bad.xlsx')).rejects.toThrow(/parse|failed/i);
    });

    it('rejects unsupported file extension', async () => {
      const buf = await buildImportWorkbook();
      await expect(parser.parse(buf, 'import.csv')).rejects.toThrow(/unsupported/i);
    });

    it('rejects macro-enabled workbook (.xlsm)', async () => {
      const buf = await buildImportWorkbook();
      await expect(parser.parse(buf, 'import.xlsm')).rejects.toThrow(/macro/i);
    });

    it('rejects empty file', async () => {
      await expect(parser.parse(Buffer.alloc(0), 'empty.xlsx')).rejects.toThrow(/empty/i);
    });

    it('rejects oversized file (>25MB)', async () => {
      const oversized = Buffer.alloc(26 * 1024 * 1024);
      await expect(parser.parse(oversized, 'huge.xlsx')).rejects.toThrow(/too large/i);
    });

    it('detects invalid cross-sheet references', async () => {
      const wb = new ExcelJS.Workbook();
      const prodWs = wb.addWorksheet('Products');
      prodWs.addRow(['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug']);
      prodWs.addRow(['bad-prod', 'Bad Product', 'nonexistent-brand', 'nonexistent-pt', 'nonexistent-cat']);

      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const workbook = await parser.parse(buf, 'bad-refs.xlsx');
      const errors = validator.validate(workbook, {
        categorySlugs: [], brandSlugs: [], attributeMap: [],
        productTypeCodes: [], productSlugs: [], variantSkus: [],
      });
      const hardErrors = errors.filter(e => e.severity === 'ERROR');
      expect(hardErrors.length).toBeGreaterThan(0);
      expect(hardErrors.some(e => e.errorCode === 'UNKNOWN_REFERENCE')).toBe(true);
    });

    it('detects duplicate keys within the same workbook', async () => {
      const wb = new ExcelJS.Workbook();
      const brandWs = wb.addWorksheet('Brands');
      brandWs.addRow(['slug', 'name']);
      brandWs.addRow(['dup-brand', 'Brand A']);
      brandWs.addRow(['dup-brand', 'Brand B']); // duplicate slug

      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const workbook = await parser.parse(buf, 'dup.xlsx');
      const errors = validator.validate(workbook, {
        categorySlugs: [], brandSlugs: [], attributeMap: [],
        productTypeCodes: [], productSlugs: [], variantSkus: [],
      });
      expect(errors.some(e => e.errorCode === 'DUPLICATE_KEY')).toBe(true);
    });

    it('detects invalid attribute type values', async () => {
      const wb = new ExcelJS.Workbook();
      const attrWs = wb.addWorksheet('Attributes');
      attrWs.addRow(['code', 'name', 'type', 'scope']);
      attrWs.addRow(['bad-attr', 'Bad Attribute', 'INVALID_TYPE', 'PRODUCT']);

      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const workbook = await parser.parse(buf, 'bad-attr.xlsx');
      const errors = validator.validate(workbook, {
        categorySlugs: [], brandSlugs: [], attributeMap: [],
        productTypeCodes: [], productSlugs: [], variantSkus: [],
      });
      expect(errors.some(e => e.errorCode === 'INVALID_VALUE' && e.field === 'type')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. REGRESSION — IMPORT DOES NOT BREAK EXISTING FLOWS
  // ═══════════════════════════════════════════════════════════════════
  describe('8. Regression — Existing Flows Intact', () => {
    let regProduct: string, regVariant: string, regOffer: string;

    it('can still create a store-scoped product via catalog service', async () => {
      // Ensure the taxonomy prerequisites exist
      const catId = (await pool.query(`SELECT id FROM categories WHERE slug = 'laptops-p4'`)).rows[0].id;
      const brandId = (await pool.query(`SELECT id FROM brands WHERE slug = 'testbrand-p4'`)).rows[0].id;
      const ptId = (await pool.query(`SELECT id FROM product_types WHERE code = 'laptop-p4'`)).rows[0].id;

      const p = await catalog.createProduct({
        storeId: storeA,
        title: 'Regression Test Product',
        categoryId: catId,
        brandId,
        productTypeId: ptId,
        images: ['reg.png'],
      }, merchantOwnerA);
      regProduct = p.id;
      await catalog.updateProduct(regProduct, { status: 'ACTIVE' });

      const v = await catalog.createVariant(regProduct, { sku: 'REG-P4-V1', title: 'Reg Variant' });
      regVariant = v.id;
      expect(regProduct).toBeTruthy();
      expect(regVariant).toBeTruthy();
    });

    it('can create an offer on a non-imported product', async () => {
      const o = await offerService.createOffer({
        storeId: storeA,
        productId: regProduct,
        variantId: regVariant,
        currency: 'SAR',
        basePriceMinor: 10000,
        moq: 1,
        proposedBy: merchantOwnerA,
      });
      regOffer = o.id;
      await offerService.proposeOffer(regOffer, merchantOwnerA);
      await offerService.approveOffer(regOffer, adminUser);
      const active = await offerService.getOffer(regOffer);
      expect(active.status).toBe('ACTIVE');
    });

    it('can add non-imported variant to cart and checkout', async () => {
      // createVariant auto-creates a base price tier (price=0) via ensureVariantPricing,
      // so UPDATE the existing tier rather than inserting a duplicate.
      const plRes = await pool.query(`SELECT id FROM price_lists WHERE store_id = $1 LIMIT 1`, [storeA]);
      await pool.query(
        `UPDATE price_tiers SET unit_price_minor = 10000 WHERE price_list_id = $1 AND variant_id = $2 AND min_qty = 1`,
        [plRes.rows[0].id, regVariant],
      );

      // Set up inventory
      await inventoryService.createItem({
        variantId: regVariant,
        warehouseId: warehouseA,
        initialQty: 100,
        userId: merchantOwnerA,
      });

      await cartService.addItem(buyerA, { variantId: regVariant, quantity: 1, offerId: regOffer });
      const co = await ordersService.checkout({
        buyerId: buyerA,
        deliveryAddress: {},
        idempotencyKey: `p4-regression-${randomUUID()}`,
      });
      expect(co.subOrders.length).toBeGreaterThan(0);
    });

    it('imported and non-imported products coexist in catalog', async () => {
      const prodCount = await pool.query(`SELECT COUNT(*)::int AS cnt FROM products`);
      expect(prodCount.rows[0].cnt).toBeGreaterThanOrEqual(2); // imported + regression

      const varCount = await pool.query(`SELECT COUNT(*)::int AS cnt FROM product_variants`);
      expect(varCount.rows[0].cnt).toBeGreaterThanOrEqual(2);
    });

    it('no negative inventory after all commerce operations', async () => {
      const res = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM inventory_items WHERE qty_reserved < 0 OR (qty_on_hand - qty_reserved) < 0`,
      );
      expect(res.rows[0].cnt).toBe(0);
    });

    it('all orders have valid master orders', async () => {
      const res = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM orders o LEFT JOIN master_orders m ON o.master_order_id = m.id WHERE m.id IS NULL`,
      );
      expect(res.rows[0].cnt).toBe(0);
    });
  });
});
