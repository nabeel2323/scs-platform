/**
 * M7.3-B.3.4 — Tracking/Cancellation Race Closure + Delivered-After-Cancel:
 * PostgreSQL Integration Tests
 *
 * Runs against real PostgreSQL (Testcontainers, with a documented fallback to a
 * local PG) using the real claim SQL, the real shipment_events UNIQUE dedup index
 * and the real reconciliation claim queries.
 *
 * Locked gate (minimum 3):
 *   B34-PG-01  exception event is persisted
 *   B34-PG-02  carrier_status_mapped does NOT advance
 *   B34-PG-03  order remains CANCELLED
 *
 * Additional locked concurrency / idempotency coverage (§9, §10):
 *   B34-PG-04  all three CASE B statuses are detected in SQL
 *   B34-PG-05  repeated carrier DELIVERED — one exception row (UNIQUE dedup)
 *   B34-PG-06  carrier_cancel_status is not mutated by exception recording
 *   B34-PG-07  concurrent pollers — single claim, single exception row
 *   B34-PG-08  cancellation vs tracking race — invariants hold
 *   B34-PG-09  reconciliation vs tracking race — audit survives
 *   B34-PG-10  create reconciliation running does NOT block cancel reconciliation
 *   B34-PG-11  cancel reconciliation running does NOT block create reconciliation
 *   B34-PG-12  C5 guard: SUCCEEDED / NOT_REQUIRED are never polled (CASE A)
 *   B34-PG-13  normal non-cancelled DELIVERED still advances + invokes the bridge
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from '../../modules/shipping/shipping-registry';
import { ShippingProvider } from '../../modules/shipping/shipping-provider';
import { CarrierReconciliationService } from '../../modules/shipping/carrier-reconciliation.service';
import { CarrierTrackingPoller } from '../../modules/shipping/carrier-tracking-poller';
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
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
  }
}

// ── Provider stub ───────────────────────────────────────────────────────────

/**
 * Single stub keyed 'aramex' (the poller falls back to 'aramex' when it reads a
 * raw snake_case row, so every seeded shipment uses that provider key).
 * `trackingStatus` is mutable so a test can flip the carrier's answer mid-race.
 */
class StubCarrierProvider extends ShippingProvider {
  readonly type = 'CARRIER' as const;
  readonly key = 'aramex';
  readonly name = 'B34 Stub Carrier';
  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true, canCancel: false, canCancelPickup: true,
    canGenerateLabel: false, canTrack: true, canValidateAddress: false, canReceiveWebhooks: false,
  };
  trackingCalls = 0;
  cancelCalls = 0;
  /**
   * Fixed per provider instance so repeated polls of the same shipment produce
   * the same tracking fingerprint and dedup against the UNIQUE index — that is
   * what makes the repeat-poll idempotency test meaningful.
   */
  readonly eventTimestamp = new Date().toISOString();
  constructor(public trackingStatus: string | null = 'DELIVERED') {
    super();
  }
  async createShipment(_r: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return { providerKey: this.key };
  }
  override async cancelPickup(_req: CancelPickupRequest): Promise<CancelPickupResult> {
    this.cancelCalls++;
    return { supported: true, cancelled: true, carrierStatus: 'CANCELLED' };
  }
  override async getTrackingInfo(trackingId: string) {
    this.trackingCalls++;
    if (this.trackingStatus === null) return null;
    return {
      trackingId,
      status: this.trackingStatus,
      events: [
        {
          timestamp: this.eventTimestamp,
          status: this.trackingStatus,
          carrierStatus: 'SH014',
          location: 'Riyadh',
          description: `${this.trackingStatus} scan`,
        },
      ],
    };
  }
}

// ── Wiring helpers ──────────────────────────────────────────────────────────

function makeDbService(pool: Pool, db: any): DatabaseService {
  const svc = Object.create(DatabaseService.prototype);
  svc.pool = pool;
  svc.db = db;
  return svc;
}

function createPoller(
  dbService: DatabaseService,
  provider: ShippingProvider,
  processCarrierDelivery = vi.fn().mockResolvedValue(true),
) {
  const registry = new ShippingProviderRegistry();
  registry.register(provider);
  const poller = new (CarrierTrackingPoller as any)(
    dbService,
    registry,
    { incrementCounter: vi.fn(), generateCorrelationId: vi.fn().mockReturnValue('corr-b34') } as any,
    { canRequest: vi.fn(() => true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
    { processCarrierDelivery } as any,
  );
  return { poller, processCarrierDelivery };
}

function createReconService(dbService: DatabaseService, provider: ShippingProvider) {
  const registry = new ShippingProviderRegistry();
  registry.register(provider);
  return new (CarrierReconciliationService as any)(
    dbService,
    registry,
    { incrementCounter: vi.fn() } as any,
    { canRequest: vi.fn(() => true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
    { tryResolve: vi.fn(async () => null) } as any,
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.4 — Delivered-After-Cancel + Mutex Separation (PostgreSQL)', () => {
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
  const buyerA = randomUUID();
  const storeA = randomUUID();
  const warehouseA = randomUUID();
  const productA = randomUUID();
  const variantA = randomUUID();
  const inventoryItemId = randomUUID();

  beforeAll(async () => {
    testDbName = `b34_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b34_test`;
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
    try {
      await seedPlatformRbac(client);
    } finally {
      client.release();
    }

    const rolesRes = await pool.query('SELECT id, key FROM roles');
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    await pool.query(
      `INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`,
      [orgA],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000099')`,
      [buyerA],
    );
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgA, buyerA, roleById.get('MERCHANT_OWNER')],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-b34', 'Store A', 'APPROVED')`,
      [storeA, orgA],
    );
    await pool.query(
      `INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, 'Main WH')`,
      [warehouseA, storeA],
    );
    await pool.query(
      `INSERT INTO products (id, store_id, slug, title, status) VALUES ($1, $2, 'b34-product', 'B34 Product', 'ACTIVE')`,
      [productA, storeA],
    );
    await pool.query(
      `INSERT INTO product_variants (id, product_id, sku) VALUES ($1, $2, 'B34-SKU')`,
      [variantA, productA],
    );
    await pool.query(
      `INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved) VALUES ($1, $2, $3, 100, 10)`,
      [inventoryItemId, variantA, warehouseA],
    );
  }, 240_000);

  afterAll(async () => {
    try { await pool?.query(`DROP DATABASE IF EXISTS ${testDbName}`); } catch {}
    await pool?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`).catch(() => {});
    await adminPool?.end();
    if (container) await container.stop();
  });

  // ── Fixture ───────────────────────────────────────────────────────────────

  interface SeedOpts {
    orderStatus?: string;
    shipmentStatus?: string;
    cancelStatus?: string | null;
    carrierStatusMapped?: string | null;
    createStatus?: string;
    cancelRetries?: number;
    nextReconciliationAt?: Date | null;
    recoveryStatus?: string | null;
    staleSync?: boolean;
  }

  /** users → master_orders → orders → shipments (FK chain must exist in order). */
  async function seedShipment(opts: SeedOpts = {}): Promise<string> {
    const orderId = randomUUID();
    const masterOrderId = randomUUID();
    const shipmentId = randomUUID();

    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at)
       VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`,
      [masterOrderId, buyerA],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method,
                           subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor,
                           currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PLATFORM_DELIVERY', 5000, 750, 1000, 0, 6750, 'SAR', NOW(), NOW())`,
      [orderId, masterOrderId, storeA, buyerA, opts.orderStatus ?? 'CANCELLED'],
    );
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, status, shipping_provider_key,
                              carrier_pickup_id, carrier_tracking_id, carrier_create_status,
                              carrier_cancel_status, carrier_cancel_idempotency_key,
                              carrier_cancel_attempted_at, carrier_cancel_retries,
                              carrier_status_mapped, recovery_status, next_reconciliation_at,
                              last_carrier_sync_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'aramex', 'PU-B34', $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        shipmentId,
        orderId,
        storeA,
        opts.shipmentStatus ?? 'PREPARING',
        `TRACK-${shipmentId.slice(0, 8)}`,
        opts.createStatus ?? 'SUCCESS',
        // Explicit null must mean "no cancellation in flight" — `??` would turn it
        // into 'UNKNOWN' and silently make the row a cancel-reconciliation target.
        opts.cancelStatus === undefined ? 'UNKNOWN' : opts.cancelStatus,
        `carrier-cancel:${shipmentId}`,
        opts.cancelRetries ?? 0,
        opts.carrierStatusMapped === undefined ? 'OUT_FOR_DELIVERY' : opts.carrierStatusMapped,
        opts.recoveryStatus ?? null,
        opts.nextReconciliationAt !== undefined ? opts.nextReconciliationAt : new Date(),
        opts.staleSync
          ? new Date(Date.now() - 11 * 60 * 1000)
          : null,
      ],
    );
    return shipmentId;
  }

  async function readShipment(shipmentId: string) {
    const res = await pool.query(
      `SELECT carrier_cancel_status, carrier_status_mapped, carrier_status_raw, status,
              recovery_status, last_carrier_sync_at, updated_at
       FROM shipments WHERE id = $1`,
      [shipmentId],
    );
    return res.rows[0];
  }

  async function exceptionEvents(shipmentId: string) {
    const res = await pool.query(
      `SELECT id, event_type, actor_type, notes, external_event_id, carrier_event_code, metadata
       FROM shipment_events
       WHERE shipment_id = $1 AND carrier_event_code = 'DELIVERED_AFTER_CANCEL'
       ORDER BY sequence`,
      [shipmentId],
    );
    return res.rows;
  }

  /**
   * Park every OTHER shipment so a claim query can only pick the rows this test
   * cares about. Both claim queries honour `next_reconciliation_at <= NOW()`, and
   * the create claim additionally keys off carrier_create_status — which the
   * fixture leaves at 'SUCCESS' for everything except explicit create cases.
   */
  async function parkOtherShipments(activeIds: string[]) {
    await pool.query(
      `UPDATE shipments
       SET next_reconciliation_at = NOW() + INTERVAL '1 day'
       WHERE id <> ALL($1::uuid[])
         AND (carrier_cancel_status IN ('UNKNOWN', 'RECONCILIATION_REQUIRED')
              OR carrier_create_status IN ('PENDING', 'IN_PROGRESS'))`,
      [activeIds],
    );
    await pool.query(
      `UPDATE shipments
       SET carrier_create_status = 'SUCCESS'
       WHERE id <> ALL($1::uuid[]) AND carrier_create_status = 'RECOVERY_REQUIRED'`,
      [activeIds],
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  Locked PG Gate
  // ═══════════════════════════════════════════════════════════════

  it('B34-PG-01: exception event is persisted in shipment_events', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const { poller } = createPoller(dbService, new StubCarrierProvider('DELIVERED'));

    await poller.poll();

    const events = await exceptionEvents(shipmentId);
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.external_event_id).toBe(`dac-${shipmentId}`);
    expect(ev.event_type).toBe('CARRIER_TRACKING');
    expect(ev.actor_type).toBe('CARRIER');
    expect(ev.notes).toBe('Carrier reports DELIVERED after SCS cancellation');
    expect(ev.metadata.carrierStatus).toBe('DELIVERED');
    expect(ev.metadata.carrierCancelStatus).toBe('UNKNOWN');
    expect(ev.metadata.exception).toBe('DELIVERED_AFTER_CANCEL');

    // Recovery token raised so the shipment surfaces in the admin recovery queue.
    const ship = await readShipment(shipmentId);
    expect(ship.recovery_status).toBe('DELIVERED_AFTER_CANCEL');
  });

  it('B34-PG-02: carrier_status_mapped does NOT advance on delivered-after-cancel', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const before = await readShipment(shipmentId);
    const { poller } = createPoller(dbService, new StubCarrierProvider('DELIVERED'));

    await poller.poll();

    const after = await readShipment(shipmentId);
    expect(after.carrier_status_mapped).toBe(before.carrier_status_mapped);
    expect(after.carrier_status_mapped).not.toBe('DELIVERED');
    expect(after.carrier_status_raw).toBeNull();
    // shipment.status must not move to DELIVERED either.
    expect(after.status).toBe('PREPARING');
  });

  it('B34-PG-03: order remains CANCELLED and no inventory SALE is settled', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const provider = new StubCarrierProvider('DELIVERED');
    const { poller, processCarrierDelivery } = createPoller(dbService, provider);

    await poller.poll();

    const order = await pool.query(
      `SELECT o.status AS order_status, m.status AS master_status
       FROM shipments s JOIN orders o ON o.id = s.order_id
       JOIN master_orders m ON m.id = o.master_order_id WHERE s.id = $1`,
      [shipmentId],
    );
    // FSM invariant: a CANCELLED order cannot be resurrected by a carrier scan.
    expect(order.rows[0].order_status).toBe('CANCELLED');
    expect(order.rows[0].master_status).toBe('ACCEPTED');

    const movements = await pool.query(
      `SELECT count(*)::int AS c FROM stock_movements WHERE movement_type = 'SALE'`,
    );
    expect(movements.rows[0].c).toBe(0);

    const inv = await pool.query(
      `SELECT qty_on_hand, qty_reserved FROM inventory_items WHERE id = $1`,
      [inventoryItemId],
    );
    expect(inv.rows[0].qty_on_hand).toBe(100);
    expect(inv.rows[0].qty_reserved).toBe(10);

    expect(processCarrierDelivery).not.toHaveBeenCalled();
    const events = await exceptionEvents(shipmentId);
    expect(events).toHaveLength(1);
  });

  // ═══════════════════════════════════════════════════════════════
  //  CASE B coverage + idempotency
  // ═══════════════════════════════════════════════════════════════

  it('B34-PG-04: every CASE B cancel status is detected against real SQL', async () => {
    for (const cancelStatus of ['UNKNOWN', 'RECONCILIATION_REQUIRED', 'FAILED']) {
      const shipmentId = await seedShipment({ cancelStatus });
      const { poller } = createPoller(dbService, new StubCarrierProvider('DELIVERED'));

      await poller.poll();

      const events = await exceptionEvents(shipmentId);
      expect(events.map((e) => e.metadata.carrierCancelStatus)).toEqual([cancelStatus]);
      const ship = await readShipment(shipmentId);
      expect(ship.recovery_status).toBe('DELIVERED_AFTER_CANCEL');
    }
  });

  it('B34-PG-05: repeated carrier DELIVERED produces exactly one exception row', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const provider = new StubCarrierProvider('DELIVERED');

    // Three poll cycles, each forced past the 10-minute poll throttle.
    for (let cycle = 0; cycle < 3; cycle++) {
      const { poller } = createPoller(dbService, provider);
      await poller.poll();
      await pool.query(
        `UPDATE shipments SET last_carrier_sync_at = NOW() - INTERVAL '11 minutes' WHERE id = $1`,
        [shipmentId],
      );
    }

    // The partial UNIQUE index uq_shipment_events_external_id absorbs duplicates
    // (PG 23505) — no uncontrolled duplicate exception records, no new schema.
    const events = await exceptionEvents(shipmentId);
    expect(events).toHaveLength(1);
    const allEvents = await pool.query(
      `SELECT count(*)::int AS c FROM shipment_events WHERE shipment_id = $1`,
      [shipmentId],
    );
    // 1 exception row; the 3 raw tracking scans dedup to the same fingerprint.
    expect(allEvents.rows[0].c).toBeLessThanOrEqual(2);

    const ship = await readShipment(shipmentId);
    expect(ship.recovery_status).toBe('DELIVERED_AFTER_CANCEL');
    expect(ship.carrier_status_mapped).toBe('OUT_FOR_DELIVERY');
  });

  it('B34-PG-06: exception recording does not mutate carrier_cancel_status', async () => {
    for (const cancelStatus of ['UNKNOWN', 'RECONCILIATION_REQUIRED', 'FAILED']) {
      const shipmentId = await seedShipment({ cancelStatus });
      const { poller } = createPoller(dbService, new StubCarrierProvider('DELIVERED'));

      await poller.poll();

      const ship = await readShipment(shipmentId);
      // §6: the cancellation state machine is untouched — no auto re-cancel,
      // no automatic UNKNOWN → PENDING.
      expect(ship.carrier_cancel_status).toBe(cancelStatus);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  Concurrency
  // ═══════════════════════════════════════════════════════════════

  it('B34-PG-07: concurrent pollers — one claim, one exception row', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const provider = new StubCarrierProvider('DELIVERED');
    const a = createPoller(dbService, provider);
    const b = createPoller(dbService, provider);

    await Promise.all([a.poller.poll(), b.poller.poll()]);

    const events = await exceptionEvents(shipmentId);
    expect(events).toHaveLength(1);
    const ship = await readShipment(shipmentId);
    expect(ship.carrier_status_mapped).toBe('OUT_FOR_DELIVERY');
    expect(ship.recovery_status).toBe('DELIVERED_AFTER_CANCEL');
  });

  it('B34-PG-08: cancellation vs tracking race — order/invariant safety holds', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    await parkOtherShipments([shipmentId]);
    // The carrier reports DELIVERED to the poller while the cancel path is being
    // executed by the worker — the real Race M from the audit.
    const provider = new StubCarrierProvider('DELIVERED');
    const { poller, processCarrierDelivery } = createPoller(dbService, provider);

    await Promise.allSettled([
      poller.poll(),
      (async () => {
        // Direct cancel resolution path (what the worker does on carrier success).
        const service = createReconService(dbService, new StubCarrierProvider('CANCELLED'));
        return service.reconcileCancelShipment({
          id: shipmentId,
          carrier_cancel_status: 'UNKNOWN',
          carrier_cancel_attempted_at: new Date(),
          carrier_cancel_retries: 0,
          carrier_tracking_id: 'TRACK-RACE',
          shipping_provider_key: 'aramex',
        });
      })(),
    ]);

    const ship = await readShipment(shipmentId);
    const events = await exceptionEvents(shipmentId);

    // Whichever path wins, the shipment must never be delivered and the order
    // must never be resurrected.
    expect(ship.status).toBe('PREPARING');
    expect(ship.carrier_status_mapped).not.toBe('DELIVERED');
    expect(['SUCCEEDED', 'UNKNOWN', 'RECONCILIATION_REQUIRED']).toContain(
      ship.carrier_cancel_status,
    );
    // Never more than one exception row, and never an uncontrolled duplicate.
    expect(events.length).toBeLessThanOrEqual(1);
    expect(processCarrierDelivery).not.toHaveBeenCalled();

    const order = await pool.query(
      `SELECT o.status FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = $1`,
      [shipmentId],
    );
    expect(order.rows[0].status).toBe('CANCELLED');
  });

  it('B34-PG-09: reconciliation vs tracking race — audit record survives', async () => {
    const shipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    await parkOtherShipments([shipmentId]);
    // Same carrier answer for both paths: DELIVERED. Reconciliation cannot
    // confirm a cancellation, so it defers; the poller records the anomaly.
    const provider = new StubCarrierProvider('DELIVERED');
    const recon = createReconService(dbService, provider);
    const { poller } = createPoller(dbService, provider);

    await Promise.all([recon.reconcileCancel(), poller.poll()]);

    // Under FOR UPDATE SKIP LOCKED one worker may legitimately skip the row while
    // the other holds it — the requirement is that duplicates never appear.
    const raced = await exceptionEvents(shipmentId);
    expect(raced.length).toBeLessThanOrEqual(1);

    // A follow-up poll cycle must record it: the race can delay the anomaly,
    // never lose it.
    await pool.query(
      `UPDATE shipments SET last_carrier_sync_at = NOW() - INTERVAL '11 minutes' WHERE id = $1`,
      [shipmentId],
    );
    await createPoller(dbService, new StubCarrierProvider('DELIVERED')).poller.poll();

    const events = await exceptionEvents(shipmentId);
    expect(events).toHaveLength(1);

    const ship = await readShipment(shipmentId);
    expect(ship.carrier_status_mapped).toBe('OUT_FOR_DELIVERY');
    expect(ship.carrier_cancel_status).toBe('UNKNOWN');
  });

  // ═══════════════════════════════════════════════════════════════
  //  Mutex separation (BD-3.4-10) against a real database
  // ═══════════════════════════════════════════════════════════════

  /**
   * Hold the first claim query (CREATE cycle) open until the test releases it,
   * so the CANCEL cycle demonstrably starts while the CREATE cycle is in flight.
   */
  async function withHeldFirstCycle(
    run: (release: () => void) => Promise<void>,
  ): Promise<void> {
    const realExecute = dbService.db.execute.bind(dbService.db);
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (dbService.db as any).execute = async (query: any) => {
      // Capture the index BEFORE awaiting — a second concurrent cycle would
      // otherwise bump `n` and let the first cycle escape the gate.
      const myCall = ++n;
      const result = await (realExecute as any)(query);
      if (myCall === 1) await gate;
      return result;
    };
    try {
      await run(release);
    } finally {
      (dbService.db as any).execute = realExecute;
    }
  }

  it('B34-PG-10: create reconciliation in flight does NOT block cancel reconciliation', async () => {
    const cancelShipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const createShipmentId = await seedShipment({
      cancelStatus: null,
      createStatus: 'RECOVERY_REQUIRED',
      carrierStatusMapped: null,
    });
    await parkOtherShipments([cancelShipmentId, createShipmentId]);
    const provider = new StubCarrierProvider('CANCELLED');
    const service = createReconService(dbService, provider);

    await withHeldFirstCycle(async (release) => {
      const createCycle = service.reconcile();
      await Promise.resolve();
      expect(service['runningCreate']).toBe(true);

      // Must proceed even though the CREATE cycle is still in flight.
      const cancelResults = await service.reconcileCancel();
      expect(cancelResults.map((r: any) => r.shipmentId)).toContain(cancelShipmentId);
      expect(service['runningCreate']).toBe(true);

      release();
      const createResults = await createCycle;
      expect(createResults.map((r: any) => r.shipmentId)).toContain(createShipmentId);
    });

    expect(service['runningCreate']).toBe(false);
    expect(service['runningCancel']).toBe(false);

    const ship = await readShipment(cancelShipmentId);
    expect(ship.carrier_cancel_status).toBe('SUCCEEDED');
  });

  it('B34-PG-11: cancel reconciliation in flight does NOT block create reconciliation', async () => {
    const cancelShipmentId = await seedShipment({ cancelStatus: 'UNKNOWN' });
    const createShipmentId = await seedShipment({
      cancelStatus: null,
      createStatus: 'RECOVERY_REQUIRED',
      carrierStatusMapped: null,
    });
    await parkOtherShipments([cancelShipmentId, createShipmentId]);
    const provider = new StubCarrierProvider('CANCELLED');
    const service = createReconService(dbService, provider);

    await withHeldFirstCycle(async (release) => {
      const cancelCycle = service.reconcileCancel();
      await Promise.resolve();
      expect(service['runningCancel']).toBe(true);

      const createResults = await service.reconcile();
      expect(createResults.map((r: any) => r.shipmentId)).toContain(createShipmentId);
      expect(service['runningCancel']).toBe(true);

      release();
      await cancelCycle;
    });

    expect(service['runningCreate']).toBe(false);
    expect(service['runningCancel']).toBe(false);
    const ship = await readShipment(cancelShipmentId);
    expect(ship.carrier_cancel_status).toBe('SUCCEEDED');
  });

  // ═══════════════════════════════════════════════════════════════
  //  Preserved existing behavior
  // ═══════════════════════════════════════════════════════════════

  it('B34-PG-12: C5 guard — SUCCEEDED / NOT_REQUIRED shipments are never polled (CASE A)', async () => {
    const succeededId = await seedShipment({ cancelStatus: 'SUCCEEDED' });
    const notRequiredId = await seedShipment({ cancelStatus: 'NOT_REQUIRED' });
    const { poller, processCarrierDelivery } = createPoller(
      dbService,
      new StubCarrierProvider('DELIVERED'),
    );

    await poller.poll();

    const orderIds: string[] = [];
    for (const id of [succeededId, notRequiredId]) {
      const ship = await readShipment(id);
      // Never claimed → throttle still NULL, no state advance, no exception.
      expect(ship.last_carrier_sync_at).toBeNull();
      expect(ship.carrier_status_mapped).toBe('OUT_FOR_DELIVERY');
      expect(ship.recovery_status).toBeNull();
      expect(await exceptionEvents(id)).toHaveLength(0);
      orderIds.push((await pool.query('SELECT order_id FROM shipments WHERE id = $1', [id])).rows[0].order_id);
    }

    // The delivery bridge may legitimately run for other shipments still in the
    // shared database, so assert precisely that neither CASE A order was touched.
    const bridged = processCarrierDelivery.mock.calls.map((c: any[]) => c[0]);
    for (const orderId of orderIds) {
      expect(bridged).not.toContain(orderId);
    }
  });

  it('B34-PG-13: normal non-cancelled DELIVERED still advances and calls the bridge', async () => {
    const shipmentId = await seedShipment({
      cancelStatus: null,
      orderStatus: 'OUT_FOR_DELIVERY',
      shipmentStatus: 'IN_TRANSIT',
    });
    const provider = new StubCarrierProvider('DELIVERED');
    const { poller, processCarrierDelivery } = createPoller(dbService, provider);

    await poller.poll();

    const ship = await readShipment(shipmentId);
    expect(ship.carrier_status_mapped).toBe('DELIVERED');
    expect(ship.recovery_status).toBeNull();
    expect(await exceptionEvents(shipmentId)).toHaveLength(0);
    expect(processCarrierDelivery).toHaveBeenCalledTimes(1);
    // The poller reads order_id / carrier_shipment_id off the raw snake_case row;
    // the fixture never sets carrier_shipment_id, so it arrives as null.
    expect(processCarrierDelivery).toHaveBeenCalledWith(
      expect.any(String),
      null,
      'tracking_poll',
    );
  });
});
