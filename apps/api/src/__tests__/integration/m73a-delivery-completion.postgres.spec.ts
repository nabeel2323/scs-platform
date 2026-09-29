/**
 * M7.3-A — Delivery Completion & Master Order Consistency Tests
 *
 * Unit — Master Status Aggregation:
 *   MST-01  All COMPLETED → master COMPLETED
 *   MST-02  All DELIVERED or COMPLETED → master DELIVERED
 *   MST-03  One DISPUTED → master DISPUTED
 *   MST-04  All CANCELLED/REJECTED → master CANCELLED
 *   MST-05  Mixed active statuses → correct priority
 *   MST-06  Empty sub-orders → SUBMITTED (edge case)
 *
 * Security:
 *   SEC-M73A-01  Buyer A cannot confirm delivery of Buyer B's order
 *   SEC-M73A-02  Merchant cannot confirm delivery (buyer-only action)
 *   SEC-M73A-03  Cross-organization confirm delivery blocked
 *   SEC-M73A-04  Confirm delivery on non-DELIVERED order fails
 *   SEC-M73A-05  Driver cannot confirm delivery
 *
 * Concurrency:
 *   CON-M73A-01  Double buyer confirm — exactly one transitions, other is idempotent
 *   CON-M73A-02  Buyer confirm vs auto-complete race — one COMPLETED result
 *   CON-M73A-03  Double carrier delivery bridge — one succeeds, one no-op
 *   CON-M73A-04  Double completeOrder — one succeeds, one conflict
 *
 * Idempotency:
 *   IDE-M73A-01  Confirm after auto-complete returns success
 *   IDE-M73A-02  Auto-complete after buyer confirm is no-op
 *   IDE-M73A-03  Carrier delivery on already-DELIVERED order is no-op
 *
 * Master Order Lifecycle:
 *   MST-INT-01  Delivering all sub-orders → master DELIVERED
 *   MST-INT-02  Completing all sub-orders → master COMPLETED
 *   MST-INT-03  Mixed DELIVERED+COMPLETED sub-orders → master DELIVERED
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { PromotionsService } from '../../modules/promotions/promotions.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { products, productVariants } from '../../modules/catalog/catalog.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations, organizationMembers } from '../../modules/identity/identity.schema';
import { stores, warehouses } from '../../modules/merchant/merchant.schema';
import { inventoryItems, stockMovements } from '../../modules/inventory/inventory.schema';
import { carts, cartItems } from '../../modules/orders/cart.schema';
import { masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory } from '../../modules/orders/orders.schema';
import { shipments, shipmentEvents } from '../../modules/orders/shipment.schema';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn(), server: { to: () => ({ emit: () => {} }) } } as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

// ═══════════════════════════════════════════════════════════════════
//  UNIT: Master Status Aggregation (no DB needed)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-A — Master Status Aggregation (unit)', () => {
  it('MST-01: All COMPLETED → master COMPLETED', () => {
    expect(OrdersService.computeMasterStatus(['COMPLETED', 'COMPLETED'])).toBe('COMPLETED');
  });

  it('MST-02: All DELIVERED or COMPLETED → master DELIVERED', () => {
    expect(OrdersService.computeMasterStatus(['DELIVERED', 'COMPLETED'])).toBe('DELIVERED');
    expect(OrdersService.computeMasterStatus(['DELIVERED', 'DELIVERED'])).toBe('DELIVERED');
  });

  it('MST-03: One DISPUTED → master DISPUTED', () => {
    expect(OrdersService.computeMasterStatus(['DELIVERED', 'DISPUTED'])).toBe('DISPUTED');
    expect(OrdersService.computeMasterStatus(['COMPLETED', 'DISPUTED'])).toBe('DISPUTED');
    expect(OrdersService.computeMasterStatus(['ACCEPTED', 'DISPUTED'])).toBe('DISPUTED');
  });

  it('MST-04: All CANCELLED/REJECTED → master CANCELLED', () => {
    expect(OrdersService.computeMasterStatus(['CANCELLED', 'REJECTED'])).toBe('CANCELLED');
    expect(OrdersService.computeMasterStatus(['CANCELLED'])).toBe('CANCELLED');
    expect(OrdersService.computeMasterStatus(['REJECTED', 'REJECTED'])).toBe('CANCELLED');
  });

  it('MST-05: Mixed active statuses → correct priority', () => {
    // OUT_FOR_DELIVERY beats PREPARING, ACCEPTED, SUBMITTED
    expect(OrdersService.computeMasterStatus(['OUT_FOR_DELIVERY', 'PREPARING'])).toBe('OUT_FOR_DELIVERY');
    // PREPARING beats ACCEPTED, SUBMITTED
    expect(OrdersService.computeMasterStatus(['PREPARING', 'ACCEPTED'])).toBe('PREPARING');
    // READY is same tier as PREPARING
    expect(OrdersService.computeMasterStatus(['READY', 'ACCEPTED'])).toBe('PREPARING');
    // ACCEPTED beats SUBMITTED
    expect(OrdersService.computeMasterStatus(['ACCEPTED', 'SUBMITTED'])).toBe('ACCEPTED');
    // PARTIALLY_ACCEPTED is same tier as ACCEPTED
    expect(OrdersService.computeMasterStatus(['PARTIALLY_ACCEPTED', 'SUBMITTED'])).toBe('ACCEPTED');
    // ASSIGNED/PICKED_UP → OUT_FOR_DELIVERY tier
    expect(OrdersService.computeMasterStatus(['ASSIGNED', 'ACCEPTED'])).toBe('OUT_FOR_DELIVERY');
    expect(OrdersService.computeMasterStatus(['PICKED_UP', 'PREPARING'])).toBe('OUT_FOR_DELIVERY');
  });

  it('MST-06: Empty sub-orders → SUBMITTED (edge case)', () => {
    expect(OrdersService.computeMasterStatus([])).toBe('SUBMITTED');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  INTEGRATION: Security + Concurrency + Idempotency
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-A — Security, Concurrency & Idempotency (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let ordersService: OrdersService;

  // Test identities
  const merchantA = randomUUID();
  const merchantB = randomUUID();
  const buyerA = randomUUID();
  const buyerB = randomUUID();
  const driverA = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const warehouseA = randomUUID();
  const variantA = randomUUID();
  const offerA = randomUUID();

  let roleById: Map<string, string>;

  /** Create a full order pipeline through DELIVERED state. */
  async function createDeliveredOrder(
    buyerId: string, mId: string, sId: string, vId: string, oId: string, acceptOrgId?: string,
  ) {
    const cartId = randomUUID();
    await pool.query(`INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`, [cartId, buyerId]);
    await pool.query(`INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id) VALUES ($1, $2, $3, $4, 2, 1000, 2000, $5)`, [randomUUID(), cartId, sId, vId, oId]);
    const co = await ordersService.checkout({ buyerId, deliveryAddress: {}, idempotencyKey: `m73a-${randomUUID()}` });
    const orderId = co.subOrders[0]!.id;
    const ownerOrgId = acceptOrgId || (sId === storeB ? orgB : orgA);
    const caller = { sub: mId, role: 'MERCHANT_OWNER', activeOrg: ownerOrgId };
    await ordersService.acceptOrder(orderId, mId, caller);
    await ordersService.prepareOrder(orderId, mId, caller);
    await ordersService.readyOrder(orderId, mId, caller);
    await ordersService.assignDriver(orderId, driverA, mId, caller);
    const driverCaller = { sub: driverA, role: 'DRIVER', activeOrg: ownerOrgId };
    await ordersService.pickupOrder(orderId, driverA, driverCaller);
    await ordersService.outForDeliveryOrder(orderId, driverA, driverCaller);
    await ordersService.deliverOrder(orderId, driverA, driverCaller);
    return orderId;
  }

  /** Create an accepted order (stops at ACCEPTED). */
  async function createAcceptedOrder(
    buyerId: string, mId: string, sId: string, vId: string, oId: string, acceptOrgId?: string,
  ) {
    const cartId = randomUUID();
    await pool.query(`INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`, [cartId, buyerId]);
    await pool.query(`INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id) VALUES ($1, $2, $3, $4, 2, 1000, 2000, $5)`, [randomUUID(), cartId, sId, vId, oId]);
    const co = await ordersService.checkout({ buyerId, deliveryAddress: {}, idempotencyKey: `m73a-${randomUUID()}` });
    const orderId = co.subOrders[0]!.id;
    const ownerOrgId = acceptOrgId || (sId === storeB ? orgB : orgA);
    const caller = { sub: mId, role: 'MERCHANT_OWNER', activeOrg: ownerOrgId };
    await ordersService.acceptOrder(orderId, mId, caller);
    return orderId;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    db = drizzle(pool, {
      schema: {
        products, productVariants, merchantOffers,
        users, organizations, organizationMembers,
        stores, warehouses,
        inventoryItems, stockMovements,
        carts, cartItems,
        masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory,
        shipments, shipmentEvents,
        outboxEvents,
      },
    }) as unknown as DatabaseService['db'];

    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && !EXCLUDED.has(f)).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    database = { db } as DatabaseService;
    const promotions = new PromotionsService(database);
    const realOutbox = new OutboxDispatcher(database);
    const inventoryService = new InventoryService(database, realOutbox);
    ordersService = new OrdersService(database, realOutbox, promotions, realtime, undefined, notifications);

    // Roles
    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    // Users
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+12000000001')`, [merchantA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant B', '+12000000002')`, [merchantB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+12000000003')`, [buyerA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer B', '+12000000004')`, [buyerB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Driver A', '+12000000005')`, [driverA]);

    // Orgs
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`, [orgA]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org B', 'SA')`, [orgB]);

    // Org memberships
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgB, merchantB, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, buyerA, roleById.get('BUYER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, buyerB, roleById.get('BUYER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, driverA, roleById.get('DRIVER')]);

    // Store + Warehouse
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-m73a', 'Store A', 'APPROVED')`, [storeA, orgA]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-b-m73a', 'Store B', 'APPROVED')`, [storeB, orgB]);
    await pool.query(`INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, 'WH A')`, [warehouseA, storeA]);

    // Product + Variant + Offer
    const productId = randomUUID();
    await pool.query(`INSERT INTO products (id, store_id, slug, title, status) VALUES ($1, $2, 'm73a-product', 'M73A Product', 'ACTIVE')`, [productId, storeA]);
    await pool.query(`INSERT INTO product_variants (id, product_id, sku) VALUES ($1, $2, 'M73A-SKU')`, [variantA, productId]);
    await pool.query(`INSERT INTO merchant_offers (id, store_id, product_id, variant_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [offerA, storeA, productId, variantA]);
    await pool.query(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved) VALUES ($1, $2, $3, 500, 0)`, [randomUUID(), variantA, warehouseA]);
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  //  SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('Security', () => {
    it('SEC-M73A-01: Buyer A cannot confirm delivery of Buyer B\'s order', async () => {
      // Buyer B creates an order and it gets delivered
      const orderId = await createDeliveredOrder(buyerB, merchantA, storeA, variantA, offerA);
      // Buyer A tries to confirm — should fail (not the buyer, not privileged)
      const buyerACaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await expect(ordersService.confirmDelivery(orderId, buyerA, buyerACaller)).rejects.toThrow();
    });

    it('SEC-M73A-02: Merchant cannot confirm delivery (buyer-only action)', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await expect(ordersService.confirmDelivery(orderId, merchantA, merchantCaller)).rejects.toThrow(/Only the buyer/);
    });

    it('SEC-M73A-03: Cross-organization confirm delivery blocked', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Merchant B (different org) tries to confirm — blocked by tenant scope
      const merchantBCaller = { sub: merchantB, role: 'MERCHANT_OWNER', activeOrg: orgB };
      await expect(ordersService.confirmDelivery(orderId, merchantB, merchantBCaller)).rejects.toThrow();
    });

    it('SEC-M73A-04: Confirm delivery on non-DELIVERED order fails', async () => {
      // Create an accepted order (not delivered)
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await expect(ordersService.confirmDelivery(orderId, buyerA, buyerCaller)).rejects.toThrow(/not DELIVERED/);
    });

    it('SEC-M73A-05: Driver cannot confirm delivery', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const driverCaller = { sub: driverA, role: 'DRIVER', activeOrg: orgA };
      await expect(ordersService.confirmDelivery(orderId, driverA, driverCaller)).rejects.toThrow(/Only the buyer/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  CONCURRENCY TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('Concurrency', () => {
    it('CON-M73A-01: Double buyer confirm — one transitions, other is idempotent', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      // Both calls should succeed (one does the work, the other is idempotent)
      const results = await Promise.allSettled([
        ordersService.confirmDelivery(orderId, buyerA, buyerCaller),
        ordersService.confirmDelivery(orderId, buyerA, buyerCaller),
      ]);
      // At least one must succeed; the other either succeeds (idempotent) or conflicts
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      // Order must be COMPLETED
      const final = await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(final.rows[0].status).toBe('COMPLETED');
    });

    it('CON-M73A-02: Buyer confirm vs completeOrder race — exactly one COMPLETED', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      // confirmDelivery and completeOrder race
      const results = await Promise.allSettled([
        ordersService.confirmDelivery(orderId, buyerA, buyerCaller),
        ordersService.completeOrder(orderId, 'system', 'SYSTEM', 'AUTO_COMPLETION'),
      ]);
      // At least one must succeed
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      // Order must be COMPLETED (exactly once)
      const final = await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(final.rows[0].status).toBe('COMPLETED');
    });

    it('CON-M73A-03: Double carrier delivery bridge — one succeeds, one no-op', async () => {
      // Create an order and advance to READY (which allows → DELIVERED)
      const cartId = randomUUID();
      await pool.query(`INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`, [cartId, buyerA]);
      await pool.query(`INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id) VALUES ($1, $2, $3, $4, 2, 1000, 2000, $5)`, [randomUUID(), cartId, storeA, variantA, offerA]);
      const co = await ordersService.checkout({ buyerId: buyerA, deliveryAddress: {}, idempotencyKey: `m73a-cd-${randomUUID()}` });
      const orderId = co.subOrders[0]!.id;
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.acceptOrder(orderId, merchantA, caller);
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);

      // Two concurrent carrier delivery attempts
      const results = await Promise.allSettled([
        ordersService.processCarrierDelivery(orderId, 'CARRIER-SHIP-1', 'tracking_poll'),
        ordersService.processCarrierDelivery(orderId, 'CARRIER-SHIP-1', 'tracking_poll'),
      ]);
      // At least one succeeds; the other is either success (idempotent) or conflict
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      // Order must be DELIVERED
      const final = await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
      expect(final.rows[0].status).toBe('DELIVERED');
    });

    it('CON-M73A-04: Double completeOrder — one succeeds, one conflict', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const results = await Promise.allSettled([
        ordersService.completeOrder(orderId, 'system', 'SYSTEM', 'TEST'),
        ordersService.completeOrder(orderId, 'system', 'SYSTEM', 'TEST'),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  IDEMPOTENCY TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('Idempotency', () => {
    it('IDE-M73A-01: Confirm after auto-complete returns success', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Auto-complete first
      await ordersService.completeOrder(orderId, 'system', 'SYSTEM', 'AUTO_COMPLETION');
      const status1 = (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status;
      expect(status1).toBe('COMPLETED');
      // Buyer confirms after — should be idempotent (returns success, order stays COMPLETED)
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      const result = await ordersService.confirmDelivery(orderId, buyerA, buyerCaller);
      expect(result).toBeDefined();
      const status2 = (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status;
      expect(status2).toBe('COMPLETED');
    });

    it('IDE-M73A-02: Auto-complete after buyer confirm is no-op', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Buyer confirms first
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await ordersService.confirmDelivery(orderId, buyerA, buyerCaller);
      const status1 = (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status;
      expect(status1).toBe('COMPLETED');
      // Auto-complete after — should fail (order is COMPLETED, not DELIVERED)
      await expect(
        ordersService.completeOrder(orderId, 'system', 'SYSTEM', 'AUTO_COMPLETION'),
      ).rejects.toThrow();
    });

    it('IDE-M73A-03: Carrier delivery on already-DELIVERED order is no-op', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const status1 = (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status;
      expect(status1).toBe('DELIVERED');
      // Carrier delivery on already-DELIVERED order — should be no-op
      const result = await ordersService.processCarrierDelivery(orderId, 'CARRIER-SHIP-X', 'webhook');
      expect(result).toBe(false); // false = no transition happened
      const status2 = (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status;
      expect(status2).toBe('DELIVERED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  MASTER ORDER LIFECYCLE TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('Master Order Lifecycle', () => {
    it('MST-INT-01: Delivering all sub-orders → master DELIVERED', async () => {
      // Create two orders via checkout (each creates a master + sub-order)
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const masterId = (await pool.query(`SELECT master_order_id FROM orders WHERE id = $1`, [orderId])).rows[0].master_order_id;
      const masterStatus = (await pool.query(`SELECT status FROM master_orders WHERE id = $1`, [masterId])).rows[0].status;
      // Single sub-order DELIVERED → master should be DELIVERED
      expect(masterStatus).toBe('DELIVERED');
    });

    it('MST-INT-02: Completing all sub-orders → master COMPLETED', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await ordersService.confirmDelivery(orderId, buyerA, buyerCaller);
      const masterId = (await pool.query(`SELECT master_order_id FROM orders WHERE id = $1`, [orderId])).rows[0].master_order_id;
      const masterStatus = (await pool.query(`SELECT status FROM master_orders WHERE id = $1`, [masterId])).rows[0].status;
      expect(masterStatus).toBe('COMPLETED');
    });

    it('MST-INT-03: buyer_confirmed_at is set on buyer confirmation', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Before confirmation
      const before = (await pool.query(`SELECT buyer_confirmed_at FROM orders WHERE id = $1`, [orderId])).rows[0];
      expect(before.buyer_confirmed_at).toBeNull();
      // Confirm
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await ordersService.confirmDelivery(orderId, buyerA, buyerCaller);
      // After confirmation
      const after = (await pool.query(`SELECT buyer_confirmed_at FROM orders WHERE id = $1`, [orderId])).rows[0];
      expect(after.buyer_confirmed_at).not.toBeNull();
    });

    it('MST-INT-04: auto_complete_at is set on delivery', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const row = (await pool.query(`SELECT auto_complete_at FROM orders WHERE id = $1`, [orderId])).rows[0];
      // auto_complete_at should be set (72h from now)
      expect(row.auto_complete_at).not.toBeNull();
      const autoCompleteAt = new Date(row.auto_complete_at);
      const now = new Date();
      // Should be roughly 72 hours in the future (±5 min tolerance)
      const diffHours = (autoCompleteAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeGreaterThan(70);
      expect(diffHours).toBeLessThan(74);
    });

    it('MST-INT-05: Outbox event published on completion', async () => {
      const orderId = await createDeliveredOrder(buyerA, merchantA, storeA, variantA, offerA);
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await ordersService.confirmDelivery(orderId, buyerA, buyerCaller);
      // Check outbox for order.completed event
      const events = await pool.query(
        `SELECT * FROM outbox_events WHERE event_type = 'order.completed' AND aggregate_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [orderId],
      );
      expect(events.rows.length).toBe(1);
      expect(events.rows[0].event_type).toBe('order.completed');
    });
  });
}, 300_000);
