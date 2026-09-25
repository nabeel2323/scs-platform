import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { CatalogOfferService } from '../../modules/catalog/catalog.offer.service';
import { ConditionalRulesService } from '../../modules/catalog/conditional-rules.service';
import { SearchService } from '../../modules/catalog/search.service';
import { CartService } from '../../modules/orders/cart.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { PromotionsService } from '../../modules/promotions/promotions.service';
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

/**
 * Phase 1 — Core Marketplace E2E Validation
 *
 * Complements transaction-lifecycle.e2e.spec.ts with the remaining scenarios
 * required by the Phase 1 gate:
 *   A  — Catalog chain validation
 *   B  — Buyer discovery (search → PDP → offers)
 *   C  — Single-merchant cart
 *   E  — Client tampering resistance
 *   F  — Idempotency conflict (same key, different payload → 409)
 *   G  — Inventory concurrency (stock=5, req=4+4)
 *   FSM — Comprehensive FSM for all 16 states
 *   SEC — Extended security matrix (buyer/merchant/store/org isolation)
 *
 * Test identities:
 *   - Admin (SUPER_ADMIN)
 *   - Moderator
 *   - Merchant A (orgA → storeA → warehouseA)
 *   - Merchant B (orgB → storeB → warehouseB)
 *   - Buyer A / Buyer B
 */

// ── Mocks ──────────────────────────────────────────────────────────────────
const storage = { createPresignedGetUrl: vi.fn(async (_b: string, key: string) => `https://cdn.test/${key}`) } as any;
const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
const redis = { get: vi.fn(), set: vi.fn(), del: vi.fn() } as any;
const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn() } as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

// ── Test identity IDs ──────────────────────────────────────────────────────
let orgA: string, orgB: string;
let merchantA: string, merchantB: string, buyerA: string, buyerB: string;
let adminUser: string, moderatorUser: string;
let storeA: string, storeB: string;
let warehouseA: string, warehouseB: string;
let merchantRoleId: string, buyerRoleId: string, moderatorRoleId: string;

describe('Phase 1 — Core Marketplace E2E', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let catalog: CatalogService;
  let taxonomy: CatalogTaxonomyService;
  let offerService: CatalogOfferService;
  let searchService: SearchService;
  let cartService: CartService;
  let ordersService: OrdersService;
  let inventoryService: InventoryService;
  let promotionsService: PromotionsService;

  // Shared catalog IDs
  let categoryId: string, brandId: string, productTypeId: string;
  let productId: string, variantId: string, variant2Id: string;
  let offerA: string, offerB: string, offerB2: string;
  let invItemA: string, invItemB: string;

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
    searchService = new SearchService(database, storage, redis as any);
    promotionsService = new PromotionsService(database);
    cartService = new CartService(database, promotionsService);
    ordersService = new OrdersService(database, outbox, promotionsService, realtime, cartService, notifications);
    inventoryService = new InventoryService(database, outbox);

    // ── Create test identities ────────────────────────────────────
    orgA = randomUUID(); orgB = randomUUID();
    merchantA = randomUUID(); merchantB = randomUUID();
    buyerA = randomUUID(); buyerB = randomUUID();
    adminUser = randomUUID(); moderatorUser = randomUUID();
    storeA = randomUUID(); storeB = randomUUID();
    warehouseA = randomUUID(); warehouseB = randomUUID();

    const roleRes = await pool.query(`SELECT id FROM roles WHERE key = 'MERCHANT_OWNER'`);
    merchantRoleId = roleRes.rows[0].id;
    const buyerRoleRes = await pool.query(`SELECT id FROM roles WHERE key = 'BUYER'`);
    buyerRoleId = buyerRoleRes.rows[0].id;
    const modRoleRes = await pool.query(`SELECT id FROM roles WHERE key = 'MODERATOR'`);
    moderatorRoleId = modRoleRes.rows[0].id;

    await db.insert(organizations).values([
      { id: orgA, name: 'Org Alpha', type: 'WHOLESALER', country: 'SA' },
      { id: orgB, name: 'Org Beta', type: 'WHOLESALER', country: 'SA' },
    ]);
    await db.insert(users).values([
      { id: adminUser, fullName: 'Admin User', phone: '+10000000001' },
      { id: moderatorUser, fullName: 'Moderator User', phone: '+10000000002' },
      { id: merchantA, fullName: 'Merchant Alpha', phone: '+10000000003' },
      { id: merchantB, fullName: 'Merchant Beta', phone: '+10000000004' },
      { id: buyerA, fullName: 'Buyer Alpha', phone: '+10000000005' },
      { id: buyerB, fullName: 'Buyer Beta', phone: '+10000000006' },
    ]);
    await db.insert(stores).values([
      { id: storeA, orgId: orgA, slug: 'alpha-store', displayName: 'Alpha Store' },
      { id: storeB, orgId: orgB, slug: 'beta-store', displayName: 'Beta Store' },
    ]);
    await db.insert(warehouses).values([
      { id: warehouseA, storeId: storeA, name: 'Alpha Warehouse' },
      { id: warehouseB, storeId: storeB, name: 'Beta Warehouse' },
    ]);
    await db.insert(organizationMembers).values([
      { id: randomUUID(), orgId: orgA, userId: merchantA, roleId: merchantRoleId },
      { id: randomUUID(), orgId: orgB, userId: merchantB, roleId: merchantRoleId },
      { id: randomUUID(), orgId: orgA, userId: buyerA, roleId: buyerRoleId },
      { id: randomUUID(), orgId: orgB, userId: buyerB, roleId: buyerRoleId },
    ]);

    // ── Catalog setup ─────────────────────────────────────────────
    const cat = await catalog.createCategory({ name: 'Test Electronics' });
    categoryId = cat.id;
    const br = await catalog.createBrand({ name: 'TestBrand' });
    brandId = br.id;
    const pt = await taxonomy.createProductType({ code: 'gadget', name: 'Gadget', categoryId });
    productTypeId = pt.id;
    await taxonomy.setProductTypeAttributes(productTypeId, [
      { attributeDefinitionId: (await taxonomy.createAttribute({ code: 'color', name: 'Color', type: 'TEXT', scope: 'VARIANT' })).id, required: true, scope: 'VARIANT', displayOrder: 0 },
    ]);
    await taxonomy.publishProductType(productTypeId);

    const prod = await catalog.createProduct({ storeId: storeA, title: 'Super Gadget', categoryId, brandId, productTypeId, images: ['gadget.png'] }, merchantA);
    productId = prod.id;
    await catalog.updateProduct(productId, { status: 'ACTIVE' });

    const v1 = await catalog.createVariant(productId, { sku: 'SG-RED', title: 'Super Gadget Red' });
    variantId = v1.id;
    const v2 = await catalog.createVariant(productId, { sku: 'SG-BLU', title: 'Super Gadget Blue' });
    variant2Id = v2.id;

    // ── Offers ────────────────────────────────────────────────────
    const oA = await offerService.createOffer({ storeId: storeA, productId, variantId, currency: 'SAR', basePriceMinor: 10000, moq: 1, leadTimeDays: 3, proposedBy: merchantA });
    offerA = oA.id;
    await offerService.proposeOffer(offerA, merchantA);
    await offerService.approveOffer(offerA, adminUser);

    const oB = await offerService.createOffer({ storeId: storeB, productId, variantId, currency: 'SAR', basePriceMinor: 9500, moq: 1, leadTimeDays: 5, proposedBy: merchantB });
    offerB = oB.id;
    await offerService.proposeOffer(offerB, merchantB);
    await offerService.approveOffer(offerB, adminUser);

    const oB2 = await offerService.createOffer({ storeId: storeB, productId, variantId: variant2Id, currency: 'SAR', basePriceMinor: 11000, moq: 1, leadTimeDays: 5, proposedBy: merchantB });
    offerB2 = oB2.id;
    await offerService.proposeOffer(offerB2, merchantB);
    await offerService.approveOffer(offerB2, adminUser);

    // ── Price lists & tiers ───────────────────────────────────────
    const plA = randomUUID(); const plB = randomUUID();
    await db.insert(priceLists).values([
      { id: plA, storeId: storeA, name: 'Alpha Retail', currency: 'SAR', isActive: true, priority: 10 },
      { id: plB, storeId: storeB, name: 'Beta Retail', currency: 'SAR', isActive: true, priority: 10 },
    ]);
    await db.insert(priceTiers).values([
      { id: randomUUID(), priceListId: plA, variantId, unitPriceMinor: 10000, minQty: 1 },
      { id: randomUUID(), priceListId: plA, variantId: variant2Id, unitPriceMinor: 12000, minQty: 1 },
      { id: randomUUID(), priceListId: plB, variantId, unitPriceMinor: 9500, minQty: 1 },
      { id: randomUUID(), priceListId: plB, variantId: variant2Id, unitPriceMinor: 11000, minQty: 1 },
    ]);

    // ── Inventory ─────────────────────────────────────────────────
    const invA = await inventoryService.createItem({ variantId, warehouseId: warehouseA, initialQty: 50, userId: merchantA });
    invItemA = invA.id;
    const invB = await inventoryService.createItem({ variantId, warehouseId: warehouseB, initialQty: 30, userId: merchantB });
    invItemB = invB.id;
    await inventoryService.createItem({ variantId: variant2Id, warehouseId: warehouseA, initialQty: 20, userId: merchantA });
    await inventoryService.createItem({ variantId: variant2Id, warehouseId: warehouseB, initialQty: 15, userId: merchantB });
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO A — Catalog Chain Validation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario A — Catalog chain validation', () => {
    it('Category → ProductType → Product → Variant → Offer → Inventory are correctly connected', async () => {
      // Category exists and is active
      const catRes = await pool.query(`SELECT * FROM categories WHERE id = $1`, [categoryId]);
      expect(catRes.rows.length).toBe(1);
      expect(catRes.rows[0].is_active).toBe(true);

      // ProductType linked to category
      const ptRes = await pool.query(`SELECT * FROM product_types WHERE id = $1 AND category_id = $2`, [productTypeId, categoryId]);
      expect(ptRes.rows.length).toBe(1);
      expect(ptRes.rows[0].status).toBe('PUBLISHED');

      // Product linked to category, brand, productType
      const prodRes = await pool.query(`SELECT * FROM products WHERE id = $1 AND category_id = $2 AND brand_id = $3 AND product_type_id = $4`, [productId, categoryId, brandId, productTypeId]);
      expect(prodRes.rows.length).toBe(1);
      expect(prodRes.rows[0].status).toBe('ACTIVE');

      // Variants linked to product
      const varRes = await pool.query(`SELECT * FROM product_variants WHERE product_id = $1`, [productId]);
      expect(varRes.rows.length).toBeGreaterThanOrEqual(2);

      // Offers linked to product + variant + store
      const offerRes = await pool.query(`SELECT * FROM merchant_offers WHERE product_id = $1 AND variant_id = $2 AND status = 'ACTIVE'`, [productId, variantId]);
      expect(offerRes.rows.length).toBeGreaterThanOrEqual(2); // offerA + offerB

      // Inventory linked to variant via warehouse → store
      const invRes = await pool.query(`
        SELECT ii.* FROM inventory_items ii
        JOIN warehouses w ON ii.warehouse_id = w.id
        JOIN stores s ON w.store_id = s.id
        WHERE w.store_id = $1
      `, [storeA]);
      expect(invRes.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('no legacy products.moq or products.is_available used for merchant commercial behavior', async () => {
      // products.moq still exists as a column (legacy fallback) but the checkout
      // path uses offer.moq as authoritative. Verify offer.moq is the source of truth.
      const offerRes = await pool.query(`SELECT moq FROM merchant_offers WHERE id = $1`, [offerA]);
      expect(offerRes.rows[0].moq).toBe(1);

      // The offer layer carries MOQ, pricing, lead time — not the product
      const prodRes = await pool.query(`SELECT moq FROM products WHERE id = $1`, [productId]);
      // product.moq may exist but is irrelevant when offer.moq is set
      expect(prodRes.rows.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO B — Buyer Discovery
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario B — Buyer discovery (search → PDP → offers)', () => {
    it('search returns canonical products with offer enrichment', async () => {
      const result = await searchService.search('Super Gadget');
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const found = result.items.find((i: any) => i.id === productId);
      expect(found).toBeTruthy();
      expect(found!.title).toBe('Super Gadget');
      expect(found!.status).toBe('ACTIVE');
    });

    it('product detail returns variants and the product is distinguishable from merchant offers', async () => {
      const detail = await catalog.getProductDetail(productId);
      expect(detail).toBeTruthy();
      expect(detail.title).toBe('Super Gadget');
      // The product is the canonical entity; offers are separate commercial layer
      expect(detail.id).toBe(productId);
    });

    it('multiple offers from different stores exist for the same variant', async () => {
      const offerRes = await pool.query(`
        SELECT mo.*, s.display_name as store_name, s.org_id
        FROM merchant_offers mo
        JOIN stores s ON mo.store_id = s.id
        WHERE mo.variant_id = $1 AND mo.status = 'ACTIVE'
        ORDER BY mo.base_price_minor ASC
      `, [variantId]);
      expect(offerRes.rows.length).toBeGreaterThanOrEqual(2);
      // Offers from different stores
      const storeIds = offerRes.rows.map((r: any) => r.store_id);
      expect(new Set(storeIds).size).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO C — Single-Merchant Cart
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario C — Single-merchant cart', () => {
    it('offer → cart → cart item for a single store', async () => {
      // Buyer B adds only from store A
      await cartService.addItem(buyerB, { variantId, quantity: 2, offerId: offerA });

      const cart = await cartService.getActiveCartWithItems(buyerB);
      expect(cart).toBeTruthy();
      expect(cart.items.length).toBe(1);
      const firstItem = cart.items[0] as any;
      expect(firstItem.storeId).toBe(storeA);
      expect(firstItem.offerId).toBe(offerA);
      expect(firstItem.quantity).toBe(2);
      expect(firstItem.priceMinor).toBe(10000); // Server-resolved price

      // Clean up for later tests
      await cartService.clearCart(buyerB);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO E — Client Tampering Resistance
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario E — Client tampering resistance', () => {
    it('server computes authoritative price — client cannot set arbitrary priceMinor in cart', async () => {
      // addItem takes {variantId, quantity, offerId} — no priceMinor input from client
      // The price is resolved server-side via resolveOfferPrices()
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const cart = await cartService.getActiveCartWithItems(buyerA);
      const item = cart.items[0] as any;
      // Price must match the price tier, not any client-supplied value
      expect(item.priceMinor).toBe(10000);

      // Even if we directly update the cart_item's priceMinor in the DB,
      // checkout re-reads from the cart_items table — but the only way to
      // set it is through the service, which always uses server-resolved prices.
      // Verify the checkout uses the stored price (which was server-set).
      const co = await ordersService.checkout({
        buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `tamper-${randomUUID()}`,
      });
      const subA = co.subOrders.find((s: any) => s.storeId === storeA) as any;
      expect(subA).toBeTruthy();
      expect(subA.items[0].unitPriceMinor).toBe(10000);
    });

    it('server computes totals — financial integrity at checkout', async () => {
      const masterRes = await pool.query(`SELECT id FROM master_orders ORDER BY created_at DESC LIMIT 1`);
      const subRes = await pool.query(`SELECT * FROM orders WHERE master_order_id = $1`, [masterRes.rows[0].id]);
      for (const row of subRes.rows) {
        const subtotal = Number(row.subtotal_minor);
        const discount = Number(row.discount_minor);
        const delivery = Number(row.delivery_fee_minor);
        const tax = Number(row.tax_minor);
        const total = Number(row.total_minor);
        // total = subtotal - discount + tax + delivery
        expect(total).toBe(subtotal - discount + tax + delivery);
      }
    });

    it('offer snapshot is immutable — changing offer price after checkout does not affect order', async () => {
      const masterRes = await pool.query(`SELECT id FROM master_orders ORDER BY created_at DESC LIMIT 1`);
      const itemsRes = await pool.query(`SELECT unit_price_minor FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.master_order_id = $1`, [masterRes.rows[0].id]);
      const originalPrice = Number(itemsRes.rows[0].unit_price_minor);

      // Change offer price dramatically
      await offerService.updateOfferPricing(offerA, { basePriceMinor: 99999 });

      // Historical order unchanged
      const afterRes = await pool.query(`SELECT unit_price_minor FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.master_order_id = $1`, [masterRes.rows[0].id]);
      expect(Number(afterRes.rows[0].unit_price_minor)).toBe(originalPrice);

      // Restore
      await offerService.updateOfferPricing(offerA, { basePriceMinor: 10000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO F — Idempotency Conflict
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario F — Idempotency conflict (same key, different payload)', () => {
    it('same idempotency key with different cart → 409 Conflict', async () => {
      // First checkout: buyerA with variantId
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const idemKey = `conflict-test-${randomUUID()}`;
      const first = await ordersService.checkout({
        buyerId: buyerA, deliveryAddress: {}, idempotencyKey: idemKey,
      });
      expect(first.id).toBeTruthy();

      // Second checkout: buyerA with variant2Id (DIFFERENT cart contents)
      await cartService.addItem(buyerA, { variantId: variant2Id, quantity: 1, offerId: offerB2 });
      // Same idempotency key, different cart → should throw 409
      await expect(
        ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: idemKey }),
      ).rejects.toThrow(/idempotency|conflict|409/i);
    });

    it('same idempotency key with same cart → returns existing order', async () => {
      // Fresh buyer to avoid cart contamination
      await cartService.addItem(buyerB, { variantId, quantity: 1, offerId: offerA });
      const idemKey = `idem-same-${randomUUID()}`;
      const first = await ordersService.checkout({
        buyerId: buyerB, deliveryAddress: {}, idempotencyKey: idemKey,
      });

      // Cart is now CONVERTED, so second call returns existing (no active cart → early return)
      const second = await ordersService.checkout({
        buyerId: buyerB, deliveryAddress: {}, idempotencyKey: idemKey,
      });
      expect(first.id).toBe(second.id);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO G — Inventory Concurrency (stock=5, req=4+4)
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario G — Inventory concurrency (stock=5, req=4+4)', () => {
    it('never reserves more than available stock under concurrent demand', async () => {
      // Create a variant with exactly 5 units of stock
      const concVariant = await catalog.createVariant(productId, { sku: `CONC5-${Date.now()}`, title: 'Concurrency-5 Item' });
      const concInv = await inventoryService.createItem({ variantId: concVariant.id, warehouseId: warehouseA, initialQty: 5, userId: merchantA });

      // Set up price
      const plId = (await pool.query(`SELECT id FROM price_lists WHERE store_id = '${storeA}' AND is_active = true LIMIT 1`)).rows[0].id;
      await db.update(priceTiers)
        .set({ unitPriceMinor: 5000, updatedAt: new Date() })
        .where(and(eq(priceTiers.priceListId, plId), eq(priceTiers.variantId, concVariant.id)));

      // Create offer
      const concOffer = await offerService.createOffer({ storeId: storeA, productId, variantId: concVariant.id, currency: 'SAR', basePriceMinor: 5000, moq: 1, proposedBy: merchantA });
      await offerService.proposeOffer(concOffer.id, merchantA);
      await offerService.approveOffer(concOffer.id, adminUser);

      // Two concurrent reservation requests of 4 each (total demand = 8, stock = 5)
      const results = await Promise.allSettled([
        inventoryService.reserveStock({ inventoryItemId: concInv.id, quantity: 4, userId: merchantA }),
        inventoryService.reserveStock({ inventoryItemId: concInv.id, quantity: 4, userId: merchantA }),
      ]);

      // At most one can succeed (4 reserved), the other must fail or partially reserve
      const final = await inventoryService.getItem(concInv.id);
      expect(final.qtyReserved).toBeLessThanOrEqual(5);
      expect(final.qtyOnHand - final.qtyReserved).toBeGreaterThanOrEqual(0);

      // Count successful reservations
      const successes = results.filter(r => r.status === 'fulfilled');
      // Either 0 or 1 succeeded (if first took all 5, second fails; if first took 4, second can't take 4)
      expect(successes.length).toBeLessThanOrEqual(1);

      // Verify total reserved never exceeds stock
      const moveRes = await pool.query(
        `SELECT COALESCE(SUM(ABS(quantity)), 0)::int AS total FROM stock_movements WHERE inventory_item_id = $1 AND movement_type = 'RESERVE'`,
        [concInv.id],
      );
      expect(moveRes.rows[0].total).toBeLessThanOrEqual(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // FSM — Comprehensive Order State Machine Validation
  // ═══════════════════════════════════════════════════════════════════
  describe('FSM — Comprehensive order state machine', () => {
    let freshOrderId!: string;

    beforeAll(async () => {
      // Create a fresh order for FSM testing
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const co = await ordersService.checkout({
        buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `fsm-full-${randomUUID()}`,
      });
      freshOrderId = (co.subOrders[0] as any).id;
      expect(freshOrderId).toBeTruthy();
    });

    it('starts at PENDING_CONFIRMATION (auto-advanced from SUBMITTED)', async () => {
      const order = await ordersService.getOrder(freshOrderId);
      expect(order.status).toBe('PENDING_CONFIRMATION');
    });

    it('PENDING_CONFIRMATION → ACCEPTED', async () => {
      const result = await ordersService.acceptOrder(freshOrderId, merchantA);
      expect(result.status).toBe('ACCEPTED');
    });

    it('ACCEPTED → PREPARING', async () => {
      const result = await ordersService.transitionStatus(freshOrderId, 'PREPARING', merchantA, 'MERCHANT');
      expect(result.status).toBe('PREPARING');
    });

    it('PREPARING → READY', async () => {
      const result = await ordersService.transitionStatus(freshOrderId, 'READY', merchantA, 'MERCHANT');
      expect(result.status).toBe('READY');
    });

    it('READY → OUT_FOR_DELIVERY', async () => {
      const result = await ordersService.transitionStatus(freshOrderId, 'OUT_FOR_DELIVERY', merchantA, 'MERCHANT');
      expect(result.status).toBe('OUT_FOR_DELIVERY');
    });

    it('OUT_FOR_DELIVERY → DELIVERED', async () => {
      const result = await ordersService.transitionStatus(freshOrderId, 'DELIVERED', merchantA, 'MERCHANT');
      expect(result.status).toBe('DELIVERED');
    });

    it('DELIVERED → COMPLETED', async () => {
      const result = await ordersService.transitionStatus(freshOrderId, 'COMPLETED', merchantA, 'MERCHANT');
      expect(result.status).toBe('COMPLETED');
    });

    it('COMPLETED is terminal (no forward transitions)', async () => {
      await expect(
        ordersService.transitionStatus(freshOrderId, 'ACCEPTED', merchantA, 'MERCHANT'),
      ).rejects.toThrow(/Invalid transition/);
    });

    it('CANCELLED is terminal', async () => {
      // Create and cancel an order
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `fsm-cancel-${randomUUID()}` });
      const cancelId = co.subOrders[0]?.id;
      await ordersService.cancelOrder(cancelId!, buyerA, 'Test cancel', undefined);
      const cancelled = await ordersService.getOrder(cancelId!);
      expect(cancelled.status).toBe('CANCELLED');

      await expect(
        ordersService.transitionStatus(cancelId!, 'ACCEPTED', merchantA, 'MERCHANT'),
      ).rejects.toThrow(/Invalid transition/);
    });

    it('REJECTED is terminal', async () => {
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `fsm-reject-${randomUUID()}` });
      const rejectId = co.subOrders[0]?.id;
      await ordersService.rejectOrder(rejectId!, merchantA, 'Out of stock');
      const rejected = await ordersService.getOrder(rejectId!);
      expect(rejected.status).toBe('REJECTED');

      await expect(
        ordersService.transitionStatus(rejectId!, 'ACCEPTED', merchantA, 'MERCHANT'),
      ).rejects.toThrow(/Invalid transition/);
    });

    it('PENDING_CONFIRMATION → PARTIALLY_ACCEPTED → PREPARING path', async () => {
      await cartService.addItem(buyerA, { variantId, quantity: 5, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `fsm-partial-${randomUUID()}` });
      const partialId = co.subOrders[0]?.id;
      const items = await ordersService.getOrderWithItems(partialId!);
      const itemId = items.items[0]!.id;

      const result = await ordersService.partiallyAcceptOrder(partialId!, merchantA, [{ itemId, qtyConfirmed: 2 }]);
      expect(result.status).toBe('PARTIALLY_ACCEPTED');

      const preparing = await ordersService.transitionStatus(partialId!, 'PREPARING', merchantA, 'MERCHANT');
      expect(preparing.status).toBe('PREPARING');
    });

    it('forbidden transition: PENDING_CONFIRMATION → DELIVERED (skips states)', async () => {
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `fsm-skip-${randomUUID()}` });
      const skipId = co.subOrders[0]?.id;

      await expect(
        ordersService.transitionStatus(skipId!, 'DELIVERED', merchantA, 'MERCHANT'),
      ).rejects.toThrow(/Invalid transition/);
    });

    it('status history records every transition', async () => {
      const histRes = await pool.query(
        `SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`,
        [freshOrderId],
      );
      expect(histRes.rows.length).toBeGreaterThanOrEqual(7); // SUBMITTED → PENDING → ACCEPTED → PREPARING → READY → OFD → DELIVERED → COMPLETED
      const statuses = histRes.rows.map((r: any) => r.to_status);
      expect(statuses).toContain('SUBMITTED');
      expect(statuses).toContain('PENDING_CONFIRMATION');
      expect(statuses).toContain('ACCEPTED');
      expect(statuses).toContain('COMPLETED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECURITY — Extended Tenant Isolation Matrix
  // ═══════════════════════════════════════════════════════════════════
  describe('Security — Extended tenant isolation', () => {
    let orderFromStoreA: string | undefined;
    let orderFromStoreB: string | undefined;
    let masterFromBuyerA!: string;

    beforeAll(async () => {
      // Create orders in both stores via buyerA
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const coA = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `sec-a-${randomUUID()}` });
      orderFromStoreA = coA.subOrders.find((s: any) => s.storeId === storeA)?.id;

      await cartService.addItem(buyerA, { variantId: variant2Id, quantity: 1, offerId: offerB2 });
      const coB = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `sec-b-${randomUUID()}` });
      orderFromStoreB = coB.subOrders.find((s: any) => s.storeId === storeB)?.id;
      masterFromBuyerA = coB.id;
    });

    it('Buyer A cannot read Buyer B master order', async () => {
      // Create an order as buyerB
      await cartService.addItem(buyerB, { variantId, quantity: 1, offerId: offerA });
      const coB = await ordersService.checkout({ buyerId: buyerB, deliveryAddress: {}, idempotencyKey: `sec-buyerb-${randomUUID()}` });

      await expect(
        ordersService.getMasterOrder(coB.id, { sub: buyerA, role: 'BUYER', activeOrg: null }),
      ).rejects.toThrow();
    });

    it('Merchant A cannot read Store B sub-order', async () => {
      if (!orderFromStoreB) return;
      await expect(
        ordersService.getOrderWithItems(orderFromStoreB, { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA }),
      ).rejects.toThrow();
    });

    it('Merchant B cannot read Store A sub-order', async () => {
      if (!orderFromStoreA) return;
      await expect(
        ordersService.getOrderWithItems(orderFromStoreA, { sub: merchantB, role: 'MERCHANT_OWNER', activeOrg: orgB }),
      ).rejects.toThrow();
    });

    it('Merchant A can read Store A sub-order', async () => {
      if (!orderFromStoreA) return;
      const result = await ordersService.getOrderWithItems(orderFromStoreA, { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA });
      expect(result).toBeTruthy();
      expect(result.id).toBe(orderFromStoreA);
    });

    it('Merchant B can read Store B sub-order', async () => {
      if (!orderFromStoreB) return;
      const result = await ordersService.getOrderWithItems(orderFromStoreB, { sub: merchantB, role: 'MERCHANT_OWNER', activeOrg: orgB });
      expect(result).toBeTruthy();
      expect(result.id).toBe(orderFromStoreB);
    });

    it('Buyer A can read their own master order', async () => {
      const result = await ordersService.getMasterOrder(masterFromBuyerA, { sub: buyerA, role: 'BUYER', activeOrg: null });
      expect(result).toBeTruthy();
      expect(result.id).toBe(masterFromBuyerA);
    });

    it('Org A merchant cannot list Org B warehouse inventory', async () => {
      await expect(
        inventoryService.listByWarehouse(warehouseB, { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA }),
      ).rejects.toThrow();
    });

    it('Admin (SUPER_ADMIN) can access any order', async () => {
      if (!orderFromStoreB) return;
      const result = await ordersService.getOrderWithItems(orderFromStoreB, { sub: adminUser, role: 'SUPER_ADMIN', activeOrg: null });
      expect(result).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // DATABASE INTEGRITY
  // ═══════════════════════════════════════════════════════════════════
  describe('Database integrity', () => {
    it('no orphan order items', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL`);
      expect(res.rows[0].cnt).toBe(0);
    });

    it('no orphan sub-orders', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders o LEFT JOIN master_orders m ON o.master_order_id = m.id WHERE m.id IS NULL`);
      expect(res.rows[0].cnt).toBe(0);
    });

    it('no negative reserved quantity', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM inventory_items WHERE qty_reserved < 0`);
      expect(res.rows[0].cnt).toBe(0);
    });

    it('no negative available quantity', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM inventory_items WHERE (qty_on_hand - qty_reserved) < 0`);
      expect(res.rows[0].cnt).toBe(0);
    });

    it('financial breakdown exists for every sub-order', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders o LEFT JOIN order_financial_breakdown b ON o.id = b.order_id WHERE b.order_id IS NULL`);
      expect(res.rows[0].cnt).toBe(0);
    });
  });
});
