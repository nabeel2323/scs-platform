/**
 * M7.1 — Security & Concurrency Tests
 *
 * SEC-M71-01  Merchant A cannot modify Merchant B shipment
 * SEC-M71-02  Merchant cannot pickup shipment
 * SEC-M71-03  Merchant cannot deliver unless explicitly authorized
 * SEC-M71-04  Driver cannot access unassigned shipment
 * SEC-M71-05  Driver cannot pickup another driver's shipment
 * SEC-M71-06  Driver cannot deliver another driver's shipment
 * SEC-M71-07  Buyer cannot modify shipment
 * SEC-M71-08  Buyer can only view own order tracking
 * SEC-M71-09  Cross-organization shipment access blocked
 * SEC-M71-10  Direct shipment ID manipulation blocked
 *
 * Concurrency:
 * CON-M71-01  Double prepare — one succeeds, one fails
 * CON-M71-02  Double ready — one succeeds, one fails
 * CON-M71-03  Double pickup — one succeeds, one fails
 * CON-M71-04  Double deliver — one succeeds, one fails
 * CON-M71-05  Concurrent driver assignment — one succeeds, one fails
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

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn() } as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

describe('M7.1 — Security & Concurrency', () => {
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
  const driverB = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const warehouseA = randomUUID();
  const variantA = randomUUID();
  const offerA = randomUUID();

  let roleById: Map<string, string>;

  // Helper: create a full order pipeline (cart → checkout → accept)
  // The merchant who owns the store accepts the order.
  async function createAcceptedOrder(
    buyerId: string, mId: string, sId: string, vId: string, oId: string, acceptOrgId?: string,
  ) {
    const cartId = randomUUID();
    await pool.query(`INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`, [cartId, buyerId]);
    await pool.query(`INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id) VALUES ($1, $2, $3, $4, 2, 1000, 2000, $5)`, [randomUUID(), cartId, sId, vId, oId]);
    const co = await ordersService.checkout({ buyerId, deliveryAddress: {}, idempotencyKey: `sec-${randomUUID()}` });
    const orderId = co.subOrders[0]!.id;
    // The owning merchant accepts (caller's activeOrg must match the store's org)
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
    const inventoryService = new InventoryService(database, outbox);
    ordersService = new OrdersService(database, outbox, promotions, realtime, undefined, notifications);

    // Roles
    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    // Users
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+11000000001')`, [merchantA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant B', '+11000000002')`, [merchantB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+11000000003')`, [buyerA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer B', '+11000000004')`, [buyerB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Driver A', '+11000000005')`, [driverA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Driver B', '+11000000006')`, [driverB]);

    // Orgs
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`, [orgA]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org B', 'SA')`, [orgB]);

    // Org memberships
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgB, merchantB, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, buyerA, roleById.get('BUYER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, driverA, roleById.get('DRIVER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, driverB, roleById.get('DRIVER')]);

    // Store + Warehouse
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a', 'Store A', 'APPROVED')`, [storeA, orgA]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-b', 'Store B', 'APPROVED')`, [storeB, orgB]);
    await pool.query(`INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, 'WH A')`, [warehouseA, storeA]);

    // Product + Variant + Offer
    const productId = randomUUID();
    await pool.query(`INSERT INTO products (id, store_id, slug, title, status) VALUES ($1, $2, 'sec-product', 'Sec Product', 'ACTIVE')`, [productId, storeA]);
    await pool.query(`INSERT INTO product_variants (id, product_id, sku) VALUES ($1, $2, 'SEC-SKU')`, [variantA, productId]);
    await pool.query(`INSERT INTO merchant_offers (id, store_id, product_id, variant_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [offerA, storeA, productId, variantA]);
    await pool.query(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved) VALUES ($1, $2, $3, 100, 0)`, [randomUUID(), variantA, warehouseA]);
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  //  SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('Security', () => {
    it('SEC-M71-01: Merchant A cannot modify Merchant B shipment', async () => {
      // Create an order accepted by Merchant A at store A
      const orderAId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Merchant B (different org) tries to prepare the order
      const callerB = { sub: merchantB, role: 'MERCHANT_OWNER', activeOrg: orgB };
      await expect(ordersService.prepareOrder(orderAId, merchantB, callerB)).rejects.toThrow();
    });

    it('SEC-M71-02: Merchant cannot pickup shipment', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      await ordersService.assignDriver(orderId, driverA, merchantA, caller);
      // Merchant tries to pickup (driver-only action)
      await expect(ordersService.pickupOrder(orderId, merchantA, caller)).rejects.toThrow();
    });

    it('SEC-M71-03: Merchant cannot deliver unless explicitly authorized', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      await ordersService.assignDriver(orderId, driverA, merchantA, caller);
      // Merchant tries to deliver (driver-only action)
      await expect(ordersService.deliverOrder(orderId, merchantA, caller)).rejects.toThrow();
    });

    it('SEC-M71-04: Driver cannot access unassigned shipment', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      // Driver B is NOT assigned — tries to pickup
      const driverCaller = { sub: driverB, role: 'DRIVER', activeOrg: orgA };
      await expect(ordersService.pickupOrder(orderId, driverB, driverCaller)).rejects.toThrow();
    });

    it('SEC-M71-05: Driver cannot pickup another driver\'s shipment', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      await ordersService.assignDriver(orderId, driverA, merchantA, caller);
      // Driver B tries to pickup Driver A's assigned shipment
      const driverBCaller = { sub: driverB, role: 'DRIVER', activeOrg: orgA };
      await expect(ordersService.pickupOrder(orderId, driverB, driverBCaller)).rejects.toThrow(/not assigned/);
    });

    it('SEC-M71-06: Driver cannot deliver another driver\'s shipment', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      await ordersService.assignDriver(orderId, driverA, merchantA, caller);
      const driverACaller = { sub: driverA, role: 'DRIVER', activeOrg: orgA };
      await ordersService.pickupOrder(orderId, driverA, driverACaller);
      await ordersService.outForDeliveryOrder(orderId, driverA, driverACaller);
      // Driver B tries to deliver Driver A's shipment
      const driverBCaller = { sub: driverB, role: 'DRIVER', activeOrg: orgA };
      await expect(ordersService.deliverOrder(orderId, driverB, driverBCaller)).rejects.toThrow();
    });

    it('SEC-M71-07: Buyer cannot modify shipment', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const buyerCaller = { sub: buyerA, role: 'BUYER', activeOrg: orgA };
      await expect(ordersService.prepareOrder(orderId, buyerA, buyerCaller)).rejects.toThrow();
    });

    it('SEC-M71-08: Buyer can only view own order tracking', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const masterOrderId = (await pool.query(`SELECT master_order_id FROM orders WHERE id = $1`, [orderId])).rows[0].master_order_id;
      // Buyer A can view
      const tracking = await ordersService.getTracking(masterOrderId, buyerA);
      expect(tracking.masterOrderId).toBe(masterOrderId);
      // Buyer B cannot view Buyer A's tracking
      await expect(ordersService.getTracking(masterOrderId, buyerB)).rejects.toThrow();
    });

    it('SEC-M71-09: Cross-organization shipment access blocked', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Merchant B (different org) tries to prepare
      const callerB = { sub: merchantB, role: 'MERCHANT_OWNER', activeOrg: orgB };
      await expect(ordersService.prepareOrder(orderId, merchantB, callerB)).rejects.toThrow();
    });

    it('SEC-M71-10: Direct shipment ID manipulation blocked', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      // Try to access a non-existent shipment via a random order ID
      const fakeOrderId = randomUUID();
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await expect(ordersService.prepareOrder(fakeOrderId, merchantA, caller)).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  CONCURRENCY TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe('Concurrency', () => {
    it('CON-M71-01: Double prepare — one succeeds, one fails', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      const results = await Promise.allSettled([
        ordersService.prepareOrder(orderId, merchantA, caller),
        ordersService.prepareOrder(orderId, merchantA, caller),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it('CON-M71-02: Double ready — one succeeds, one fails', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      const results = await Promise.allSettled([
        ordersService.readyOrder(orderId, merchantA, caller),
        ordersService.readyOrder(orderId, merchantA, caller),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it('CON-M71-03: Double pickup — one succeeds, one fails', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      await ordersService.assignDriver(orderId, driverA, merchantA, caller);
      const driverCaller = { sub: driverA, role: 'DRIVER', activeOrg: orgA };
      const results = await Promise.allSettled([
        ordersService.pickupOrder(orderId, driverA, driverCaller),
        ordersService.pickupOrder(orderId, driverA, driverCaller),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it('CON-M71-04: Double deliver — one succeeds, one fails', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      await ordersService.assignDriver(orderId, driverA, merchantA, caller);
      const driverCaller = { sub: driverA, role: 'DRIVER', activeOrg: orgA };
      await ordersService.pickupOrder(orderId, driverA, driverCaller);
      await ordersService.outForDeliveryOrder(orderId, driverA, driverCaller);
      const results = await Promise.allSettled([
        ordersService.deliverOrder(orderId, driverA, driverCaller),
        ordersService.deliverOrder(orderId, driverA, driverCaller),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it('CON-M71-05: Concurrent driver assignment — one succeeds, one fails', async () => {
      const orderId = await createAcceptedOrder(buyerA, merchantA, storeA, variantA, offerA);
      const caller = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      await ordersService.prepareOrder(orderId, merchantA, caller);
      await ordersService.readyOrder(orderId, merchantA, caller);
      const results = await Promise.allSettled([
        ordersService.assignDriver(orderId, driverA, merchantA, caller),
        ordersService.assignDriver(orderId, driverB, merchantA, caller),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });
}, 300_000);
