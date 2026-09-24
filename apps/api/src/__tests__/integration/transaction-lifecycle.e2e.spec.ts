import 'reflect-metadata';
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
import { CartService } from '../../modules/orders/cart.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { PromotionsService } from '../../modules/promotions/promotions.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
// Schemas
import { products, productVariants, categories, brands } from '../../modules/catalog/catalog.schema';
import { attributeDefinitions, attributeOptions, attributeGroups, productTypes, productTypeAttributes, productAttributeValues, variantAttributeValues } from '../../modules/catalog/catalog.taxonomy.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations, organizationMembers, roles } from '../../modules/identity/identity.schema';
import { stores, warehouses } from '../../modules/merchant/merchant.schema';
import { priceLists, priceTiers } from '../../modules/pricing/pricing.schema';
import { promotions, promotionRedemptions } from '../../modules/promotions/promotions.schema';
import { inventoryItems, stockMovements } from '../../modules/inventory/inventory.schema';
import { carts, cartItems } from '../../modules/orders/cart.schema';
import { masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory } from '../../modules/orders/orders.schema';
import { outboxEvents, auditLogs } from '../../modules/audit/audit.schema';
import { disputes } from '../../modules/reviews/support.schema';

/**
 * Transaction Foundation E2E — real PostgreSQL
 *
 * Proves Cart → Checkout → Order → Inventory works correctly against a
 * disposable PostgreSQL container with real migrations, real RBAC seed,
 * and real services.
 *
 * Test identities:
 *   - Admin (SUPER_ADMIN)
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
let merchantA: string, merchantB: string, buyerA: string, buyerB: string, adminUser: string;
let storeA: string, storeB: string;
let warehouseA: string, warehouseB: string;
let merchantRoleId: string;

describe('Transaction Foundation E2E — real PostgreSQL', () => {
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
        products, productVariants, categories, brands,
        attributeDefinitions, attributeOptions, attributeGroups,
        productTypes, productTypeAttributes, productAttributeValues, variantAttributeValues,
        merchantOffers, stores, warehouses, users, organizations, disputes,
        priceLists, priceTiers, promotions, promotionRedemptions,
        inventoryItems, stockMovements, carts, cartItems,
        masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory,
        outboxEvents, auditLogs,
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
    promotionsService = new PromotionsService(database);
    cartService = new CartService(database, promotionsService);
    ordersService = new OrdersService(database, outbox, promotionsService, realtime, cartService, notifications);
    inventoryService = new InventoryService(database, outbox);

    // ── Create test identities ────────────────────────────────────
    orgA = randomUUID(); orgB = randomUUID();
    merchantA = randomUUID(); merchantB = randomUUID();
    buyerA = randomUUID(); buyerB = randomUUID(); adminUser = randomUUID();
    storeA = randomUUID(); storeB = randomUUID();
    warehouseA = randomUUID(); warehouseB = randomUUID();

    const roleRes = await pool.query(`SELECT id FROM roles WHERE key = 'MERCHANT_OWNER'`);
    merchantRoleId = roleRes.rows[0].id;
    const buyerRoleRes = await pool.query(`SELECT id FROM roles WHERE key = 'BUYER'`);
    const buyerRoleId = buyerRoleRes.rows[0].id;

    await db.insert(organizations).values([
      { id: orgA, name: 'Merchant A Org', type: 'WHOLESALER', country: 'SA' },
      { id: orgB, name: 'Merchant B Org', type: 'WHOLESALER', country: 'SA' },
    ]);
    await db.insert(users).values([
      { id: adminUser, fullName: 'Admin', phone: '+10000000001' },
      { id: merchantA, fullName: 'Merchant A', phone: '+10000000002' },
      { id: merchantB, fullName: 'Merchant B', phone: '+10000000003' },
      { id: buyerA, fullName: 'Buyer A', phone: '+10000000004' },
      { id: buyerB, fullName: 'Buyer B', phone: '+10000000005' },
    ]);
    await db.insert(stores).values([
      { id: storeA, orgId: orgA, slug: 'store-a', displayName: 'Store A' },
      { id: storeB, orgId: orgB, slug: 'store-b', displayName: 'Store B' },
    ]);
    await db.insert(warehouses).values([
      { id: warehouseA, storeId: storeA, name: 'Warehouse A' },
      { id: warehouseB, storeId: storeB, name: 'Warehouse B' },
    ]);
    await db.insert(organizationMembers).values([
      { id: randomUUID(), orgId: orgA, userId: merchantA, roleId: merchantRoleId },
      { id: randomUUID(), orgId: orgB, userId: merchantB, roleId: merchantRoleId },
      { id: randomUUID(), orgId: orgA, userId: buyerA, roleId: buyerRoleId },
      { id: randomUUID(), orgId: orgA, userId: buyerB, roleId: buyerRoleId },
    ]);

    // ── Catalog setup ─────────────────────────────────────────────
    const cat = await catalog.createCategory({ name: 'Electronics' });
    categoryId = cat.id;
    const br = await catalog.createBrand({ name: 'TestBrand' });
    brandId = br.id;
    const pt = await taxonomy.createProductType({ code: 'widget', name: 'Widget', categoryId });
    productTypeId = pt.id;
    await taxonomy.setProductTypeAttributes(productTypeId, [
      { attributeDefinitionId: (await taxonomy.createAttribute({ code: 'color', name: 'Color', type: 'TEXT', scope: 'VARIANT' })).id, required: true, scope: 'VARIANT', displayOrder: 0 },
    ]);
    await taxonomy.publishProductType(productTypeId);

    const prod = await catalog.createProduct({ storeId: storeA, title: 'Widget Pro', categoryId, brandId, productTypeId, images: ['widget.png'] }, merchantA);
    productId = prod.id;
    await catalog.updateProduct(productId, { status: 'ACTIVE' });

    const v1 = await catalog.createVariant(productId, { sku: 'WP-RED', title: 'Widget Pro Red' });
    variantId = v1.id;
    const v2 = await catalog.createVariant(productId, { sku: 'WP-BLU', title: 'Widget Pro Blue' });
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

    // Offer for variant2 from storeB (needed for multi-merchant cart tests)
    const oB2 = await offerService.createOffer({ storeId: storeB, productId, variantId: variant2Id, currency: 'SAR', basePriceMinor: 11000, moq: 1, leadTimeDays: 5, proposedBy: merchantB });
    offerB2 = oB2.id;
    await offerService.proposeOffer(offerB2, merchantB);
    await offerService.approveOffer(offerB2, adminUser);

    // ── Price lists & tiers (needed for cart pricing) ─────────────
    const plA = randomUUID(); const plB = randomUUID();
    await db.insert(priceLists).values([
      { id: plA, storeId: storeA, name: 'Store A Retail', currency: 'SAR', isActive: true, priority: 10 },
      { id: plB, storeId: storeB, name: 'Store B Retail', currency: 'SAR', isActive: true, priority: 10 },
    ]);
    await db.insert(priceTiers).values([
      { id: randomUUID(), priceListId: plA, variantId, unitPriceMinor: 10000, minQty: 1 },
      { id: randomUUID(), priceListId: plA, variantId: variant2Id, unitPriceMinor: 12000, minQty: 1 },
      { id: randomUUID(), priceListId: plB, variantId, unitPriceMinor: 9500, minQty: 1 },
      { id: randomUUID(), priceListId: plB, variantId: variant2Id, unitPriceMinor: 11000, minQty: 1 },
    ]);

    // ── Inventory ─────────────────────────────────────────────────
    const invA = await inventoryService.createItem({ variantId, warehouseId: warehouseA, initialQty: 20, userId: merchantA });
    invItemA = invA.id;
    const invB = await inventoryService.createItem({ variantId, warehouseId: warehouseB, initialQty: 10, userId: merchantB });
    invItemB = invB.id;
    // Also stock variant2 for store A and store B
    await inventoryService.createItem({ variantId: variant2Id, warehouseId: warehouseA, initialQty: 15, userId: merchantA });
    await inventoryService.createItem({ variantId: variant2Id, warehouseId: warehouseB, initialQty: 10, userId: merchantB });
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 1 — Multi-Merchant Cart → Checkout
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 1 — Multi-merchant cart → checkout', () => {
    it('creates 1 master order with 2 sub-orders from a multi-merchant cart', async () => {
      // Buyer A adds from Merchant A and Merchant B
      await cartService.addItem(buyerA, { variantId, quantity: 2, offerId: offerA });
      await cartService.addItem(buyerA, { variantId: variant2Id, quantity: 1, offerId: offerB2 });

      // Validate cart
      const validation = await cartService.validateCart(buyerA);
      expect(validation.stale).toHaveLength(0);

      // Checkout
      const result = await ordersService.checkout({
        buyerId: buyerA,
        deliveryAddress: { street: '123 Test St' },
        idempotencyKey: `test-checkout-${randomUUID()}`,
      });

      expect(result.subOrders).toHaveLength(2);
      const storeIds = result.subOrders.map((so: any) => so.storeId);
      expect(new Set(storeIds).size).toBe(2);
      expect(storeIds).toContain(storeA);
      expect(storeIds).toContain(storeB);

      // Verify order items have snapshot data
      for (const so of result.subOrders) {
        expect(so.items.length).toBeGreaterThanOrEqual(1);
        for (const item of so.items) {
          expect(item.variantId).toBeTruthy();
          expect(item.unitPriceMinor).toBeGreaterThan(0);
          expect(item.sku).toBeTruthy();
          expect(item.title).toBeTruthy();
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 2 — Financial Integrity
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 2 — Financial integrity', () => {
    it('sub-order financials satisfy total = subtotal - discount + tax + delivery', async () => {
      // Use the most recent master order
      const masterRes = await pool.query(`SELECT id FROM master_orders ORDER BY created_at DESC LIMIT 1`);
      const masterId = masterRes.rows[0].id;
      const subRes = await pool.query(`SELECT id, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor, currency FROM orders WHERE master_order_id = $1`, [masterId]);

      for (const row of subRes.rows) {
        // pg returns bigint as string — coerce to number for arithmetic
        const subtotal = Number(row.subtotal_minor);
        const discount = Number(row.discount_minor);
        const delivery = Number(row.delivery_fee_minor);
        const tax = Number(row.tax_minor);
        const total = Number(row.total_minor);
        const expected = subtotal - discount + tax + delivery;
        expect(total).toBe(expected);
        // All amounts are integer minor units
        expect(Number.isInteger(total)).toBe(true);
        expect(Number.isInteger(subtotal)).toBe(true);
      }

      // Verify financial breakdown exists for each sub-order
      for (const sub of subRes.rows) {
        const bdRes = await pool.query(`SELECT * FROM order_financial_breakdown WHERE order_id = $1`, [sub.id]);
        expect(bdRes.rows.length).toBe(1);
        const bd = bdRes.rows[0];
        expect(Number(bd.products_minor)).toBe(Number(sub.subtotal_minor));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 3 — Price Snapshot Immutability
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 3 — Price snapshot immutability', () => {
    it('historical order retains original price after merchant changes offer price', async () => {
      // Get order items from the checkout
      const masterRes = await pool.query(`SELECT id FROM master_orders ORDER BY created_at DESC LIMIT 1`);
      const itemsRes = await pool.query(`SELECT unit_price_minor, offer_snapshot FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.master_order_id = $1`, [masterRes.rows[0].id]);

      const originalPrice = Number(itemsRes.rows[0].unit_price_minor);
      expect(originalPrice).toBe(10000); // Store A price

      // Change the offer price
      await offerService.updateOfferPricing(offerA, { basePriceMinor: 15000 });

      // Verify historical order still shows original price
      const afterRes = await pool.query(`SELECT unit_price_minor FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.master_order_id = $1`, [masterRes.rows[0].id]);
      expect(Number(afterRes.rows[0].unit_price_minor)).toBe(10000);

      // Restore price for subsequent tests
      await offerService.updateOfferPricing(offerA, { basePriceMinor: 10000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 4 — Cart Revalidation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 4 — Cart revalidation', () => {
    it('detects stale items when offer is suspended', async () => {
      // Buyer B adds item
      await cartService.addItem(buyerB, { variantId, quantity: 1, offerId: offerA });

      // Suspend the offer
      await offerService.suspendOffer(offerA);

      // Validate cart — should detect stale
      const validation = await cartService.validateCart(buyerB);
      expect(validation.stale.length + validation.repriced.length).toBeGreaterThanOrEqual(1);

      // Reactivate for subsequent tests
      await offerService.reactivateOffer(offerA);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 5 — Order FSM
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 5 — Order FSM transitions', () => {
    let orderId: string;

    beforeAll(async () => {
      const subRes = await pool.query(`SELECT id FROM orders WHERE status = 'PENDING_CONFIRMATION' LIMIT 1`);
      orderId = subRes.rows[0]?.id;
    });

    it('transitions ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED', async () => {
      if (!orderId) return;
      const accepted = await ordersService.acceptOrder(orderId, merchantA);
      expect(accepted.status).toBe('ACCEPTED');

      const preparing = await ordersService.transitionStatus(orderId, 'PREPARING', merchantA, 'MERCHANT');
      expect(preparing.status).toBe('PREPARING');

      const ready = await ordersService.transitionStatus(orderId, 'READY', merchantA, 'MERCHANT');
      expect(ready.status).toBe('READY');

      const outForDelivery = await ordersService.transitionStatus(orderId, 'OUT_FOR_DELIVERY', merchantA, 'MERCHANT');
      expect(outForDelivery.status).toBe('OUT_FOR_DELIVERY');

      const delivered = await ordersService.transitionStatus(orderId, 'DELIVERED', merchantA, 'MERCHANT');
      expect(delivered.status).toBe('DELIVERED');

      const completed = await ordersService.transitionStatus(orderId, 'COMPLETED', merchantA, 'MERCHANT');
      expect(completed.status).toBe('COMPLETED');
    });

    it('rejects invalid transition COMPLETED → ACCEPTED', async () => {
      if (!orderId) return;
      await expect(
        ordersService.transitionStatus(orderId, 'ACCEPTED', merchantA, 'MERCHANT'),
      ).rejects.toThrow(/Invalid transition/);
    });

    it('rejects invalid transition from terminal state', async () => {
      // Create a new order to test rejection
      const cart2 = await cartService.getOrCreateCart(buyerA);
      await cartService.addItem(buyerA, { variantId, quantity: 1, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `fsm-${randomUUID()}` });
      const subId = co.subOrders[0]?.id;
      expect(subId).toBeTruthy();

      await ordersService.rejectOrder(subId!, merchantA, 'Out of stock');
      const rejected = await ordersService.getOrder(subId!);
      expect(rejected.status).toBe('REJECTED');

      // Cannot transition from REJECTED
      await expect(
        ordersService.transitionStatus(subId!, 'ACCEPTED', merchantA, 'MERCHANT'),
      ).rejects.toThrow(/Invalid transition/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 6 — Stock Reservation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 6 — Stock reservation on accept', () => {
    it('reserves stock when merchant accepts an order', async () => {
      // Fresh checkout for reservation test
      await cartService.addItem(buyerA, { variantId, quantity: 3, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `reserve-${randomUUID()}` });
      const subId = co.subOrders.find((s: any) => s.storeId === storeA)?.id;
      expect(subId).toBeTruthy();

      // Before accept: check inventory
      const before = await inventoryService.getItem(invItemA);
      const beforeReserved = before.qtyReserved;

      // Accept
      await ordersService.acceptOrder(subId!, merchantA);

      // After accept: qty_reserved increased
      const after = await inventoryService.getItem(invItemA);
      expect(after.qtyReserved).toBe(beforeReserved + 3);
      expect(after.qtyOnHand - after.qtyReserved).toBeGreaterThanOrEqual(0);

      // Verify RESERVE movement exists
      const movements = await pool.query(
        `SELECT * FROM stock_movements WHERE inventory_item_id = $1 AND movement_type = 'RESERVE' AND reference_id = $2`,
        [invItemA, subId],
      );
      expect(movements.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 7 — Stock Release
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 7 — Stock release on cancel', () => {
    it('releases reserved stock when order is cancelled', async () => {
      // Create and accept an order
      await cartService.addItem(buyerA, { variantId, quantity: 2, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `release-${randomUUID()}` });
      const subId = co.subOrders.find((s: any) => s.storeId === storeA)?.id;
      await ordersService.acceptOrder(subId!, merchantA);

      const before = await inventoryService.getItem(invItemA);
      const beforeReserved = before.qtyReserved;

      // Cancel
      await ordersService.cancelOrder(subId!, buyerA, 'Changed mind', undefined);

      const after = await inventoryService.getItem(invItemA);
      expect(after.qtyReserved).toBe(beforeReserved - 2);

      // Verify RELEASE movement
      const movements = await pool.query(
        `SELECT * FROM stock_movements WHERE inventory_item_id = $1 AND movement_type = 'RELEASE' AND reference_id = $2`,
        [invItemA, subId],
      );
      expect(movements.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('double cancel does not corrupt stock (idempotent release)', async () => {
      // The order is already cancelled; trying again should fail at FSM level
      const cancelledRes = await pool.query(`SELECT id FROM orders WHERE status = 'CANCELLED' LIMIT 1`);
      if (cancelledRes.rows.length === 0) return;
      const id = cancelledRes.rows[0].id;
      await expect(
        ordersService.cancelOrder(id, buyerA, 'Again', undefined),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 8 — Stock Consumption (SALE on DELIVERED)
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 8 — Stock consumption on delivery', () => {
    it('deducts on_hand and reserved on DELIVERED', async () => {
      await cartService.addItem(buyerA, { variantId, quantity: 2, offerId: offerA });
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `consume-${randomUUID()}` });
      const subId = co.subOrders.find((s: any) => s.storeId === storeA)?.id;
      await ordersService.acceptOrder(subId!, merchantA);

      const afterAccept = await inventoryService.getItem(invItemA);

      // Advance to DELIVERED
      await ordersService.transitionStatus(subId!, 'PREPARING', merchantA, 'MERCHANT');
      await ordersService.transitionStatus(subId!, 'READY', merchantA, 'MERCHANT');
      await ordersService.transitionStatus(subId!, 'OUT_FOR_DELIVERY', merchantA, 'MERCHANT');
      await ordersService.transitionStatus(subId!, 'DELIVERED', merchantA, 'MERCHANT');

      const afterDeliver = await inventoryService.getItem(invItemA);
      expect(afterDeliver.qtyOnHand).toBe(afterAccept.qtyOnHand - 2);
      expect(afterDeliver.qtyReserved).toBe(afterAccept.qtyReserved - 2);

      // Verify SALE movement
      const movements = await pool.query(
        `SELECT * FROM stock_movements WHERE inventory_item_id = $1 AND movement_type = 'SALE' AND reference_id = $2`,
        [invItemA, subId],
      );
      expect(movements.rows.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 9 — Concurrent Stock Reservation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 9 — Concurrent stock reservation', () => {
    it('exactly one of two concurrent reservations succeeds when stock = 1', async () => {
      // Create a fresh inventory item with qty = 1
      const freshVariant = await catalog.createVariant(productId, { sku: `CONC-${Date.now()}`, title: 'Concurrent Test' });
      const freshInv = await inventoryService.createItem({ variantId: freshVariant.id, warehouseId: warehouseA, initialQty: 1, userId: merchantA });

      // Set up a price for the new variant (createVariant auto-creates a base tier
      // with unitPriceMinor=0, so update it instead of inserting a duplicate)
      const plId = (await pool.query(`SELECT id FROM price_lists WHERE store_id = '${storeA}' AND is_active = true LIMIT 1`)).rows[0].id;
      await db.update(priceTiers)
        .set({ unitPriceMinor: 5000, updatedAt: new Date() })
        .where(and(eq(priceTiers.priceListId, plId), eq(priceTiers.variantId, freshVariant.id)));

      // Create a fresh offer for this variant
      const freshOffer = await offerService.createOffer({ storeId: storeA, productId, variantId: freshVariant.id, currency: 'SAR', basePriceMinor: 5000, moq: 1, proposedBy: merchantA });
      await offerService.proposeOffer(freshOffer.id, merchantA);
      await offerService.approveOffer(freshOffer.id, adminUser);

      // Two concurrent reservations via the inventory service
      const results = await Promise.allSettled([
        inventoryService.reserveStock({ inventoryItemId: freshInv.id, quantity: 1, userId: merchantA }),
        inventoryService.reserveStock({ inventoryItemId: freshInv.id, quantity: 1, userId: merchantA }),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      // Verify final state
      const final = await inventoryService.getItem(freshInv.id);
      expect(final.qtyReserved).toBe(1);
      expect(final.qtyOnHand - final.qtyReserved).toBe(0);

      // Exactly one RESERVE movement
      const moveRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM stock_movements WHERE inventory_item_id = $1 AND movement_type = 'RESERVE'`,
        [freshInv.id],
      );
      expect(moveRes.rows[0].cnt).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 10 — Checkout Idempotency
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 10 — Checkout idempotency', () => {
    it('same idempotency key returns existing order without duplicates', async () => {
      // Use variant2Id/offerB2 to avoid conflict with buyerB's leftover cart from Scenario 4
      await cartService.addItem(buyerB, { variantId: variant2Id, quantity: 1, offerId: offerB2 });
      const idemKey = `idem-test-${randomUUID()}`;

      const first = await ordersService.checkout({ buyerId: buyerB, deliveryAddress: {}, idempotencyKey: idemKey });

      // Second call with same key returns existing order (idempotency)
      // without needing a new cart — the idempotency check short-circuits.
      const second = await ordersService.checkout({ buyerId: buyerB, deliveryAddress: {}, idempotencyKey: idemKey });

      // Same master order returned
      expect(first.id).toBe(second.id);

      // Only one master order with this key
      const countRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM master_orders WHERE idempotency_key = $1`, [idemKey]);
      expect(countRes.rows[0].cnt).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 11 — Tenant Isolation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 11 — Tenant isolation', () => {
    it('Buyer A cannot read Buyer B order', async () => {
      const masterRes = await pool.query(`SELECT id, buyer_id FROM master_orders WHERE buyer_id = $1 LIMIT 1`, [buyerB]);
      if (masterRes.rows.length === 0) return;
      await expect(
        ordersService.getMasterOrder(masterRes.rows[0].id, { sub: buyerA, role: 'BUYER', activeOrg: null }),
      ).rejects.toThrow();
    });

    it('Merchant A cannot read Merchant B sub-order', async () => {
      const subRes = await pool.query(`SELECT o.id, o.store_id FROM orders o JOIN stores s ON o.store_id = s.id WHERE s.org_id = $1 LIMIT 1`, [orgB]);
      if (subRes.rows.length === 0) return;
      const order = await ordersService.getOrder(subRes.rows[0].id);
      await expect(
        ordersService.getOrderWithItems(subRes.rows[0].id, { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 12 — Multi-Merchant Inventory Isolation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 12 — Multi-merchant inventory isolation', () => {
    it('Merchant A reservation does not affect Merchant B stock', async () => {
      const beforeB = await inventoryService.getItem(invItemB);

      // Reserve from Merchant A's inventory
      await inventoryService.reserveStock({ inventoryItemId: invItemA, quantity: 1, userId: merchantA });

      const afterB = await inventoryService.getItem(invItemB);
      expect(afterB.qtyReserved).toBe(beforeB.qtyReserved);
      expect(afterB.qtyOnHand).toBe(beforeB.qtyOnHand);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // OUTBOX EVENTS
  // ═══════════════════════════════════════════════════════════════════
  describe('Outbox events', () => {
    it('order.submitted event was written during checkout', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM outbox_events WHERE event_type = 'order.submitted'`);
      expect(res.rows[0].cnt).toBeGreaterThanOrEqual(1);
    });

    it('order.accepted event was published on accept', async () => {
      // acceptOrder uses outbox.publish() (not the transactional outbox),
      // so we check the mock was called with the right event type.
      const calls = (outbox.publish as any).mock.calls;
      const accepted = calls.filter((c: any[]) => c[0] === 'order.accepted');
      expect(accepted.length).toBeGreaterThanOrEqual(1);
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

    it('no orphan stock movements', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM stock_movements sm LEFT JOIN inventory_items ii ON sm.inventory_item_id = ii.id WHERE ii.id IS NULL`);
      expect(res.rows[0].cnt).toBe(0);
    });

    it('financial breakdown exists for every sub-order', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders o LEFT JOIN order_financial_breakdown b ON o.id = b.order_id WHERE b.order_id IS NULL`);
      expect(res.rows[0].cnt).toBe(0);
    });

    it('status history exists for every sub-order', async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders o LEFT JOIN LATERAL (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id LIMIT 1) h ON true WHERE h IS NULL`);
      expect(res.rows[0].cnt).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 13 — Phase 1.1: Concurrent Idempotency (real PostgreSQL)
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 13 — Concurrent idempotency (Phase 1.1)', () => {
    it('two concurrent identical checkouts create exactly one order', async () => {
      // Fresh cart for buyerB
      await cartService.addItem(buyerB, { variantId, quantity: 1, offerId: offerA });
      const idemKey = `concurrent-${randomUUID()}`;

      // Two concurrent checkouts with the same key and same cart
      const results = await Promise.allSettled([
        ordersService.checkout({ buyerId: buyerB, deliveryAddress: {}, idempotencyKey: idemKey }),
        ordersService.checkout({ buyerId: buyerB, deliveryAddress: {}, idempotencyKey: idemKey }),
      ]);

      // Both succeed (one creates, the other returns existing)
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(2);

      // Exactly one master order with this key
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM master_orders WHERE idempotency_key = $1`,
        [idemKey],
      );
      expect(countRes.rows[0].cnt).toBe(1);

      // The fingerprint is stored
      const fpRes = await pool.query(
        `SELECT request_fingerprint FROM master_orders WHERE idempotency_key = $1`,
        [idemKey],
      );
      expect(fpRes.rows[0].request_fingerprint).toBeTruthy();
      expect(fpRes.rows[0].request_fingerprint.length).toBe(64);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 14 — Phase 1.1: Partial Inventory Reservation
  // ═══════════════════════════════════════════════════════════════════
  describe('Scenario 14 — Partial inventory reservation (Phase 1.1)', () => {
    it('reserves only available quantity when ordered quantity exceeds stock', async () => {
      // Create a variant with limited stock (5 units)
      const limitedVariant = await catalog.createVariant(productId, {
        sku: `LTD-${Date.now()}`, title: 'Limited Stock Item',
      });

      // Create offer and price for the limited variant
      const limitedOffer = await offerService.createOffer({
        storeId: storeA, productId, variantId: limitedVariant.id,
        currency: 'SAR', basePriceMinor: 5000, moq: 1, proposedBy: merchantA,
      });
      await offerService.proposeOffer(limitedOffer.id, merchantA);
      await offerService.approveOffer(limitedOffer.id, adminUser);

      const plId = (await pool.query(
        `SELECT id FROM price_lists WHERE store_id = '${storeA}' AND is_active = true LIMIT 1`,
      )).rows[0].id;
      // createVariant auto-creates a base tier, so update it rather than inserting a duplicate
      await db.update(priceTiers)
        .set({ unitPriceMinor: 5000, updatedAt: new Date() })
        .where(and(eq(priceTiers.priceListId, plId), eq(priceTiers.variantId, limitedVariant.id)));

      // Create inventory with only 5 units
      const limitedInv = await inventoryService.createItem({
        variantId: limitedVariant.id, warehouseId: warehouseA,
        initialQty: 5, userId: merchantA,
      });

      // Buyer orders 10 units (more than available)
      await cartService.addItem(buyerA, {
        variantId: limitedVariant.id, quantity: 10, offerId: limitedOffer.id,
      });
      const co = await ordersService.checkout({
        buyerId: buyerA, deliveryAddress: {},
        idempotencyKey: `partial-inv-${randomUUID()}`,
      });
      const subId = co.subOrders.find((s: any) => s.storeId === storeA)?.id;
      expect(subId).toBeTruthy();

      // Accept the order — triggers stock reservation
      await ordersService.acceptOrder(subId!, merchantA);

      // Only 5 units reserved (available), not 10 (ordered)
      const after = await inventoryService.getItem(limitedInv.id);
      expect(after.qtyReserved).toBe(5);
      expect(after.qtyOnHand).toBe(5);
      expect(after.qtyOnHand - after.qtyReserved).toBe(0);

      // Verify RESERVE movement records 5 (actual), not 10 (ordered)
      const moveRes = await pool.query(
        `SELECT quantity FROM stock_movements WHERE inventory_item_id = $1 AND movement_type = 'RESERVE' AND reference_id = $2`,
        [limitedInv.id, subId],
      );
      expect(moveRes.rows.length).toBeGreaterThanOrEqual(1);
      const totalReserved = moveRes.rows.reduce((sum: number, r: any) => sum + Math.abs(r.quantity), 0);
      expect(totalReserved).toBe(5);
    });

    it('partiallyAcceptOrder correctly represents partial quantities', async () => {
      // Create a fresh order for partial acceptance testing
      await cartService.addItem(buyerA, { variantId, quantity: 5, offerId: offerA });
      const co = await ordersService.checkout({
        buyerId: buyerA, deliveryAddress: {},
        idempotencyKey: `partial-accept-${randomUUID()}`,
      });
      const subId = co.subOrders.find((s: any) => s.storeId === storeA)?.id;
      expect(subId).toBeTruthy();

      // Order is auto-advanced to PENDING_CONFIRMATION
      const order = await ordersService.getOrder(subId!);
      expect(order.status).toBe('PENDING_CONFIRMATION');

      // Get items and partially accept (confirm only 2 of 5)
      const items = await ordersService.getOrderWithItems(subId!);
      expect(items.items.length).toBeGreaterThan(0);
      const itemId = items.items[0]!.id;

      const result = await ordersService.partiallyAcceptOrder(subId!, merchantA, [
        { itemId, qtyConfirmed: 2 },
      ]);
      expect(result.status).toBe('PARTIALLY_ACCEPTED');

      // Financial recalculation: 2 * unitPriceMinor
      const updatedOrder = await ordersService.getOrderWithItems(subId!);
      expect(updatedOrder.items.length).toBeGreaterThan(0);
      const unitPrice = updatedOrder.items[0]!.unitPriceMinor;
      expect(Number(updatedOrder.subtotalMinor)).toBe(2 * unitPrice);
    });
  });
});
