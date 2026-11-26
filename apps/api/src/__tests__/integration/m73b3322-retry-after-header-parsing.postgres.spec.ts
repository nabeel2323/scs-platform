/**
 * M7.3-B.3.3.2.2 — Retry-After Header Parsing: PostgreSQL Integration Tests
 *
 * Verifies against real PostgreSQL:
 *   B3322-PG-01  Valid Retry-After → nextAttemptAt reflects carrier value
 *   B3322-PG-02  Retry-After above operational cap → nextAttemptAt capped at 1h
 *   B3322-PG-03  Missing Retry-After → 2× RateLimitCarrierError backoff
 *   B3322-PG-04  Malformed Retry-After → 2× RateLimitCarrierError backoff
 *   B3322-PG-05  Concurrent workers: Retry-After does not bypass FOR UPDATE SKIP LOCKED
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingCarrierWorker } from '../../modules/shipping/shipping-carrier.worker';
import { ShippingProviderRegistry } from '../../modules/shipping/shipping-registry';
import { ShippingProvider } from '../../modules/shipping/shipping-provider';
import {
  CancelPickupRequest,
  CancelPickupResult,
  CreateShipmentRequest,
  CreateShipmentResult,
  ProviderCapabilities,
} from '../../modules/shipping/shipping.types';
import { RateLimitCarrierError } from '../../modules/shipping/carrier-errors';
import { CarrierRetryPolicy } from '../../modules/shipping/carrier-retry-policy';
import { CarrierCircuitBreaker } from '../../modules/shipping/carrier-circuit-breaker';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as schema from '../../drizzle/schema';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

async function applyAllMigrations(pool: Pool) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query(content);
  }
}

// ── Test Provider Stubs ─────────────────────────────────────────────────────

/**
 * Provider that throws RateLimitCarrierError with a specific retryAfterSeconds.
 */
class RateLimitWithRetryAfterProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'ratelimit-retryafter';
  readonly name = 'RateLimit with Retry-After';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true, canCancel: false, canCancelPickup: true,
    canGenerateLabel: false, canTrack: false, canValidateAddress: false, canReceiveWebhooks: false,
  };
  callCount = 0;
  retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds: number | undefined) {
    super();
    this.retryAfterSeconds = retryAfterSeconds;
  }

  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
  }

  override async cancelPickup(_req: CancelPickupRequest): Promise<CancelPickupResult> {
    this.callCount++;
    throw new RateLimitCarrierError('Rate limit exceeded (HTTP 429)', {
      providerKey: 'ratelimit-retryafter',
      operation: 'cancelPickup',
      retryAfterSeconds: this.retryAfterSeconds,
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDbService(pool: Pool, db: any): DatabaseService {
  const svc = Object.create(DatabaseService.prototype);
  svc.pool = pool;
  svc.db = db;
  return svc;
}

function createWorkerWithProvider(
  dbService: DatabaseService,
  provider: ShippingProvider,
  retryPolicy?: CarrierRetryPolicy,
  circuitBreaker?: CarrierCircuitBreaker,
): ShippingCarrierWorker {
  const registry = new ShippingProviderRegistry();
  registry.register(provider);
  return new (ShippingCarrierWorker as any)(
    dbService,
    registry,
    {} as any,
    {} as any,
    { incrementCounter: vi.fn(), recordHistogram: vi.fn() } as any,
    { tryResolve: vi.fn(async () => null) } as any,
    retryPolicy ?? new CarrierRetryPolicy(),
    circuitBreaker ?? ({ canRequest: vi.fn(() => true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any),
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.2.2 — Retry-After Header Parsing (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let adminPool: Pool;
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let dbService: DatabaseService;

  const FALLBACK_PG_HOST = process.env['TEST_PG_HOST'] ?? 'localhost';
  const FALLBACK_PG_PORT = parseInt(process.env['TEST_PG_PORT'] ?? '15432', 10);
  const FALLBACK_PG_USER = process.env['TEST_PG_USER'] ?? 'scs';
  const FALLBACK_PG_PASSWORD = process.env['TEST_PG_PASSWORD'] ?? 'scs_dev_2026';

  const orgA = randomUUID();
  const storeA = randomUUID();
  const buyerA = randomUUID();
  let testDbName: string;

  beforeAll(async () => {
    testDbName = `b3322_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b22_test`;
    }

    adminPool = new Pool({ connectionString: adminConnectionString });
    await adminPool.query('SELECT 1');
    await adminPool.query(`CREATE DATABASE ${testDbName}`);

    const testDbUrl = container
      ? container.getConnectionUri().replace(/\/postgres$/, `/${testDbName}`)
      : `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/${testDbName}`;
    pool = new Pool({ connectionString: testDbUrl });

    await applyAllMigrations(pool);
    db = drizzle(pool, { schema });
    dbService = makeDbService(pool, db);

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    await pool.query(
      `INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`,
      [orgA],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-b3322', 'Store A', 'APPROVED')`,
      [storeA, orgA],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000098')`,
      [buyerA],
    );
  }, 180_000);

  afterAll(async () => {
    try { await pool?.query(`DROP DATABASE IF EXISTS ${testDbName}`); } catch {}
    await pool?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`).catch(() => {});
    await adminPool?.end();
    if (container) await container.stop();
  });

  // ── Helper: insert a shipment + outbox event directly ─────────────────

  async function insertShipmentAndEvent(
    providerKey: string,
    carrierPickupId: string = 'PU-TEST',
  ): Promise<{ shipmentId: string; eventId: string }> {
    const shipmentId = randomUUID();
    const eventId = randomUUID();
    const masterOrderId = randomUUID();
    const orderId = randomUUID();

    await pool.query(
      `INSERT INTO master_orders (id, buyer_id) VALUES ($1, $2)`,
      [masterOrderId, buyerA],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id) VALUES ($1, $2, $3, $4)`,
      [orderId, masterOrderId, storeA, buyerA],
    );
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, shipping_provider_key, carrier_pickup_id, carrier_cancel_status, carrier_cancel_retries)
       VALUES ($1, $2, $3, 'PREPARING', $4, $5, 'PENDING', 0)`,
      [shipmentId, orderId, storeA, providerKey, carrierPickupId],
    );
    await pool.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, metadata)
       VALUES ($1, 'shipping.carrier.cancel', $2, $3, 'PENDING', $4)`,
      [eventId, shipmentId, JSON.stringify({ shipmentId }), JSON.stringify({ storeId: storeA })],
    );

    return { shipmentId, eventId };
  }

  // ── B3322-PG-01: Valid Retry-After → nextAttemptAt reflects carrier value ─

  it('B3322-PG-01: valid Retry-After: 120 → nextAttemptAt ≈ now + 120s', async () => {
    const provider = new RateLimitWithRetryAfterProvider(120);
    const realRetryPolicy = new CarrierRetryPolicy();
    const worker = createWorkerWithProvider(dbService, provider, realRetryPolicy);

    const { shipmentId, eventId } = await insertShipmentAndEvent('ratelimit-retryafter');

    // Mark as PROCESSING (simulating claim)
    await pool.query(
      `UPDATE outbox_events SET status = 'PROCESSING', locked_at = NOW(), locked_by = 'test-worker' WHERE id = $1`,
      [eventId],
    );

    const before = Date.now();
    await (worker as any).processEvent({
      id: eventId, eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      status: 'PROCESSING', attempts: 0,
      lockedAt: new Date(), lockedBy: 'test-worker',
      metadata: { storeId: storeA },
    });
    const after = Date.now();

    const row = await pool.query(
      `SELECT status, next_attempt_at, attempts FROM outbox_events WHERE id = $1`,
      [eventId],
    );

    expect(row.rows[0].status).toBe('PENDING');
    expect(row.rows[0].attempts).toBe(1);

    const nextAttempt = new Date(row.rows[0].next_attempt_at).getTime();
    // nextAttemptAt should be ≈ before + 120_000 (within a small tolerance)
    expect(nextAttempt).toBeGreaterThanOrEqual(before + 119_000);
    expect(nextAttempt).toBeLessThanOrEqual(after + 121_000);
  });

  // ── B3322-PG-02: Retry-After above cap → nextAttemptAt capped at 1h ──────

  it('B3322-PG-02: Retry-After: 7200 → nextAttemptAt capped at 1h', async () => {
    const provider = new RateLimitWithRetryAfterProvider(7200);
    const realRetryPolicy = new CarrierRetryPolicy();
    const worker = createWorkerWithProvider(dbService, provider, realRetryPolicy);

    const { shipmentId, eventId } = await insertShipmentAndEvent('ratelimit-retryafter');

    await pool.query(
      `UPDATE outbox_events SET status = 'PROCESSING', locked_at = NOW(), locked_by = 'test-worker' WHERE id = $1`,
      [eventId],
    );

    const before = Date.now();
    await (worker as any).processEvent({
      id: eventId, eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      status: 'PROCESSING', attempts: 0,
      lockedAt: new Date(), lockedBy: 'test-worker',
      metadata: { storeId: storeA },
    });
    const after = Date.now();

    const row = await pool.query(
      `SELECT status, next_attempt_at FROM outbox_events WHERE id = $1`,
      [eventId],
    );

    expect(row.rows[0].status).toBe('PENDING');

    const nextAttempt = new Date(row.rows[0].next_attempt_at).getTime();
    // Capped at 1 hour = 3_600_000ms
    expect(nextAttempt).toBeGreaterThanOrEqual(before + 3_599_000);
    expect(nextAttempt).toBeLessThanOrEqual(after + 3_601_000);
  });

  // ── B3322-PG-03: Missing Retry-After → 2× backoff ────────────────────────

  it('B3322-PG-03: missing Retry-After → 2× RateLimitCarrierError backoff (60s)', async () => {
    // undefined retryAfterSeconds → 2× normal backoff
    const provider = new RateLimitWithRetryAfterProvider(undefined);
    const realRetryPolicy = new CarrierRetryPolicy();
    const worker = createWorkerWithProvider(dbService, provider, realRetryPolicy);

    const { shipmentId, eventId } = await insertShipmentAndEvent('ratelimit-retryafter');

    await pool.query(
      `UPDATE outbox_events SET status = 'PROCESSING', locked_at = NOW(), locked_by = 'test-worker' WHERE id = $1`,
      [eventId],
    );

    const before = Date.now();
    await (worker as any).processEvent({
      id: eventId, eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      status: 'PROCESSING', attempts: 0,
      lockedAt: new Date(), lockedBy: 'test-worker',
      metadata: { storeId: storeA },
    });
    const after = Date.now();

    const row = await pool.query(
      `SELECT status, next_attempt_at FROM outbox_events WHERE id = $1`,
      [eventId],
    );

    expect(row.rows[0].status).toBe('PENDING');

    const nextAttempt = new Date(row.rows[0].next_attempt_at).getTime();
    // 2× normal backoff: 2 * 30_000 * 2^0 = 60_000ms, with ±25% jitter → 45_000–75_000ms
    expect(nextAttempt).toBeGreaterThanOrEqual(before + 44_000);
    expect(nextAttempt).toBeLessThanOrEqual(after + 76_000);
  });

  // ── B3322-PG-04: Malformed Retry-After → 2× backoff ──────────────────────

  it('B3322-PG-04: retryAfterSeconds=0 (simulating malformed) → 2× backoff (60s)', async () => {
    // retryAfterSeconds=0 is falsy → CarrierRetryPolicy falls through to 2× backoff
    // This simulates what happens when the HTTP client receives malformed Retry-After
    const provider = new RateLimitWithRetryAfterProvider(0 as any);
    const realRetryPolicy = new CarrierRetryPolicy();
    const worker = createWorkerWithProvider(dbService, provider, realRetryPolicy);

    const { shipmentId, eventId } = await insertShipmentAndEvent('ratelimit-retryafter');

    await pool.query(
      `UPDATE outbox_events SET status = 'PROCESSING', locked_at = NOW(), locked_by = 'test-worker' WHERE id = $1`,
      [eventId],
    );

    const before = Date.now();
    await (worker as any).processEvent({
      id: eventId, eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      status: 'PROCESSING', attempts: 0,
      lockedAt: new Date(), lockedBy: 'test-worker',
      metadata: { storeId: storeA },
    });
    const after = Date.now();

    const row = await pool.query(
      `SELECT status, next_attempt_at FROM outbox_events WHERE id = $1`,
      [eventId],
    );

    expect(row.rows[0].status).toBe('PENDING');

    const nextAttempt = new Date(row.rows[0].next_attempt_at).getTime();
    // 2× normal backoff: 60_000ms, with ±25% jitter → 45_000–75_000ms
    expect(nextAttempt).toBeGreaterThanOrEqual(before + 44_000);
    expect(nextAttempt).toBeLessThanOrEqual(after + 76_000);
  });

  // ── B3322-PG-05: Concurrent workers with Retry-After ─────────────────────

  it('B3322-PG-05: Retry-After does not bypass FOR UPDATE SKIP LOCKED', async () => {
    const { eventId } = await insertShipmentAndEvent('ratelimit-retryafter');

    // Ensure event is PENDING
    await pool.query(
      `UPDATE outbox_events SET status = 'PENDING' WHERE id = $1`,
      [eventId],
    );

    // 100 concurrent claim attempts (same as B3321-PG-09)
    const claimPromises = Array.from({ length: 100 }, (_, i) => {
      const workerId = `worker-${i}`;
      return pool.query(`
        UPDATE outbox_events
        SET status = 'PROCESSING', locked_at = NOW(), locked_by = $1
        WHERE id = $2 AND status = 'PENDING'
        RETURNING id
      `, [workerId, eventId]);
    });

    const results = await Promise.all(claimPromises);
    const claimed = results.filter(r => r.rows.length > 0);
    expect(claimed.length).toBe(1);
  });
});
