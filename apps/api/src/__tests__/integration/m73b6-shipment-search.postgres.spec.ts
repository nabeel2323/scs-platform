/**
 * M7.3-B.6 — D-2 regression: shipment free-text search must not 500.
 *
 * Root cause proven in independent runtime verification: the Ship-Ops list
 * controller searched `ilike(shipments.id, term)` against a PostgreSQL `uuid`
 * column, which has no `~~*` (ILIKE) operator → HTTP 500
 * (`operator does not exist: uuid ~~* unknown`).
 *
 * This spec exercises the REAL controller method (`listShipments`) against a
 * REAL PostgreSQL container so the fix — casting the uuid to text before the
 * pattern match — is proven at the database layer, not mocked.
 *
 * It also guards the surrounding behaviour B.6 must preserve:
 *   - search by partial shipment UUID (the D-2 case),
 *   - search by carrier tracking id,
 *   - search by carrier shipment id,
 *   - search by store display name (case-insensitive text search intact),
 *   - LIKE metacharacter escaping remains intact (no crash, no wildcard leak),
 *   - tenant scoping still applies to non-privileged callers,
 *   - the root cause itself: bare `id ILIKE` on uuid is rejected while the
 *     `id::text ILIKE` form used by the controller succeeds.
 *
 * Hybrid connection strategy mirrors the other PostgreSQL integration specs:
 *   - CI / working Docker: testcontainers → fresh isolated container.
 *   - Docker Desktop port-mapping issues: fall back to a direct connection
 *     (override via M73B6_PG_* env vars).
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
import { ShipmentOperationsController } from '../../modules/shipping/shipment-operations.controller';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

let container: StartedPostgreSqlContainer | undefined;
const FALLBACK = {
  host: process.env['M73B6_PG_HOST'] ?? 'localhost',
  port: parseInt(process.env['M73B6_PG_PORT'] ?? '15432', 10),
  user: process.env['M73B6_PG_USER'] ?? 'scs',
  pass: process.env['M73B6_PG_PASS'] ?? 'scs_dev_2026',
};

describe('M7.3-B.6 D-2 — shipment search against real PostgreSQL', () => {
  let adminPool: Pool;
  let pool: Pool;
  let controller: ShipmentOperationsController;
  let testDbName: string;

  // Fixtures (two tenants to also prove tenant scoping survives the change).
  const orgA = randomUUID();
  const orgB = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const buyerA = randomUUID();
  const buyerB = randomUUID();
  const orderA = randomUUID();
  const orderB = randomUUID();
  const shipmentA = randomUUID();
  const shipmentB = randomUUID();

  async function seedTenant(opts: {
    orgId: string; storeId: string; storeName: string; buyerId: string;
    orderId: string; shipmentId: string; trackingId: string; carrierShipmentId: string;
  }) {
    await pool.query(
      `INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org', 'SA')`,
      [opts.orgId],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, $3, $4, 'APPROVED')`,
      [opts.storeId, opts.orgId, `slug-${opts.storeId.slice(0, 8)}`, opts.storeName],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer', $2)`,
      [opts.buyerId, `+966${opts.buyerId.slice(0, 9)}`],
    );
    const masterOrderId = randomUUID();
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at)
       VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`,
      [masterOrderId, opts.buyerId],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method,
         subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`,
      [opts.orderId, masterOrderId, opts.storeId, opts.buyerId],
    );
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, shipping_provider_key,
         carrier_tracking_id, carrier_shipment_id, carrier_create_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', 'aramex', $4, $5, 'SUCCESS', NOW(), NOW())`,
      [opts.shipmentId, opts.orderId, opts.storeId, opts.trackingId, opts.carrierShipmentId],
    );
  }

  beforeAll(async () => {
    testDbName = `b6_search_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
      // eslint-disable-next-line no-console
      console.log('B.6 D-2 PG: using testcontainers');
    } catch {
      container = undefined;
      adminConnectionString =
        `postgresql://${FALLBACK.user}:${FALLBACK.pass}@${FALLBACK.host}:${FALLBACK.port}/postgres`;
      // eslint-disable-next-line no-console
      console.log('B.6 D-2 PG: testcontainers unavailable, using direct connection');
    }

    adminPool = new Pool({ connectionString: adminConnectionString });
    await adminPool.query(`CREATE DATABASE ${testDbName}`);

    let testDbUrl: string;
    if (container) {
      testDbUrl = container.getConnectionUri().replace(/\/postgres$/, `/${testDbName}`);
    } else {
      testDbUrl =
        `postgresql://${FALLBACK.user}:${FALLBACK.pass}@${FALLBACK.host}:${FALLBACK.port}/${testDbName}`;
    }
    pool = new Pool({ connectionString: testDbUrl });

    // Apply schema migrations (shipments table with uuid PK + text columns).
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    for (const file of files) {
      await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    // Wire a DatabaseService to the test pool, exactly like the app does after
    // onModuleInit — then inject it into the real controller. registry/ordersService
    // are unused by the list read model, so they are not required here.
    const db = drizzle(pool, { schema }) as any;
    const database = new DatabaseService();
    (database as any).pool = pool;
    (database as any).db = db;
    controller = new ShipmentOperationsController(database, undefined as any, undefined as any);

    await seedTenant({
      orgId: orgA, storeId: storeA, storeName: 'Gulf Tech Electronics', buyerId: buyerA,
      orderId: orderA, shipmentId: shipmentA, trackingId: 'TRK-GULF-0001', carrierShipmentId: 'SHIP-GULF-0001',
    });
    await seedTenant({
      orgId: orgB, storeId: storeB, storeName: 'Al-Baraka Books', buyerId: buyerB,
      orderId: orderB, shipmentId: shipmentB, trackingId: 'TRK-BARAKA-0002', carrierShipmentId: 'SHIP-BARAKA-0002',
    });
  });

  afterAll(async () => {
    try { await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`); } catch { /* ignore */ }
    await pool?.end();
    await adminPool?.end();
    if (container) await container.stop();
  });

  const admin = { sub: randomUUID(), role: 'ADMIN', activeOrg: null } as any;

  // ── D-2 core regression ───────────────────────────────────────────────
  it('searching by a partial shipment UUID returns the shipment without a 500', async () => {
    const partial = shipmentA.slice(0, 8);
    const res = await controller.listShipments(admin, { search: partial });
    expect(res.data.map((r: any) => r.id)).toContain(shipmentA);
    expect(res.total).toBeGreaterThanOrEqual(1);
  });

  it('searching by a full shipment UUID returns the shipment', async () => {
    const res = await controller.listShipments(admin, { search: shipmentA });
    expect(res.data.map((r: any) => r.id)).toEqual([shipmentA]);
  });

  it('still searches by carrier tracking id', async () => {
    const res = await controller.listShipments(admin, { search: 'GULF-0001' });
    expect(res.data.map((r: any) => r.id)).toEqual([shipmentA]);
  });

  it('still searches by carrier shipment id', async () => {
    const res = await controller.listShipments(admin, { search: 'SHIP-BARAKA' });
    expect(res.data.map((r: any) => r.id)).toEqual([shipmentB]);
  });

  it('still searches by store display name, case-insensitively', async () => {
    const res = await controller.listShipments(admin, { search: 'gulf tech' });
    expect(res.data.map((r: any) => r.id)).toEqual([shipmentA]);
  });

  it('escapes LIKE metacharacters without throwing or wildcard-leaking', async () => {
    // '%' is escaped to a literal so it must not match every row.
    const res = await controller.listShipments(admin, { search: '%' });
    expect(res.total).toBe(0);
  });

  it('applies tenant scoping to non-privileged callers alongside search', async () => {
    const merchant = { sub: randomUUID(), role: 'MERCHANT_OWNER', activeOrg: orgB } as any;
    // 'GULF' matches store A only; a merchant scoped to org B must see nothing.
    const res = await controller.listShipments(merchant, { search: 'GULF' });
    expect(res.total).toBe(0);
    // 'BARAKA' matches store B; the org B merchant sees exactly its own shipment.
    const own = await controller.listShipments(merchant, { search: 'BARAKA' });
    expect(own.data.map((r: any) => r.id)).toEqual([shipmentB]);
  });

  it('root cause guard: bare ILIKE on a uuid is rejected but the controller\'s text-cast form succeeds', async () => {
    let bareErr: unknown = null;
    try {
      await pool.query(`SELECT id FROM shipments WHERE id ILIKE $1`, [`%${shipmentA.slice(0, 8)}%`]);
    } catch (e) {
      bareErr = e;
    }
    expect(bareErr).not.toBeNull(); // uuid has no ~~* operator (the original defect).

    const cast = await pool.query(
      `SELECT id FROM shipments WHERE id::text ILIKE $1`, [`%${shipmentA.slice(0, 8)}%`],
    );
    expect(cast.rows.map((r: any) => r.id)).toContain(shipmentA);
  });
});
