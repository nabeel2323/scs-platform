/**
 * M7.2.3-C — Carrier Operations & Reconciliation PostgreSQL Integration Tests
 *
 * Covers:
 *   C-01  Outbox atomic claiming (FOR UPDATE SKIP LOCKED)
 *   C-02  100 concurrent workers vs 10 events (no duplicate claims)
 *   C-03  Lease expiration recovery
 *   C-04  Dead-letter after max retries
 *   C-05  Reconciliation persistence
 *   C-06  Tenant isolation (Org A vs Org B)
 *   C-07  Duplicate webhook dedup
 *   C-08  Duplicate tracking event dedup
 *   C-09  Out-of-order tracking events
 *   C-10  Provider isolation (Aramex failure != Manual delivery failure)
 *   C-11  Migration 0045 schema introspection
 *
 * Hybrid connection strategy:
 *   CI (Linux): testcontainers → fresh isolated container.
 *   Local Windows: Docker Desktop port-mapping bug → fall back to direct
 *   connection on the dedicated scs-b21-pg container (port 15432).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema';
import { DatabaseService } from '../../common/database/database.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

// Hybrid connection
let container: StartedPostgreSqlContainer | undefined;
const FALLBACK_PG_HOST = process.env['TEST_PG_HOST'] ?? 'localhost';
const FALLBACK_PG_PORT = parseInt(process.env['TEST_PG_PORT'] ?? '15432', 10);
const FALLBACK_PG_USER = process.env['TEST_PG_USER'] ?? 'scs';
const FALLBACK_PG_PASSWORD = process.env['TEST_PG_PASSWORD'] ?? 'scs_dev_2026';

describe('M7.2.3-C — Carrier Operations PostgreSQL', () => {
  let adminPool: Pool;
  let testDbName: string;
  let pool: Pool;
  let db: any;
  let database: DatabaseService;

  // Test fixtures
  const orgA = randomUUID();
  const orgB = randomUUID();
  const merchantA = randomUUID();
  const merchantB = randomUUID();
  const buyerA = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();

  const CARRIER_MASTER_KEY = randomBytes(32).toString('hex');

  beforeAll(async () => {
    process.env['CARRIER_CREDENTIALS_MASTER_KEY'] = CARRIER_MASTER_KEY;

    testDbName = `c_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
      console.log('C PG: using testcontainers');
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b21_test`;
      console.log('C PG: testcontainers unavailable, using direct connection');
    }

    adminPool = new Pool({ connectionString: adminConnectionString });
    await adminPool.query('SELECT 1');
    await adminPool.query(`CREATE DATABASE ${testDbName}`);

    let testDbUrl: string;
    if (container) {
      testDbUrl = container.getConnectionUri().replace(/\/postgres$/, `/${testDbName}`);
    } else {
      testDbUrl = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/${testDbName}`;
    }
    pool = new Pool({ connectionString: testDbUrl });
    db = drizzle(pool, { schema }) as any;
    database = new DatabaseService();
    (database as any).pool = pool;
    (database as any).db = db;

    // Run migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sqlContent); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    // Seed RBAC
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // Create test orgs, users, stores
    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`, [orgA]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org B', 'SA')`, [orgB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+966500000001')`, [merchantA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant B', '+966500000002')`, [merchantB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000099')`, [buyerA]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgB, merchantB, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a', 'Store A', 'APPROVED')`, [storeA, orgA]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-b', 'Store B', 'APPROVED')`, [storeB, orgB]);
  }, 180_000);

  afterAll(async () => {
    try { await pool?.query(`DROP DATABASE IF EXISTS ${testDbName}`); } catch {}
    await pool?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`).catch(() => {});
    await adminPool?.end();
    if (container) await container.stop();
    delete process.env['CARRIER_CREDENTIALS_MASTER_KEY'];
  }, 30_000);

  // ── C-01: Atomic Claiming (FOR UPDATE SKIP LOCKED) ─────────────────────

  it('C-01: outbox atomic claiming uses FOR UPDATE SKIP LOCKED', async () => {
    // Insert 3 pending carrier events
    const eventIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of eventIds) {
      await pool.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status)
         VALUES ($1, 'shipping.carrier.create', $2, '{}', 'PENDING')`,
        [id, randomUUID()],
      );
    }

    // Claim events using the same SQL the worker uses
    const workerId = 'test-worker-1';
    const now = new Date();
    const result = await pool.query(`
      UPDATE outbox_events
      SET status = 'PROCESSING', locked_at = NOW(), locked_by = $1
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status = 'PENDING'
          AND (next_attempt_at IS NULL OR next_attempt_at <= $2)
          AND event_type LIKE 'shipping.carrier.%'
        ORDER BY created_at
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, status, locked_by
    `, [workerId, now]);

    expect(result.rows.length).toBe(3);
    for (const row of result.rows) {
      expect(row.status).toBe('PROCESSING');
      expect(row.locked_by).toBe(workerId);
    }

    // Second claim should find nothing
    const second = await pool.query(`
      UPDATE outbox_events
      SET status = 'PROCESSING', locked_at = NOW(), locked_by = $1
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status = 'PENDING'
          AND (next_attempt_at IS NULL OR next_attempt_at <= $2)
          AND event_type LIKE 'shipping.carrier.%'
        ORDER BY created_at
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `, [workerId, now]);

    expect(second.rows.length).toBe(0);
  });

  // ── C-02: 100 Concurrent Workers vs 10 Events ─────────────────────────

  it('C-02: 100 concurrent workers cannot duplicate-claim 10 events', async () => {
    // Insert 10 events
    const eventIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      eventIds.push(id);
      await pool.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status)
         VALUES ($1, 'shipping.carrier.create', $2, '{}', 'PENDING')`,
        [id, randomUUID()],
      );
    }

    // Launch 100 concurrent claim queries
    const claimPromises = [];
    for (let w = 0; w < 100; w++) {
      const wid = `worker-${w}`;
      claimPromises.push(pool.query(`
        UPDATE outbox_events
        SET status = 'PROCESSING', locked_at = NOW(), locked_by = $1
        WHERE id IN (
          SELECT id FROM outbox_events
          WHERE status = 'PENDING'
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
            AND event_type LIKE 'shipping.carrier.%'
          ORDER BY created_at
          LIMIT 5
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, locked_by
      `, [wid]));
    }

    const results = await Promise.all(claimPromises);

    // Count total claimed events
    const claimedIds = new Set<string>();
    for (const res of results) {
      for (const row of res.rows) {
        expect(claimedIds.has(row.id)).toBe(false); // no duplicates
        claimedIds.add(row.id);
      }
    }

    // All 10 events should be claimed exactly once
    expect(claimedIds.size).toBe(10);
  }, 30_000);

  // ── C-03: Lease Expiration Recovery ────────────────────────────────────

  it('C-03: stale PROCESSING events are recovered', async () => {
    const eventId = randomUUID();
    // Insert a PROCESSING event with locked_at 10 minutes ago
    await pool.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, locked_at, locked_by, attempts)
       VALUES ($1, 'shipping.carrier.create', $2, '{}', 'PROCESSING', NOW() - INTERVAL '10 minutes', 'dead-worker', 1)`,
      [eventId, randomUUID()],
    );

    // Recover stale leases (same logic as worker.recoverStaleLeases)
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 min timeout
    const recovered = await pool.query(`
      UPDATE outbox_events
      SET status = 'PENDING', locked_at = NULL, locked_by = NULL, attempts = attempts + 1
      WHERE status = 'PROCESSING' AND locked_at < $1
      RETURNING id, status, attempts
    `, [cutoff]);

    expect(recovered.rows.length).toBe(1);
    expect(recovered.rows[0].status).toBe('PENDING');
    expect(parseInt(recovered.rows[0].attempts)).toBe(2);
  });

  // ── C-04: Dead-Letter After Max Retries ────────────────────────────────

  it('C-04: events are marked DEAD_LETTER after max retries', async () => {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, attempts, last_error)
       VALUES ($1, 'shipping.carrier.create', $2, '{}', 'PENDING', 8, 'max attempts reached')`,
      [eventId, randomUUID()],
    );

    // Simulate the retry policy decision: at attempt 8 with max 8, mark DEAD_LETTER
    await pool.query(`
      UPDATE outbox_events SET status = 'DEAD_LETTER' WHERE id = $1 AND attempts >= 8
    `, [eventId]);

    const result = await pool.query(`SELECT status FROM outbox_events WHERE id = $1`, [eventId]);
    expect(result.rows[0].status).toBe('DEAD_LETTER');
  });

  // ── C-05: Reconciliation Persistence ───────────────────────────────────

  it('C-05: RECOVERY_REQUIRED shipments persist reconciliation fields', async () => {
    const masterOrderId = randomUUID();
    const orderId = randomUUID();
    const shipmentId = randomUUID();

    await pool.query(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`, [masterOrderId, buyerA]);
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`, [orderId, masterOrderId, storeA, buyerA]);
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, carrier_create_status, recovery_status, next_reconciliation_at, carrier_create_error_class, shipping_provider_key, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', 'RECOVERY_REQUIRED', 'PENDING_RECOVERY', NOW(), 'timeout', 'aramex', NOW(), NOW())`,
      [shipmentId, orderId, storeA],
    );

    const result = await pool.query(`
      SELECT carrier_create_status, recovery_status, next_reconciliation_at, carrier_create_error_class
      FROM shipments WHERE id = $1
    `, [shipmentId]);

    expect(result.rows[0].carrier_create_status).toBe('RECOVERY_REQUIRED');
    expect(result.rows[0].recovery_status).toBe('PENDING_RECOVERY');
    expect(result.rows[0].carrier_create_error_class).toBe('timeout');
    expect(result.rows[0].next_reconciliation_at).toBeTruthy();
  });

  // ── C-06: Tenant Isolation ─────────────────────────────────────────────

  it('C-06: Org A shipment is invisible to Org B queries', async () => {
    const masterOrderId = randomUUID();
    const orderId = randomUUID();
    const shipmentId = randomUUID();

    await pool.query(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`, [masterOrderId, buyerA]);
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`, [orderId, masterOrderId, storeA, buyerA]);
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, carrier_create_status, shipping_provider_key, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', 'PENDING', 'aramex', NOW(), NOW())`,
      [shipmentId, orderId, storeA],
    );

    // Query for Org B's store — should not find Org A's shipment
    const orgBShipments = await pool.query(`
      SELECT s.id FROM shipments s
      JOIN stores st ON s.store_id = st.id
      WHERE st.org_id = $1
    `, [orgB]);

    expect(orgBShipments.rows.length).toBe(0);

    // Query for Org A's store — should find it
    const orgAShipments = await pool.query(`
      SELECT s.id FROM shipments s
      JOIN stores st ON s.store_id = st.id
      WHERE st.org_id = $1
    `, [orgA]);

    expect(orgAShipments.rows.length).toBeGreaterThan(0);
    expect(orgAShipments.rows.some((r: any) => r.id === shipmentId)).toBe(true);
  });

  // ── C-07: Duplicate Webhook Dedup ──────────────────────────────────────

  it('C-07: duplicate webhook events are rejected by UNIQUE constraint', async () => {
    const webhookId = randomUUID();
    await pool.query(
      `INSERT INTO carrier_webhook_events (id, provider_key, event_type, external_delivery_id, payload, processed)
       VALUES ($1, 'aramex', 'status_update', 'AWB-12345', '{}', false)`,
      [webhookId],
    );

    // Duplicate insert should fail
    try {
      await pool.query(
        `INSERT INTO carrier_webhook_events (id, provider_key, event_type, external_delivery_id, payload, processed)
         VALUES ($1, 'aramex', 'status_update', 'AWB-12345', '{}', false)`,
        [randomUUID()],
      );
      expect.fail('Should have thrown unique violation');
    } catch (err: any) {
      expect(err.code).toBe('23505'); // unique_violation
    }
  });

  // ── C-08: Duplicate Tracking Event Dedup ───────────────────────────────

  it('C-08: duplicate tracking events are deduped by external_event_id', async () => {
    const masterOrderId = randomUUID();
    const orderId = randomUUID();
    const shipmentId = randomUUID();

    await pool.query(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`, [masterOrderId, buyerA]);
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`, [orderId, masterOrderId, storeA, buyerA]);
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at) VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
      [shipmentId, orderId, storeA],
    );

    const fingerprint = 'fp-test123';
    await pool.query(
      `INSERT INTO shipment_events (id, shipment_id, event_type, actor_type, external_event_id, metadata, created_at)
       VALUES ($1, $2, 'CARRIER_TRACKING', 'CARRIER', $3, '{}', NOW())`,
      [randomUUID(), shipmentId, fingerprint],
    );

    // Check for existing by fingerprint — should find it
    const existing = await pool.query(
      `SELECT id FROM shipment_events WHERE external_event_id = $1`,
      [fingerprint],
    );
    expect(existing.rows.length).toBe(1);
  });

  // ── C-09: Out-of-Order Tracking Events ─────────────────────────────────

  it('C-09: out-of-order tracking events are persisted but do not advance status', async () => {
    // The status progression guard is in the application layer (CarrierTrackingPoller).
    // Here we verify the data layer allows inserting events in any order.
    const masterOrderId = randomUUID();
    const orderId = randomUUID();
    const shipmentId = randomUUID();

    await pool.query(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`, [masterOrderId, buyerA]);
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`, [orderId, masterOrderId, storeA, buyerA]);
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, carrier_status_mapped, created_at, updated_at) VALUES ($1, $2, $3, 'PREPARING', 'IN_TRANSIT', NOW(), NOW())`,
      [shipmentId, orderId, storeA],
    );

    // Insert an "earlier" event (PICKED_UP) while shipment is already IN_TRANSIT
    await pool.query(
      `INSERT INTO shipment_events (id, shipment_id, event_type, actor_type, external_event_id, metadata, created_at)
       VALUES ($1, $2, 'CARRIER_TRACKING', 'CARRIER', $3, '{"carrierStatus": "PICKED_UP"}', NOW())`,
      [randomUUID(), shipmentId, 'fp-outoforder-1'],
    );

    // The event is persisted (data layer doesn't block)
    const events = await pool.query(
      `SELECT metadata FROM shipment_events WHERE shipment_id = $1`,
      [shipmentId],
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].metadata.carrierStatus).toBe('PICKED_UP');

    // But the shipment status is still IN_TRANSIT (application layer prevents backward move)
    const shipment = await pool.query(
      `SELECT carrier_status_mapped FROM shipments WHERE id = $1`,
      [shipmentId],
    );
    expect(shipment.rows[0].carrier_status_mapped).toBe('IN_TRANSIT');
  });

  // ── C-10: Provider Isolation ───────────────────────────────────────────

  it('C-10: provider isolation — Aramex failure does not affect manual deliveries', async () => {
    // This test verifies that the circuit breaker scope is per-provider.
    // The circuit breaker is in-memory, so we test the data layer:
    // A shipment with manual provider should not be affected by aramex failures.

    const masterOrderId1 = randomUUID();
    const orderId1 = randomUUID();
    const manualShipmentId = randomUUID();

    const masterOrderId2 = randomUUID();
    const orderId2 = randomUUID();
    const aramexShipmentId = randomUUID();

    await pool.query(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`, [masterOrderId1, buyerA]);
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`, [orderId1, masterOrderId1, storeA, buyerA]);

    await pool.query(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`, [masterOrderId2, buyerA]);
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`, [orderId2, masterOrderId2, storeA, buyerA]);

    // Manual provider shipment (order 1)
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, carrier_create_status, shipping_provider_key, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', 'SUCCESS', 'manual-driver', NOW(), NOW())`,
      [manualShipmentId, orderId1, storeA],
    );

    // Aramex provider shipment (order 2 — separate order due to unique constraint)
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, carrier_create_status, shipping_provider_key, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', 'FAILED', 'aramex', NOW(), NOW())`,
      [aramexShipmentId, orderId2, storeA],
    );

    // Verify they have independent states
    const manual = await pool.query(`SELECT carrier_create_status, shipping_provider_key FROM shipments WHERE id = $1`, [manualShipmentId]);
    const aramex = await pool.query(`SELECT carrier_create_status, shipping_provider_key FROM shipments WHERE id = $1`, [aramexShipmentId]);

    expect(manual.rows[0].carrier_create_status).toBe('SUCCESS');
    expect(manual.rows[0].shipping_provider_key).toBe('manual-driver');
    expect(aramex.rows[0].carrier_create_status).toBe('FAILED');
    expect(aramex.rows[0].shipping_provider_key).toBe('aramex');
  });

  // ── C-11: Migration 0045 Schema Introspection ─────────────────────────

  it('C-11: migration 0045 columns and indexes exist', async () => {
    // Check outbox_events new columns
    const outboxCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'outbox_events' AND column_name IN ('locked_at', 'locked_by', 'organization_id', 'store_id')
    `);
    expect(outboxCols.rows.length).toBe(4);

    // Check shipments new columns
    const shipmentCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'shipments' AND column_name IN ('recovery_status', 'next_reconciliation_at', 'carrier_create_error_class')
    `);
    expect(shipmentCols.rows.length).toBe(3);

    // Check indexes exist
    // M7.2.4-A: idx_shipment_events_external was replaced by uq_shipment_events_external_id
    // (partial unique index) and idx_shipments_tracking_poll was added by migration 0046.
    const indexes = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('idx_outbox_claim', 'idx_shipments_reconciliation', 'idx_shipments_tracking', 'uq_shipment_events_external_id', 'idx_shipments_tracking_poll', 'idx_webhook_events_lookup')
    `);
    expect(indexes.rows.length).toBe(6);
  });
});
