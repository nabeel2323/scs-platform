/**
 * M7.3-B.3.3.3 — Carrier HTTP Transport Failure Tests
 *
 * Verifies the worker's error classification for different HTTP transport
 * failures against real PostgreSQL. Each test creates a shipment in IN_PROGRESS
 * cancel state, invokes the worker's handleCancel with a provider that throws
 * a specific transport error, and verifies the resulting shipment state.
 *
 * Covers (minimum 5):
 *   B333-HTTP-01  timeout → UNKNOWN + CANCEL_TIMEOUT
 *   B333-HTTP-02  connection reset (ECONNRESET) → UNKNOWN + CANCEL_UNKNOWN
 *   B333-HTTP-03  aborted → UNKNOWN + CANCEL_UNKNOWN
 *   B333-HTTP-04  DNS failure (ENOTFOUND) → retryable (NOT UNKNOWN)
 *   B333-HTTP-05  response lost after carrier processing → UNKNOWN
 *   B333-HTTP-06  ECONNABORTED → UNKNOWN + CANCEL_UNKNOWN
 *   B333-HTTP-07  socket hang up → UNKNOWN + CANCEL_UNKNOWN
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

// ── Provider Stubs — each throws a specific transport error ─────────────────

function makeThrowingProvider(key: string, errorMsg: string): ShippingProvider {
  const provider = new (class extends ShippingProvider {
    readonly type = 'CARRIER' as const;
    readonly key = key;
    readonly name = key;
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
      throw new Error(errorMsg);
    }
  })();
  return provider;
}

// DNS failure provider — throws ENOTFOUND which is NOT indeterminate
class DnsFailureProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'dns-failure';
  readonly name = 'DNS Failure';
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
    throw new Error('getaddrinfo ENOTFOUND api.aramex.com');
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
    { classify: vi.fn(() => ({ isFinal: false, safeMessage: '', nextAttemptAt: null })) } as any,
    { canRequest: vi.fn(() => true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.3.3 — Carrier HTTP Transport Failure Classification', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let adminPool: Pool;
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let dbService: DatabaseService;
  let testDbName: string;

  const FALLBACK_PG_HOST = process.env['TEST_PG_HOST'] ?? 'localhost';
  const FALLBACK_PG_PORT = parseInt(process.env['TEST_PG_PORT'] ?? '15432', 10);
  const FALLBACK_PG_USER = process.env['TEST_PG_USER'] ?? 'scs';
  const FALLBACK_PG_PASSWORD = process.env['TEST_PG_PASSWORD'] ?? 'scs_dev_2026';

  const orgA = randomUUID();
  const merchantA = randomUUID();
  const buyerA = randomUUID();
  const storeA = randomUUID();

  beforeAll(async () => {
    testDbName = `b333http_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b333http_test`;
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

    const rolesRes = await pool.query('SELECT id, key FROM roles');
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    await pool.query(
      `INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`,
      [orgA],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+966500000001')`,
      [merchantA],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000099')`,
      [buyerA],
    );
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-http', 'Store A', 'APPROVED')`,
      [storeA, orgA],
    );
  }, 180_000);

  afterAll(async () => {
    try { await pool?.query(`DROP DATABASE IF EXISTS ${testDbName}`); } catch {}
    await pool?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`).catch(() => {});
    await adminPool?.end();
    if (container) await container.stop();
  });

  async function createShipmentForHttpTest(providerKey: string): Promise<string> {
    const orderId = randomUUID();
    const masterOrderId = randomUUID();
    const shipmentId = randomUUID();

    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at) VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`,
      [masterOrderId, buyerA],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`,
      [orderId, masterOrderId, storeA, buyerA],
    );
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, shipping_provider_key, carrier_pickup_id, carrier_create_status, carrier_cancel_status, carrier_cancel_idempotency_key, created_at, updated_at)
       VALUES ($1, $2, $3, 'PREPARING', $4, 'PU-HTTP', 'SUCCESS', 'IN_PROGRESS', $5, NOW(), NOW())`,
      [shipmentId, orderId, storeA, providerKey, `carrier-cancel:${shipmentId}`],
    );
    return shipmentId;
  }

  async function getShipmentCancelState(shipmentId: string) {
    const row = await pool.query(
      `SELECT carrier_cancel_status, recovery_status, carrier_cancel_error_class, carrier_cancel_retries, next_reconciliation_at FROM shipments WHERE id = $1`,
      [shipmentId],
    );
    return row.rows[0];
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-01: timeout → UNKNOWN + CANCEL_TIMEOUT
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-01: timeout → UNKNOWN + CANCEL_TIMEOUT', async () => {
    const provider = makeThrowingProvider('http-timeout', 'connection timeout after 30000ms');
    const shipmentId = await createShipmentForHttpTest('http-timeout');
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      metadata: { storeId: storeA },
    });

    const state = await getShipmentCancelState(shipmentId);
    expect(state.carrier_cancel_status).toBe('UNKNOWN');
    expect(state.recovery_status).toBe('CANCEL_TIMEOUT');
    expect(state.next_reconciliation_at).not.toBeNull();
    expect(state.carrier_cancel_retries).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-02: ECONNRESET → UNKNOWN + CANCEL_UNKNOWN
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-02: ECONNRESET → UNKNOWN + CANCEL_UNKNOWN', async () => {
    const provider = makeThrowingProvider('http-econnreset', 'read ECONNRESET');
    const shipmentId = await createShipmentForHttpTest('http-econnreset');
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      metadata: { storeId: storeA },
    });

    const state = await getShipmentCancelState(shipmentId);
    expect(state.carrier_cancel_status).toBe('UNKNOWN');
    expect(state.recovery_status).toBe('CANCEL_UNKNOWN');
    expect(state.next_reconciliation_at).not.toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-03: aborted → UNKNOWN + CANCEL_UNKNOWN
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-03: aborted → UNKNOWN + CANCEL_UNKNOWN', async () => {
    const provider = makeThrowingProvider('http-aborted', 'request aborted by peer');
    const shipmentId = await createShipmentForHttpTest('http-aborted');
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      metadata: { storeId: storeA },
    });

    const state = await getShipmentCancelState(shipmentId);
    expect(state.carrier_cancel_status).toBe('UNKNOWN');
    expect(state.recovery_status).toBe('CANCEL_UNKNOWN');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-04: DNS failure → retryable (NOT UNKNOWN)
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-04: DNS failure (ENOTFOUND) → NOT UNKNOWN (retryable path)', async () => {
    const provider = new DnsFailureProvider();
    const shipmentId = await createShipmentForHttpTest('dns-failure');
    const worker = createWorkerWithProvider(dbService, provider);

    // DNS failure is classified as retryable → worker re-throws for outbox retry
    let thrownError: any;
    try {
      await (worker as any).handleCancel({
        id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
        metadata: { storeId: storeA },
      });
    } catch (err: any) {
      thrownError = err;
    }
    expect(thrownError).toBeTruthy();
    expect(thrownError.message).toContain('ENOTFOUND');

    const state = await getShipmentCancelState(shipmentId);
    // DNS failure is NOT indeterminate — should NOT be UNKNOWN
    expect(state.carrier_cancel_status).not.toBe('UNKNOWN');
    // Retryable error: worker resets to PENDING for outbox retry
    expect(state.carrier_cancel_status).toBe('PENDING');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-05: response lost after carrier processing → UNKNOWN
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-05: socket hang up (response lost) → UNKNOWN', async () => {
    const provider = makeThrowingProvider('http-hangup', 'socket hang up');
    const shipmentId = await createShipmentForHttpTest('http-hangup');
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      metadata: { storeId: storeA },
    });

    const state = await getShipmentCancelState(shipmentId);
    expect(state.carrier_cancel_status).toBe('UNKNOWN');
    expect(state.recovery_status).toBe('CANCEL_UNKNOWN');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-06: ECONNABORTED → UNKNOWN + CANCEL_UNKNOWN
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-06: ECONNABORTED → UNKNOWN + CANCEL_UNKNOWN', async () => {
    const provider = makeThrowingProvider('http-econnaborted', 'socket ECONNABORTED');
    const shipmentId = await createShipmentForHttpTest('http-econnaborted');
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      metadata: { storeId: storeA },
    });

    const state = await getShipmentCancelState(shipmentId);
    expect(state.carrier_cancel_status).toBe('UNKNOWN');
    expect(state.recovery_status).toBe('CANCEL_UNKNOWN');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  HTTP-07: ETIMEDOUT → UNKNOWN + CANCEL_TIMEOUT
  // ═══════════════════════════════════════════════════════════════════

  it('B333-HTTP-07: ETIMEDOUT → UNKNOWN + CANCEL_TIMEOUT', async () => {
    const provider = makeThrowingProvider('http-etimedout', 'ETIMEDOUT: connection timed out after 30000ms');
    const shipmentId = await createShipmentForHttpTest('http-etimedout');
    const worker = createWorkerWithProvider(dbService, provider);

    await (worker as any).handleCancel({
      id: randomUUID(), eventType: 'shipping.carrier.cancel', aggregateId: shipmentId,
      metadata: { storeId: storeA },
    });

    const state = await getShipmentCancelState(shipmentId);
    expect(state.carrier_cancel_status).toBe('UNKNOWN');
    expect(state.recovery_status).toBe('CANCEL_TIMEOUT');
    expect(state.carrier_cancel_error_class).toBe('timeout');
  });
});
