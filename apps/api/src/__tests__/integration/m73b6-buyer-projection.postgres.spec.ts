/**
 * M7.3-B.6 — Buyer tracking projection: RTS event filter.
 *
 * Proves that the server-side getTracking() projection strips internal
 * operational event types (RTS_REQUESTED, RTS_APPROVED, RTS_REJECTED,
 * RTS_COMPLETED) from the buyer tracking response, while preserving
 * buyer-safe events like DELIVERY_EXCEPTION.
 *
 * The filter is enforced at the data boundary (orders.service.ts getTracking)
 * so the buyer API never exposes raw internal event names, regardless of
 * what the frontend does.
 *
 * Connection strategy mirrors m73b6-shipment-search:
 *   - CI / working Docker: testcontainers → fresh isolated container.
 *   - Docker Desktop issues: fall back to direct connection (env override).
 */
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as schema from '../../drizzle/schema';
import { DatabaseService } from '../../common/database/database.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { PromotionsService } from '../../modules/promotions/promotions.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

const FALLBACK = {
  host: process.env['M73B6_PG_HOST'] ?? 'localhost',
  port: parseInt(process.env['M73B6_PG_PORT'] ?? '15432', 10),
  user: process.env['M73B6_PG_USER'] ?? 'scs',
  pass: process.env['M73B6_PG_PASS'] ?? 'scs_dev_2026',
};

const realtime = {
  emitNewOrder: vi.fn(),
  emitOrderStatusChanged: vi.fn(),
  server: { to: () => ({ emit: () => {} }) },
} as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

describe('M7.3-B.6 — buyer tracking projection filters RTS events', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool;
  let adminPool: Pool;
  let testDbName: string;
  let ordersService: OrdersService;

  // Fixture IDs
  const orgId = randomUUID();
  const storeId = randomUUID();
  const buyerId = randomUUID();
  const merchantId = randomUUID();
  const masterOrderId = randomUUID();
  const subOrderId = randomUUID();
  const shipmentId = randomUUID();

  beforeAll(async () => {
    testDbName = `b6_proj_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
    } catch {
      container = undefined;
      adminConnectionString =
        `postgresql://${FALLBACK.user}:${FALLBACK.pass}@${FALLBACK.host}:${FALLBACK.port}/postgres`;
    }

    adminPool = new Pool({ connectionString: adminConnectionString });
    await adminPool.query(`CREATE DATABASE ${testDbName}`);

    const testDbUrl = container
      ? container.getConnectionUri().replace(/\/postgres$/, `/${testDbName}`)
      : `postgresql://${FALLBACK.user}:${FALLBACK.pass}@${FALLBACK.host}:${FALLBACK.port}/${testDbName}`;

    pool = new Pool({ connectionString: testDbUrl });

    // Apply migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    await pool.query(
      `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`,
    );
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
        await pool.query('COMMIT');
      } catch {
        await pool.query('ROLLBACK');
      }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    const db = drizzle(pool, { schema }) as unknown as DatabaseService['db'];
    const database = { db } as DatabaseService;
    const outbox = new OutboxDispatcher(database);
    const promotions = new PromotionsService(database);
    const inventoryService = new InventoryService(database, outbox);
    ordersService = new OrdersService(database, outbox, promotions, realtime, undefined, notifications);

    const roleRes = await pool.query(`SELECT id, key FROM roles`);
    const roleById = new Map(roleRes.rows.map((r: any) => [r.key, r.id] as const));

    // Seed users
    for (const [id, name, phone] of [
      [buyerId, 'Buyer', '+966500000001'],
      [merchantId, 'Merchant', '+966500000002'],
    ] as [string, string, string][]) {
      await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, $2, $3)`, [id, name, phone]);
    }

    // Org + memberships
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Test Org', 'SA')`, [orgId]);
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgId, merchantId, roleById.get('MERCHANT_OWNER')],
    );
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgId, buyerId, roleById.get('BUYER')],
    );

    // Store
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, $3, $4, 'APPROVED')`,
      [storeId, orgId, `slug-${storeId.slice(0, 8)}`, 'Test Store'],
    );

    // Master order + sub-order (OUT_FOR_DELIVERY so getTracking works)
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'CONFIRMED', '{}', NOW(), NOW())`,
      [masterOrderId, buyerId],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method,
         subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OUT_FOR_DELIVERY', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`,
      [subOrderId, masterOrderId, storeId, buyerId],
    );

    // Shipment
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, shipping_provider_key, exception_status, exception_type,
         carrier_tracking_id, carrier_shipment_id, carrier_create_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'OUT_FOR_DELIVERY', 'aramex', 'RTS_COMPLETED', 'RECIPIENT_REFUSED', $4, $5, 'SUCCESS', NOW(), NOW())`,
      [shipmentId, subOrderId, storeId, 'TRK-001', 'SHIP-001'],
    );

    // Insert shipment events — mix of buyer-safe and internal RTS events
    const events = [
      { type: 'DELIVERY_EXCEPTION', notes: 'RECIPIENT_REFUSED' },
      { type: 'RTS_REQUESTED', notes: 'Admin requested RTS' },
      { type: 'RTS_APPROVED', notes: 'Admin approved RTS' },
      { type: 'RTS_COMPLETED', notes: 'RTS completed' },
    ];
    for (const ev of events) {
      await pool.query(
        `INSERT INTO shipment_events (id, shipment_id, event_type, actor_type, notes, created_at)
         VALUES ($1, $2, $3, 'ADMIN', $4, NOW())`,
        [randomUUID(), shipmentId, ev.type, ev.notes],
      );
    }
  });

  afterAll(async () => {
    try { await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`); } catch { /* ignore */ }
    await pool?.end();
    await adminPool?.end();
    if (container) await container.stop();
  });

  it('getTracking() strips RTS_* events from the buyer projection', async () => {
    const tracking = await ordersService.getTracking(masterOrderId, buyerId);

    expect(tracking).toBeDefined();
    expect(tracking.shipments).toHaveLength(1);

    const subOrder = tracking.shipments[0];
    expect(subOrder).toBeDefined();

    const eventTypes = subOrder!.events.map((e: any) => e.eventType);

    // DELIVERY_EXCEPTION must survive (buyer-safe event)
    expect(eventTypes).toContain('DELIVERY_EXCEPTION');

    // All RTS_* events must be filtered out
    expect(eventTypes).not.toContain('RTS_REQUESTED');
    expect(eventTypes).not.toContain('RTS_APPROVED');
    expect(eventTypes).not.toContain('RTS_REJECTED');
    expect(eventTypes).not.toContain('RTS_COMPLETED');

    // Exactly one event should remain
    expect(subOrder!.events).toHaveLength(1);
  });

  it('preserves the shipment exceptionStatus for buyerDeliveryNote()', async () => {
    const tracking = await ordersService.getTracking(masterOrderId, buyerId);

    const shipment = tracking.shipments[0]!.shipment;
    expect(shipment).toBeDefined();
    // The exceptionStatus must still reflect the RTS state so the frontend
    // buyerDeliveryNote() can render "returned to the seller".
    expect(shipment!.exceptionStatus).toBe('RTS_COMPLETED');
    expect(shipment!.exceptionType).toBe('RECIPIENT_REFUSED');
  });

  it('does not leak RTS events even when they are the only events', async () => {
    // Insert a second shipment with ONLY RTS events (no DELIVERY_EXCEPTION)
    const shipment2 = randomUUID();
    const subOrder2 = randomUUID();
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method,
         subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OUT_FOR_DELIVERY', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`,
      [subOrder2, masterOrderId, storeId, buyerId],
    );
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, shipping_provider_key, exception_status,
         carrier_tracking_id, carrier_shipment_id, carrier_create_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'OUT_FOR_DELIVERY', 'aramex', 'RTS_IN_PROGRESS', $4, $5, 'SUCCESS', NOW(), NOW())`,
      [shipment2, subOrder2, storeId, 'TRK-002', 'SHIP-002'],
    );
    // Only RTS events — no buyer-safe events
    for (const t of ['RTS_REQUESTED', 'RTS_APPROVED']) {
      await pool.query(
        `INSERT INTO shipment_events (id, shipment_id, event_type, actor_type, notes, created_at)
         VALUES ($1, $2, $3, 'ADMIN', $4, NOW())`,
        [randomUUID(), shipment2, t, t],
      );
    }

    const tracking = await ordersService.getTracking(masterOrderId, buyerId);

    // Find the second sub-order's tracking entry
    const so2 = tracking.shipments.find((s: any) => s.orderId === subOrder2);
    expect(so2).toBeDefined();
    // All RTS events filtered → events array is empty
    expect(so2!.events).toHaveLength(0);
    // But the exceptionStatus is still visible for buyerDeliveryNote()
    expect(so2!.shipment!.exceptionStatus).toBe('RTS_IN_PROGRESS');
  });
});
