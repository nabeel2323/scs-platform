/**
 * M7.3-B.3.1 — Carrier-Cancel State Foundation: PostgreSQL Tests
 *
 * Verifies migration 0049 against a real PostgreSQL instance:
 *   B31-P-01  Fresh database: all migrations incl. 0049 apply; columns exist
 *   B31-P-02  Exact types / nullability / defaults for the new columns
 *   B31-P-03  Cancellation partial claim index exists with the intended predicate
 *   B31-P-04  recovery_status remains VARCHAR(24) with no CHECK constraint
 *   B31-P-05  Migration 0049 is idempotent (run twice, no duplicate objects)
 *   B31-P-06  New/existing shipments are behaviorally inactive (defaults)
 *
 * Hybrid connection strategy (matches M7.2.3-C):
 *   CI (Linux):   testcontainers → fresh isolated container.
 *   Local Windows: Docker Desktop port-mapping bug → fall back to a direct
 *                  connection on the dedicated postgres container (port 15432).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
const M0049 = '0049_carrier_cancellation.sql';

let container: StartedPostgreSqlContainer | undefined;
const FALLBACK_PG_HOST = process.env['TEST_PG_HOST'] ?? 'localhost';
const FALLBACK_PG_PORT = parseInt(process.env['TEST_PG_PORT'] ?? '15432', 10);
const FALLBACK_PG_USER = process.env['TEST_PG_USER'] ?? 'scs';
const FALLBACK_PG_PASSWORD = process.env['TEST_PG_PASSWORD'] ?? 'scs_dev_2026';

async function applyAllMigrations(pool: Pool) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`,
  );
  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(content);
      await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
}

describe('M7.3-B.3.1 — Carrier-Cancel State Foundation (PostgreSQL)', () => {
  let adminPool: Pool;
  let testDbName: string;
  let pool: Pool;

  const orgA = randomUUID();
  const merchantA = randomUUID();
  const buyerA = randomUUID();
  const storeA = randomUUID();

  beforeAll(async () => {
    testDbName = `b31_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
      console.log('B31 PG: using testcontainers');
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b21_test`;
      console.log('B31 PG: testcontainers unavailable, using direct connection');
    }

    adminPool = new Pool({ connectionString: adminConnectionString });
    await adminPool.query('SELECT 1');
    await adminPool.query(`CREATE DATABASE ${testDbName}`);

    const testDbUrl = container
      ? container.getConnectionUri().replace(/\/postgres$/, `/${testDbName}`)
      : `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/${testDbName}`;
    pool = new Pool({ connectionString: testDbUrl });

    // B31-P-01: fresh database applies the full migration set (incl. 0049)
    await applyAllMigrations(pool);

    // Minimal fixtures for the row-level default check
    const client = await pool.connect();
    try {
      await seedPlatformRbac(client);
    } finally {
      client.release();
    }
    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`, [orgA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+966500000001')`, [merchantA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000099')`, [buyerA]);
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-b31', 'Store A', 'APPROVED')`,
      [storeA, orgA],
    );
  }, 180_000);

  afterAll(async () => {
    try {
      await pool?.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    } catch {}
    await pool?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`).catch(() => {});
    await adminPool?.end();
    if (container) await container.stop();
  });

  it('B31-P-01: all carrier-cancel + pickup columns exist after migration', async () => {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'shipments'
         AND column_name IN (
           'carrier_pickup_id','pickup_scheduled',
           'carrier_cancel_status','carrier_cancel_error','carrier_cancel_error_class',
           'carrier_cancel_retries','carrier_cancel_attempted_at','carrier_cancel_idempotency_key')`,
    );
    expect(res.rows.map((r) => r.column_name).sort()).toEqual(
      [
        'carrier_cancel_attempted_at',
        'carrier_cancel_error',
        'carrier_cancel_error_class',
        'carrier_cancel_idempotency_key',
        'carrier_cancel_retries',
        'carrier_cancel_status',
        'carrier_pickup_id',
        'pickup_scheduled',
      ].sort(),
    );
  });

  it('B31-P-02: exact types, nullability and defaults', async () => {
    const res = await pool.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'shipments'
         AND column_name IN (
           'carrier_pickup_id','pickup_scheduled','carrier_cancel_status','carrier_cancel_error',
           'carrier_cancel_error_class','carrier_cancel_retries','carrier_cancel_attempted_at',
           'carrier_cancel_idempotency_key')`,
    );
    const byName = new Map(res.rows.map((r) => [r.column_name, r]));

    expect(byName.get('carrier_pickup_id').data_type).toBe('character varying');
    expect(byName.get('carrier_pickup_id').is_nullable).toBe('YES');

    expect(byName.get('pickup_scheduled').data_type).toBe('boolean');
    expect(byName.get('pickup_scheduled').is_nullable).toBe('NO');
    expect(String(byName.get('pickup_scheduled').column_default)).toContain('false');

    expect(byName.get('carrier_cancel_status').data_type).toBe('character varying');
    expect(byName.get('carrier_cancel_status').character_maximum_length).toBe(24);
    expect(byName.get('carrier_cancel_status').is_nullable).toBe('YES');

    expect(byName.get('carrier_cancel_error').data_type).toBe('text');

    expect(byName.get('carrier_cancel_error_class').data_type).toBe('character varying');
    expect(byName.get('carrier_cancel_error_class').character_maximum_length).toBe(40);

    expect(byName.get('carrier_cancel_retries').data_type).toBe('integer');
    expect(byName.get('carrier_cancel_retries').is_nullable).toBe('NO');
    expect(String(byName.get('carrier_cancel_retries').column_default)).toContain('0');

    expect(byName.get('carrier_cancel_attempted_at').data_type).toBe('timestamp with time zone');

    expect(byName.get('carrier_cancel_idempotency_key').data_type).toBe('character varying');
    expect(byName.get('carrier_cancel_idempotency_key').character_maximum_length).toBe(120);
  });

  it('B31-P-03: cancellation partial claim index exists with predicate', async () => {
    const res = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'shipments' AND indexname = 'idx_shipments_carrier_cancel'`,
    );
    expect(res.rows.length).toBe(1);
    const def: string = res.rows[0].indexdef;
    expect(def).toContain('carrier_cancel_status');
    expect(def).toContain('next_reconciliation_at');
    expect(def).toContain('WHERE');
    for (const state of ['PENDING', 'IN_PROGRESS', 'UNKNOWN', 'RETRY', 'RECONCILIATION_REQUIRED']) {
      expect(def).toContain(state);
    }
  });

  it('B31-P-04: recovery_status remains VARCHAR(24) with no CHECK constraint', async () => {
    const col = await pool.query(
      `SELECT character_maximum_length FROM information_schema.columns
       WHERE table_name = 'shipments' AND column_name = 'recovery_status'`,
    );
    expect(col.rows[0].character_maximum_length).toBe(24);

    const chk = await pool.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'shipments'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%recovery_status%'`,
    );
    expect(chk.rows.length).toBe(0);
  });

  it('B31-P-05: migration 0049 is idempotent (re-run does not duplicate objects)', async () => {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, M0049), 'utf-8');
    // Execute 0049 two additional times directly; must not throw.
    await pool.query(content);
    await pool.query(content);

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'shipments' AND column_name LIKE 'carrier_cancel%'`,
    );
    // Exactly the 6 cancel columns, no duplicates.
    expect(cols.rows.length).toBe(6);

    const idx = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'shipments' AND indexname = 'idx_shipments_carrier_cancel'`,
    );
    expect(idx.rows.length).toBe(1);
  });

  it('B31-P-06: a new shipment is behaviorally inactive (all defaults)', async () => {
    const masterOrderId = randomUUID();
    const orderId = randomUUID();
    const shipmentId = randomUUID();
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at)
       VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`,
      [masterOrderId, buyerA],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method,
         subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`,
      [orderId, masterOrderId, storeA, buyerA],
    );
    // Only required columns — the new cancel/pickup columns must take safe defaults.
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
      [shipmentId, orderId, storeA],
    );

    const res = await pool.query(
      `SELECT carrier_pickup_id, pickup_scheduled, carrier_cancel_status, carrier_cancel_error,
              carrier_cancel_error_class, carrier_cancel_retries, carrier_cancel_attempted_at,
              carrier_cancel_idempotency_key
       FROM shipments WHERE id = $1`,
      [shipmentId],
    );
    const row = res.rows[0];
    expect(row.pickup_scheduled).toBe(false);
    expect(row.carrier_pickup_id).toBeNull();
    expect(row.carrier_cancel_status).toBeNull();
    expect(row.carrier_cancel_retries).toBe(0);
    expect(row.carrier_cancel_attempted_at).toBeNull();
    expect(row.carrier_cancel_error).toBeNull();
    expect(row.carrier_cancel_error_class).toBeNull();
    expect(row.carrier_cancel_idempotency_key).toBeNull();
  });
});
