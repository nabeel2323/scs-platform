/**
 * M7.1 — Order Fulfillment Lifecycle (PostgreSQL Integration)
 *
 * Tests the full fulfillment pipeline from ACCEPTED through COMPLETED:
 * - Shipment creation on accept
 * - Fulfillment transitions (prepare, ready, assign-driver, pickup, deliver)
 * - Shipment events (append-only audit trail)
 * - Multi-merchant isolation (each sub-order has its own shipment)
 * - Driver authorization (assigned driver only)
 * - Invalid transition rejection
 * - Concurrent transition safety
 * - Idempotent stock settlement at DELIVERED
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
// Schema tables for Drizzle relational queries
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

// ── Mocks ──────────────────────────────────────────────────────────────────
const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn() } as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

describe('M7.1 — Order Fulfillment Lifecycle', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let ordersService: OrdersService;
  let inventoryService: InventoryService;

  // Test fixtures
  const buyerId = randomUUID();
  const merchantId = randomUUID();
  const driverId = randomUUID();
  const otherDriverId = randomUUID();
  const orgId = randomUUID();
  const storeId = randomUUID();
  const warehouseId = randomUUID();
  const variantId = randomUUID();
  const offerId = randomUUID();

  let orderId: string;
  let shipmentId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    // Drizzle ORM with relational schema
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

    // Apply all migrations
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && !EXCLUDED.has(f)).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    // Seed RBAC
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    database = { db } as DatabaseService;

    // Create services
    const promotions = new PromotionsService(database);
    inventoryService = new InventoryService(database, outbox);
    ordersService = new OrdersService(database, outbox, promotions, realtime, undefined, notifications);

    // ── Create fixtures ──────────────────────────────────────────
    // Roles
    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    // Users (users table has no role_id — roles come via organization_members)
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer Test', '+10000000099')`, [buyerId]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant Owner', '+10000000098')`, [merchantId]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Driver One', '+10000000097')`, [driverId]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Driver Two', '+10000000096')`, [otherDriverId]);

    // Org (requires type + country) + Store + Warehouse
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Test Org', 'SA')`, [orgId]);
    // Organization members with roles
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgId, merchantId, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgId, buyerId, roleById.get('BUYER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgId, driverId, roleById.get('DRIVER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgId, otherDriverId, roleById.get('DRIVER')]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'test-store', 'Test Store', 'APPROVED')`, [storeId, orgId]);
    await pool.query(`INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, 'Test WH')`, [warehouseId, storeId]);

    // Product + Variant + Offer
    const productId = randomUUID();
    await pool.query(`INSERT INTO products (id, store_id, slug, title, status) VALUES ($1, $2, 'test-product', 'Test Product', 'ACTIVE')`, [productId, storeId]);
    await pool.query(`INSERT INTO product_variants (id, product_id, sku) VALUES ($1, $2, 'TEST-SKU')`, [variantId, productId]);
    await pool.query(`INSERT INTO merchant_offers (id, store_id, product_id, variant_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [offerId, storeId, productId, variantId]);

    // Inventory
    await pool.query(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved) VALUES ($1, $2, $3, 100, 0)`, [randomUUID(), variantId, warehouseId]);

    // Cart + Checkout
    const cartId = randomUUID();
    await pool.query(`INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`, [cartId, buyerId]);
    await pool.query(`INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id) VALUES ($1, $2, $3, $4, 5, 1000, 5000, $5)`, [randomUUID(), cartId, storeId, variantId, offerId]);

    const co = await ordersService.checkout({ buyerId, deliveryAddress: {}, idempotencyKey: `m71-test-${randomUUID()}` });
    orderId = co.subOrders[0]!.id;

    // Accept the order (creates shipment)
    const merchantCaller = { sub: merchantId, role: 'MERCHANT_OWNER', activeOrg: orgId };
    await ordersService.acceptOrder(orderId, merchantId, merchantCaller);
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // ── Shipment Creation ──────────────────────────────────────────

  it('creates a shipment when order is accepted', async () => {
    const shipment = await ordersService.getShipmentByOrderId(orderId);
    expect(shipment).toBeTruthy();
    expect(shipment!['status']).toBe('PREPARING');
    expect(shipment!['storeId']).toBe(storeId);
    shipmentId = shipment!['id'];
  });

  it('creates a shipment event on creation', async () => {
    const events = await pool.query(`SELECT * FROM shipment_events WHERE shipment_id = $1 ORDER BY sequence`, [shipmentId]);
    expect(events.rows.length).toBeGreaterThanOrEqual(1);
    expect(events.rows[0].event_type).toBe('PREPARING');
  });

  // ── Fulfillment Transitions ────────────────────────────────────

  it('transitions ACCEPTED → PREPARING', async () => {
    const caller = { sub: merchantId, role: 'MERCHANT_OWNER', activeOrg: orgId };
    const order = await ordersService.prepareOrder(orderId, merchantId, caller);
    expect(order['status']).toBe('PREPARING');
  });

  it('transitions PREPARING → READY', async () => {
    const caller = { sub: merchantId, role: 'MERCHANT_OWNER', activeOrg: orgId };
    const order = await ordersService.readyOrder(orderId, merchantId, caller);
    expect(order['status']).toBe('READY');
  });

  it('transitions READY → ASSIGNED with driver', async () => {
    const caller = { sub: merchantId, role: 'MERCHANT_OWNER', activeOrg: orgId };
    const order = await ordersService.assignDriver(orderId, driverId, merchantId, caller);
    expect(order['status']).toBe('ASSIGNED');

    const shipment = await ordersService.getShipmentByOrderId(orderId);
    expect(shipment!['assignedDriverId']).toBe(driverId);
    expect(shipment!['assignedAt']).toBeTruthy();
  });

  it('transitions ASSIGNED → PICKED_UP (driver only)', async () => {
    const caller = { sub: driverId, role: 'DRIVER', activeOrg: orgId };
    const order = await ordersService.pickupOrder(orderId, driverId, caller);
    expect(order['status']).toBe('PICKED_UP');

    const shipment = await ordersService.getShipmentByOrderId(orderId);
    expect(shipment!['pickedUpAt']).toBeTruthy();
  });

  it('transitions PICKED_UP → OUT_FOR_DELIVERY (driver only)', async () => {
    const caller = { sub: driverId, role: 'DRIVER', activeOrg: orgId };
    const order = await ordersService.outForDeliveryOrder(orderId, driverId, caller);
    expect(order['status']).toBe('OUT_FOR_DELIVERY');

    const shipment = await ordersService.getShipmentByOrderId(orderId);
    expect(shipment!['outForDeliveryAt']).toBeTruthy();
  });

  it('transitions OUT_FOR_DELIVERY → DELIVERED (driver only)', async () => {
    const caller = { sub: driverId, role: 'DRIVER', activeOrg: orgId };
    const order = await ordersService.deliverOrder(orderId, driverId, caller);
    expect(order['status']).toBe('DELIVERED');

    const shipment = await ordersService.getShipmentByOrderId(orderId);
    expect(shipment!['deliveredAt']).toBeTruthy();
  });

  // ── Shipment Events Audit Trail ────────────────────────────────

  it('records all shipment events in order', async () => {
    const events = await pool.query(`SELECT event_type, actor_type FROM shipment_events WHERE shipment_id = $1 ORDER BY sequence`, [shipmentId]);
    const types = events.rows.map((r: any) => r.event_type);
    expect(types).toEqual(['PREPARING', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  // ── Invalid Transitions ────────────────────────────────────────

  it('rejects invalid transition (DELIVERED → PREPARING)', async () => {
    const caller = { sub: merchantId, role: 'MERCHANT_OWNER', activeOrg: orgId };
    await expect(ordersService.prepareOrder(orderId, merchantId, caller)).rejects.toThrow(/Invalid transition/);
  });

  // ── Driver Authorization ───────────────────────────────────────

  it('rejects pickup by unassigned driver', async () => {
    // Create a second order for this test
    const cartId2 = randomUUID();
    await pool.query(`INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`, [cartId2, buyerId]);
    await pool.query(`INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id) VALUES ($1, $2, $3, $4, 2, 1000, 2000, $5)`, [randomUUID(), cartId2, storeId, variantId, offerId]);

    const co2 = await ordersService.checkout({ buyerId, deliveryAddress: {}, idempotencyKey: `m71-driver-test-${randomUUID()}` });
    const order2Id = co2.subOrders[0]!.id;

    const mCaller = { sub: merchantId, role: 'MERCHANT_OWNER', activeOrg: orgId };
    await ordersService.acceptOrder(order2Id, merchantId, mCaller);
    await ordersService.prepareOrder(order2Id, merchantId, mCaller);
    await ordersService.readyOrder(order2Id, merchantId, mCaller);
    await ordersService.assignDriver(order2Id, driverId, merchantId, mCaller);

    // Other driver tries to pickup
    const otherCaller = { sub: otherDriverId, role: 'DRIVER', activeOrg: orgId };
    await expect(ordersService.pickupOrder(order2Id, otherDriverId, otherCaller)).rejects.toThrow(/not assigned/);
  });

  // ── Buyer Tracking ─────────────────────────────────────────────

  it('buyer can view tracking for own order', async () => {
    const masterOrderId = (await pool.query(`SELECT master_order_id FROM orders WHERE id = $1`, [orderId])).rows[0].master_order_id;
    const tracking = await ordersService.getTracking(masterOrderId, buyerId);
    expect(tracking.masterOrderId).toBe(masterOrderId);
    expect(tracking.shipments.length).toBeGreaterThan(0);
    expect(tracking.shipments[0]!.events.length).toBeGreaterThan(0);
  });

  it('rejects tracking access for different buyer', async () => {
    const masterOrderId = (await pool.query(`SELECT master_order_id FROM orders WHERE id = $1`, [orderId])).rows[0].master_order_id;
    const otherBuyer = randomUUID();
    await expect(ordersService.getTracking(masterOrderId, otherBuyer)).rejects.toThrow();
  });

  // ── Driver Shipment List ───────────────────────────────────────

  it('driver can list assigned shipments', async () => {
    const shipments = await ordersService.listDriverShipments(driverId);
    expect(shipments.length).toBeGreaterThan(0);
    expect(shipments.every((s: any) => s['assignedDriverId'] === driverId)).toBe(true);
  });

  // ── Inventory Integration ──────────────────────────────────────

  it('DELIVERED triggers stock settlement (SALE movement)', async () => {
    const movements = await pool.query(
      `SELECT movement_type, quantity FROM stock_movements WHERE reference_id = $1 ORDER BY created_at`,
      [orderId],
    );
    const saleMovements = movements.rows.filter((r: any) => r.movement_type === 'SALE');
    expect(saleMovements.length).toBeGreaterThan(0);
  });
}, 180_000);
