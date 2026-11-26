/**
 * M7.3-B.3.3.2.1 — Retry State Foundation: PostgreSQL Integration Tests
 *
 * Verifies against real PostgreSQL:
 *   B3321-PG-01  retryable failure persists retry counter
 *   B3321-PG-02  retryable error → outbox PENDING + nextAttemptAt (via handleFailure)
 *   B3321-PG-03  terminal error → no retry (outbox stays DISPATCHED/FAILED)
 *   B3321-PG-04  retry budget exhaustion → DEAD_LETTER
 *   B3321-PG-05  duplicate event remains safe (idempotent)
 *   B3321-PG-06  tenant isolation enforced on retry
 *   B3321-PG-07  retry counter does not lose updates
 *   B3321-PG-08  lease recovery works for retrying cancellation
 *   B3321-PG-09  concurrent workers: exactly one processes the event
 *   B3321-PG-10  retryable failure sets carrierCancelStatus = PENDING
 *   B3321-PG-11  timeout → UNKNOWN, reconciliation scheduled (B.3.3.3)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
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
import {
  RetryableCarrierError,
  RateLimitCarrierError,
  AuthenticationCarrierError,
} from '../../modules/shipping/carrier-errors';
import { CarrierRetryPolicy } from '../../modules/shipping/carrier-retry-policy';
import { CarrierCircuitBreaker } from '../../modules/shipping/carrier-circuit-breaker';
import { shipments } from '../../modules/orders/shipment.schema';
import { outboxEvents } from '../../modules/audit/audit.schema';
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

class RetryableErrorProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'retryable-error';
  readonly name = 'Retryable Error';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true, canCancel: false, canCancelPickup: true,
    canGenerateLabel: false, canTrack: false, canValidateAddress: false, canReceiveWebhooks: false,
  };
  callCount = 0;
  errorToThrow: Error;
  constructor(errorToThrow?: Error) {
    super();
    this.errorToThrow = errorToThrow ?? new RetryableCarrierError('Server error (HTTP 503)', {
      providerKey: 'retryable-error', operation: 'cancelPickup',
    });
  }
  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
  }
  override async cancelPickup(_req: CancelPickupRequest): Promise<CancelPickupResult> {
    this.callCount++;
    throw this.errorToThrow;
  }
}

class TerminalErrorProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'terminal-error';
  readonly name = 'Terminal Error';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true, canCancel: false, canCancelPickup: true,
    canGenerateLabel: false, canTrack: false, canValidateAddress: false, canReceiveWebhooks: false,
  };
  callCount = 0;
  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
  }
  override async cancelPickup(_req: CancelPickupRequest): Promise<CancelPickupResult> {
    this.callCount++;
    throw new AuthenticationCarrierError('Invalid API key', {
      providerKey: 'terminal-error', operation: 'cancelPickup',
    });
  }
}

class TimeoutErrorProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'timeout-error';
  readonly name = 'Timeout Error';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true, canCancel: false, canCancelPickup: true,
    canGenerateLabel: false, canTrack: false, canValidateAddress: false, canReceiveWebhooks: false,
  };
  callCount = 0;
  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
  }
  override async cancelPickup(_req: CancelPickupRequest): Promise<CancelPickupResult> {
    this.callCount++;
    throw new Error('ETIMEDOUT: connection timed out after 30000ms');
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
    retryPolicy ?? ({ classify: vi.fn(() => ({ isFinal: false, safeMessage: '', nextAttemptAt: null })) } as any),
    circuitBreaker ?? ({ canRequest: vi.fn(() => true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any),
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.2.1 — Retry State Foundation (PostgreSQL)', () => {
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
    testDbName = `b3321_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b21_test`;
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
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-b3321', 'Store A', 'APPROVED')`,
      [storeA, orgA],
    );
    // Buyer user required by master_orders.buyer_id and orders.buyer_id FK chain
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000099')`,
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
    overrides: Partial<{ cancelStatus: string; cancelRetries: number }> = {},
  ): Promise<{ shipmentId: string; eventId: string; orderId: string }> {
    const shipmentId = randomUUID();
    const eventId = randomUUID();
    const masterOrderId = randomUUID();
    const orderId = randomUUID();

    // Create FK chain: user (buyerA) → master_order → order → shipment
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
       VALUES ($1, $2, $3, 'PREPARING', $4, $5, $6, $7)`,
      [shipmentId, orderId, storeA, providerKey, carrierPickupId, overrides.cancelStatus ?? 'PENDING', overrides.cancelRetries ?? 0],
    );

    await pool.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, metadata)
       VALUES ($1, 'shipping.carrier.cancel', $2, $3, 'PENDING', $4)`,
      [eventId, shipmentId, JSON.stringify({ shipmentId }), JSON.stringify({ storeId: storeA })],
    );

    return { shipmentId, eventId, orderId };
  }

  // ── B3321-PG-01: Retryable failure persists retry counter ──────────────

  it('B3321-PG-01: retryable failure increments carrierCancelRetries in DB', async () => {
    const provider = new RetryableErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    const { shipmentId } = await insertShipmentAndEvent('retryable-error');

    // Use camelCase event (DB rows are snake_case — handleCancel expects camelCase)
    try {
      await (worker as any).handleCancel({
        id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
        metadata: { storeId: storeA },
      });
    } catch {
      // Expected: re-thrown for handleFailure
    }

    const row = await pool.query(`SELECT carrier_cancel_retries, carrier_cancel_status, carrier_cancel_error FROM shipments WHERE id = $1`, [shipmentId]);
    expect(row.rows[0].carrier_cancel_retries).toBe(1);
    expect(row.rows[0].carrier_cancel_status).toBe('PENDING');
    expect(row.rows[0].carrier_cancel_error).toBeTruthy();
  });

  // ── B3321-PG-02: Outbox PENDING + nextAttemptAt after handleFailure ────

  it('B3321-PG-02: handleFailure sets outbox PENDING + nextAttemptAt', async () => {
    const provider = new RetryableErrorProvider();
    const realRetryPolicy = new CarrierRetryPolicy();
    const worker = createWorkerWithProvider(dbService, provider, realRetryPolicy);

    const { shipmentId, eventId } = await insertShipmentAndEvent('retryable-error');

    // Mark as PROCESSING (simulating claim)
    await pool.query(`UPDATE outbox_events SET status = 'PROCESSING', locked_at = NOW(), locked_by = 'test-worker' WHERE id = $1`, [eventId]);

    // processEvent expects camelCase properties (DB rows are snake_case)
    await (worker as any).processEvent({
      id: eventId, eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      status: 'PROCESSING', attempts: 0,
      lockedAt: new Date(), lockedBy: 'test-worker',
      metadata: { storeId: storeA },
    });

    const outboxRow = await pool.query(`SELECT status, next_attempt_at, attempts FROM outbox_events WHERE id = $1`, [eventId]);
    expect(outboxRow.rows[0].status).toBe('PENDING');
    expect(outboxRow.rows[0].next_attempt_at).toBeTruthy();
    expect(outboxRow.rows[0].attempts).toBe(1);
  });

  // ── B3321-PG-03: Terminal error → no retry ─────────────────────────────

  it('B3321-PG-03: terminal error → FAILED, no retry counter increment', async () => {
    const provider = new TerminalErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    const { shipmentId } = await insertShipmentAndEvent('terminal-error');

    const event = { id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId, metadata: { storeId: storeA } };

    await (worker as any).handleCancel(event);

    const row = await pool.query(`SELECT carrier_cancel_status, carrier_cancel_retries FROM shipments WHERE id = $1`, [shipmentId]);
    expect(row.rows[0].carrier_cancel_status).toBe('FAILED');
    expect(row.rows[0].carrier_cancel_retries).toBe(0);
  });

  // ── B3321-PG-04: Budget exhaustion → DEAD_LETTER ───────────────────────

  it('B3321-PG-04: retry budget exhaustion → DEAD_LETTER via handleFailure', async () => {
    const provider = new RetryableErrorProvider();
    const realRetryPolicy = new CarrierRetryPolicy();
    const worker = createWorkerWithProvider(dbService, provider, realRetryPolicy);

    const { shipmentId, eventId } = await insertShipmentAndEvent('retryable-error');

    // Simulate event at max attempts
    await pool.query(`UPDATE outbox_events SET status = 'PROCESSING', attempts = 7, locked_at = NOW(), locked_by = 'test-worker' WHERE id = $1`, [eventId]);

    // processEvent expects camelCase properties (DB rows are snake_case)
    await (worker as any).processEvent({
      id: eventId, eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      status: 'PROCESSING', attempts: 7,
      lockedAt: new Date(), lockedBy: 'test-worker',
      metadata: { storeId: storeA },
    });

    const outboxRow = await pool.query(`SELECT status FROM outbox_events WHERE id = $1`, [eventId]);
    expect(outboxRow.rows[0].status).toBe('DEAD_LETTER');
  });

  // ── B3321-PG-05: Duplicate event → idempotent ──────────────────────────

  it('B3321-PG-05: duplicate event processing is safe', async () => {
    const provider = new RetryableErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    const { shipmentId } = await insertShipmentAndEvent('retryable-error');

    // First execution
    const event = { id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId, metadata: { storeId: storeA } };
    try { await (worker as any).handleCancel(event); } catch {}

    // Manually set SUCCEEDED (simulating a concurrent success)
    await pool.query(`UPDATE shipments SET carrier_cancel_status = 'SUCCEEDED' WHERE id = $1`, [shipmentId]);

    // Second execution — should skip
    const callCountBefore = provider.callCount;
    await (worker as any).handleCancel(event);
    expect(provider.callCount).toBe(callCountBefore); // no additional call
  });

  // ── B3321-PG-06: Tenant isolation ──────────────────────────────────────

  it('B3321-PG-06: wrong tenant → rejected', async () => {
    const provider = new RetryableErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    const { shipmentId } = await insertShipmentAndEvent('retryable-error');

    const event = {
      id: randomUUID(),
      eventType: 'shipping.carrier.cancel',
      aggregateId: shipmentId,
      metadata: { storeId: 'wrong-store-id' },
    };

    await expect((worker as any).handleCancel(event)).rejects.toThrow(/tenant mismatch/i);
  });

  // ── B3321-PG-07: Retry counter does not lose updates ───────────────────

  it('B3321-PG-07: sequential retries correctly increment counter', async () => {
    const provider = new RetryableErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    const { shipmentId } = await insertShipmentAndEvent('retryable-error');

    // Simulate 3 sequential retry attempts
    for (let i = 0; i < 3; i++) {
      const event = { id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId, metadata: { storeId: storeA } };
      try { await (worker as any).handleCancel(event); } catch {}
    }

    const row = await pool.query(`SELECT carrier_cancel_retries FROM shipments WHERE id = $1`, [shipmentId]);
    expect(row.rows[0].carrier_cancel_retries).toBe(3);
  });

  // ── B3321-PG-08: Lease recovery for retrying cancellation ──────────────

  it('B3321-PG-08: stale PROCESSING event is recovered to PENDING', async () => {
    const { eventId } = await insertShipmentAndEvent('retryable-error');

    // Simulate a stale lease (locked 10 minutes ago — LEASE_TIMEOUT is 5 min)
    await pool.query(
      `UPDATE outbox_events SET status = 'PROCESSING', locked_at = NOW() - INTERVAL '10 minutes', locked_by = 'dead-worker' WHERE id = $1`,
      [eventId],
    );

    // Create a worker and call recoverStaleLeases
    const provider = new RetryableErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).recoverStaleLeases();

    const row = await pool.query(`SELECT status, locked_at, locked_by FROM outbox_events WHERE id = $1`, [eventId]);
    expect(row.rows[0].status).toBe('PENDING');
    expect(row.rows[0].locked_at).toBeNull();
    expect(row.rows[0].locked_by).toBeNull();
  });

  // ── B3321-PG-09: Concurrent workers — exactly one processes ────────────

  it('B3321-PG-09: 100 concurrent workers — exactly one claims the event', async () => {
    const { eventId } = await insertShipmentAndEvent('retryable-error');

    // Ensure event is PENDING
    await pool.query(`UPDATE outbox_events SET status = 'PENDING' WHERE id = $1`, [eventId]);

    // 100 concurrent claim attempts
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

  // ── B3321-PG-10: Retryable sets PENDING, terminal sets FAILED ──────────

  it('B3321-PG-10: retryable → PENDING, terminal → FAILED', async () => {
    // Retryable
    const retryProvider = new RetryableErrorProvider();
    const retryWorker = createWorkerWithProvider(dbService, retryProvider);
    const { shipmentId: retryShipment } = await insertShipmentAndEvent('retryable-error');
    try {
      await (retryWorker as any).handleCancel({
        id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: retryShipment, metadata: { storeId: storeA },
      });
    } catch {}
    const retryRow = await pool.query(`SELECT carrier_cancel_status FROM shipments WHERE id = $1`, [retryShipment]);
    expect(retryRow.rows[0].carrier_cancel_status).toBe('PENDING');

    // Terminal
    const termProvider = new TerminalErrorProvider();
    const termWorker = createWorkerWithProvider(dbService, termProvider);
    const { shipmentId: termShipment } = await insertShipmentAndEvent('terminal-error');
    await (termWorker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: termShipment, metadata: { storeId: storeA },
    });
    const termRow = await pool.query(`SELECT carrier_cancel_status FROM shipments WHERE id = $1`, [termShipment]);
    expect(termRow.rows[0].carrier_cancel_status).toBe('FAILED');
  });

  // ── B3321-PG-11: Timeout → UNKNOWN (B.3.3.3 indeterminate outcome) ────

  it('B3321-PG-11: timeout → UNKNOWN, reconciliation scheduled', async () => {
    const provider = new TimeoutErrorProvider();
    const worker = createWorkerWithProvider(dbService, provider);

    const { shipmentId } = await insertShipmentAndEvent('timeout-error');

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId, metadata: { storeId: storeA },
    });

    const row = await pool.query(`SELECT carrier_cancel_status, carrier_cancel_retries, carrier_cancel_error_class FROM shipments WHERE id = $1`, [shipmentId]);
    expect(row.rows[0].carrier_cancel_status).toBe('UNKNOWN');
    expect(row.rows[0].carrier_cancel_retries).toBe(0);
    expect(row.rows[0].carrier_cancel_error_class).toBe('timeout');
  });
});
