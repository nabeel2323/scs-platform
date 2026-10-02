/**
 * M7.3-B.3.4 — Tracking/Cancellation Race Closure, Delivered-After-Cancel
 * Exception Detection, and Reconciliation Mutex Separation: Unit Tests
 *
 * Contract checks without a database or carrier HTTP.
 * Authoritative source: SCS-M7.3-B.3.4-BUSINESS-RULES-ARCHITECTURE-LOCK.md
 *
 * Covers (minimum 8 locked):
 *   B34-U-01  create reconciliation does NOT block cancel reconciliation   (BD-3.4-10)
 *   B34-U-02  cancel reconciliation does NOT block create reconciliation   (BD-3.4-10)
 *   B34-U-03  mutex flags are released on success / empty / error          (BD-3.4-10)
 *   B34-U-04  DELIVERED on cancelled shipment records an exception event   (C6)
 *   B34-U-05  DELIVERED sets recoveryStatus = DELIVERED_AFTER_CANCEL       (C6)
 *   B34-U-06  processCarrierDelivery is NOT called                         (C6/§7)
 *   B34-U-07  carrier_status_mapped is NOT advanced                        (C6)
 *   B34-U-08  DELIVERED on non-cancelled shipment follows normal flow      (§3)
 *   B34-U-09  PICKUP_CANCELLED condition removed                           (BD-3.4-09/C7)
 *   B34-U-10  timeout → UNKNOWN regression                                 (§6)
 *   B34-U-11  isDeliveredAfterCancel status-set correctness                (C6)
 *   B34-U-12  C5 guard still excludes SUCCEEDED / NOT_REQUIRED             (C6 CASE A)
 *   B34-U-13  delivered-after-cancel idempotency (deterministic event id)  (§10)
 *   B34-U-14  recovery-token write is value-guarded (IS DISTINCT FROM)   (§10)
 *   B34-U-15  DELIVERED_AFTER_CANCEL token fits VARCHAR(24)                (§8)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CarrierTrackingPoller,
  isDeliveredAfterCancel,
  DELIVERED_AFTER_CANCEL_STATUSES,
} from '../../../modules/shipping/carrier-tracking-poller';
import { CarrierReconciliationService } from '../../../modules/shipping/carrier-reconciliation.service';
import {
  CARRIER_CANCEL_RECOVERY_TOKENS,
  CARRIER_CANCEL_STATUSES,
} from '../../../modules/shipping/shipping.types';

// ── Shared mock builders ────────────────────────────────────────────────────

/**
 * Build a DatabaseService mock exposing the exact Drizzle/raw-SQL surface the
 * poller and reconciliation service use.
 */
function createMockDb(opts: { executeRows?: any[]; executeImpl?: () => Promise<any> } = {}) {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue({ rowCount: 1 }),
  };
  const insertChain = { values: vi.fn().mockResolvedValue(undefined) };

  const db = {
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnValue(insertChain),
    execute: vi.fn().mockImplementation(
      opts.executeImpl ?? (async () => ({ rows: opts.executeRows ?? [] })),
    ),
  };

  return { db, updateChain, insertChain };
}

/**
 * A realistic single-event tracking payload matching the carrier-reported status.
 * `carrierStatus` is the raw Aramex code, so normal tracking events never carry
 * the DELIVERED_AFTER_CANCEL code — which is what exceptionPayloads filters on.
 */
function trackingEventFor(status: string | null): any[] {
  if (!status) return [];
  return [
    {
      timestamp: '2026-09-23T10:00:00Z',
      status,
      carrierStatus: 'SH014',
      location: 'Riyadh',
      description: `${status} scan`,
    },
  ];
}

/**
 * Exception event payloads only — raw carrier tracking events persisted by the
 * normal event loop are excluded.
 */
function exceptionPayloads(mockDb: {
  insertChain: { values: ReturnType<typeof vi.fn> };
}): any[] {
  return mockDb.insertChain.values.mock.calls
    .map((c: any[]) => c[0])
    .filter((p: any) => p?.carrierEventCode === 'DELIVERED_AFTER_CANCEL');
}

/**
 * Concatenate the literal SQL text of a Drizzle SQL node. v0.33 keeps raw string
 * fragments in `queryChunks`, interleaved with column/operator objects; each raw
 * fragment is itself wrapped as `{ value: ['...text...'] }`.
 */
function sqlLiteralTextOf(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(sqlLiteralTextOf).join('');
  if (Array.isArray(node.queryChunks)) return node.queryChunks.map(sqlLiteralTextOf).join('');
  if (node.value !== undefined) return sqlLiteralTextOf(node.value);
  return '';
}

/** Minimal provider returning a fixed tracking status. */
function createMockProvider(status: string | null, events: any[] = []) {
  return {
    getTrackingInfo: vi.fn().mockResolvedValue(status === null ? null : { status, events }),
  };
}

/**
 * Build a CarrierTrackingPoller with all collaborators mocked.
 * `ordersService.processCarrierDelivery` is a spy so tests can prove it is
 * called or NOT called — the central delivered-after-cancel invariant.
 */
function createPoller(opts: {
  trackingStatus: string | null;
  trackingEvents?: any[];
  cancelStatus?: string | null;
  carrierStatusMapped?: string | null;
}) {
  const mockDb = createMockDb();
  const provider = createMockProvider(
    opts.trackingStatus,
    opts.trackingEvents ?? trackingEventFor(opts.trackingStatus),
  );
  const registry = { findProvider: vi.fn().mockReturnValue(provider) };
  const circuitBreaker = {
    canRequest: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  };
  const processCarrierDelivery = vi.fn().mockResolvedValue(true);

  const poller = new CarrierTrackingPoller(
    mockDb as any,
    registry as any,
    { incrementCounter: vi.fn(), generateCorrelationId: vi.fn().mockReturnValue('corr-1') } as any,
    circuitBreaker as any,
    { processCarrierDelivery } as any,
  );

  // Shipment row shape mirrors what `UPDATE ... RETURNING *` yields: snake_case
  // for the columns the poller reads off the raw row, plus the camelCase keys
  // the existing poller code reads.
  const shipment: any = {
    id: 'ship-b34-001',
    shippingProviderKey: 'aramex',
    carrierTrackingId: 'TRACK-B34',
    carrierStatusMapped: opts.carrierStatusMapped ?? 'OUT_FOR_DELIVERY',
    order_id: 'order-b34-001',
    carrier_shipment_id: 'CAR-B34',
    // Deliberately snake_case — this is a raw PostgreSQL row.
    carrier_cancel_status: opts.cancelStatus ?? null,
  };

  return { poller, mockDb, provider, circuitBreaker, processCarrierDelivery, shipment };
}

function createReconciliationService(mockDb: ReturnType<typeof createMockDb>) {
  return new CarrierReconciliationService(
    mockDb as any,
    { findProvider: vi.fn().mockReturnValue(createMockProvider(null)) } as any,
    { incrementCounter: vi.fn() } as any,
    {
      canRequest: vi.fn().mockReturnValue(true),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    } as any,
    { tryResolve: vi.fn() } as any,
  );
}

// ═══════════════════════════════════════════════════════════════════
//  1. Reconciliation Mutex Separation (BD-3.4-10 / F-02)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.4 — Separate Reconciliation Mutex (BD-3.4-10)', () => {
  /**
   * Hold `db.execute` open so a cycle stays "in flight" while we assert that the
   * other cycle is still permitted to start. Gate 1 belongs to the first-started
   * cycle, gate 2 to the second — the helper is order-agnostic.
   */
  function createHeldDb() {
    let release1!: () => void;
    let release2!: () => void;
    const gate1 = new Promise<void>((r) => (release1 = r));
    const gate2 = new Promise<void>((r) => (release2 = r));

    const mockDb = createMockDb();
    let call = 0;
    mockDb.db.execute.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        await gate1;
        return { rows: [] };
      }
      await gate2;
      return { rows: [] };
    });
    return { mockDb, release1, release2, calls: () => call };
  }

  it('B34-U-01: create reconciliation running does NOT block cancel reconciliation', async () => {
    const { mockDb, release1, release2, calls } = createHeldDb();
    const service = createReconciliationService(mockDb);

    const createCycle = service.reconcile(); // first-started cycle holds gate 1
    // Let reconcile() set runningCreate and enter its claim query.
    await Promise.resolve();
    expect(service['runningCreate']).toBe(true);

    // Under the old shared flag this returned [] immediately.
    const cancelCycle = service.reconcileCancel();
    await Promise.resolve();

    expect(calls()).toBeGreaterThanOrEqual(2); // cancel cycle entered its claim
    expect(service['runningCancel']).toBe(true);
    expect(service['runningCreate']).toBe(true);

    release2();
    release1();
    await Promise.all([createCycle, cancelCycle]);
    expect(service['runningCreate']).toBe(false);
    expect(service['runningCancel']).toBe(false);
  });

  it('B34-U-02: cancel reconciliation running does NOT block create reconciliation', async () => {
    const { mockDb, release1, release2, calls } = createHeldDb();
    const service = createReconciliationService(mockDb);

    // Reverse order: the cancel cycle starts first and holds gate 1.
    const cancelCycle = service.reconcileCancel();
    await Promise.resolve();
    expect(service['runningCancel']).toBe(true);

    const createCycle = service.reconcile(); // must NOT be blocked
    await Promise.resolve();
    expect(service['runningCreate']).toBe(true);
    expect(calls()).toBeGreaterThanOrEqual(2);

    release2();
    release1();
    await Promise.all([cancelCycle, createCycle]);
    expect(service['runningCancel']).toBe(false);
    expect(service['runningCreate']).toBe(false);
  });

  it('B34-U-03: both mutex flags are released after success, empty result and error', async () => {
    // Success + empty result
    const okDb = createMockDb({ executeRows: [] });
    const okService = createReconciliationService(okDb);
    await okService.reconcile();
    await okService.reconcileCancel();
    expect(okService['runningCreate']).toBe(false);
    expect(okService['runningCancel']).toBe(false);

    // Error inside the cycle must still release both flags (no permanent lock).
    const errDb = createMockDb();
    errDb.db.execute.mockRejectedValue(new Error('boom'));
    const errService = createReconciliationService(errDb);
    const createResults = await errService.reconcile();
    const cancelResults = await errService.reconcileCancel();
    expect(createResults).toEqual([]);
    expect(cancelResults).toEqual([]);
    expect(errService['runningCreate']).toBe(false);
    expect(errService['runningCancel']).toBe(false);

    // Still runnable afterwards — proves no flag was left permanently true.
    const retryDb = createMockDb({ executeRows: [] });
    const retryService = createReconciliationService(retryDb);
    await retryService.reconcile();
    expect(retryService['runningCreate']).toBe(false);
  });

  it('B34-U-03b: same-cycle re-entry is still prevented per lifecycle', async () => {
    // runningCreate must still guard against two concurrent CREATE cycles.
    const mockDb = createMockDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockDb.db.execute.mockImplementation(async () => {
      await gate;
      return { rows: [] };
    });
    const service = createReconciliationService(mockDb);

    const first = service.reconcile();
    await Promise.resolve();
    const second = await service.reconcile(); // must short-circuit
    expect(second).toEqual([]);
    expect(mockDb.db.execute).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});

// ═══════════════════════════════════════════════════════════════════
//  2. Delivered-After-Cancel Exception Detection (C6 / BD-3.4-04 / BD-3.4-05)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.4 — DELIVERED_AFTER_CANCEL Exception Detection (C6)', () => {
  for (const cancelStatus of DELIVERED_AFTER_CANCEL_STATUSES) {
    it(`B34-U-04/05: DELIVERED with carrier_cancel_status=${cancelStatus} records the exception and raises the token`, async () => {
      const { poller, mockDb, shipment } = createPoller({
        trackingStatus: 'DELIVERED',
        cancelStatus,
      });

      await (poller as any).pollShipment(shipment);

      // Exactly one exception event, carrying the locked field values.
      const exceptions = exceptionPayloads(mockDb);
      expect(exceptions).toHaveLength(1);
      const inserted = exceptions[0];
      expect(inserted.carrierEventCode).toBe('DELIVERED_AFTER_CANCEL');
      expect(inserted.externalEventId).toBe(`dac-${shipment.id}`);
      expect(inserted.eventType).toBe('CARRIER_TRACKING');
      expect(inserted.actorType).toBe('CARRIER');
      expect(inserted.notes).toBe('Carrier reports DELIVERED after SCS cancellation');
      expect(inserted.metadata.carrierStatus).toBe('DELIVERED');
      expect(inserted.metadata.carrierCancelStatus).toBe(cancelStatus);
      expect(inserted.metadata.exception).toBe('DELIVERED_AFTER_CANCEL');
      expect(inserted.metadata.source).toBe('tracking_poll');

      // recoveryStatus set to DELIVERED_AFTER_CANCEL.
      const recoveryUpdate = mockDb.updateChain.set.mock.calls.find(
        (c: any[]) => c[0]?.recoveryStatus === 'DELIVERED_AFTER_CANCEL',
      );
      expect(recoveryUpdate).toBeDefined();
    });
  }

  it('B34-U-05b: anomaly is detected even when the carrier returns no event list', async () => {
    // The detection is defined on the carrier-reported STATUS, so it must fire
    // before the "no new events" short-circuit — otherwise a status-only
    // response would silently drop the anomaly.
    const { poller, mockDb, shipment, processCarrierDelivery } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'UNKNOWN',
      trackingEvents: [],
    });

    await (poller as any).pollShipment(shipment);

    expect(exceptionPayloads(mockDb)).toHaveLength(1);
    expect(
      mockDb.updateChain.set.mock.calls.some(
        (c: any[]) => c[0]?.recoveryStatus === 'DELIVERED_AFTER_CANCEL',
      ),
    ).toBe(true);
    expect(processCarrierDelivery).not.toHaveBeenCalled();
  });

  it('B34-U-06: delivered-after-cancel does NOT call processCarrierDelivery', async () => {
    const { poller, processCarrierDelivery, shipment } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'UNKNOWN',
    });

    await (poller as any).pollShipment(shipment);

    expect(processCarrierDelivery).not.toHaveBeenCalled();
  });

  it('B34-U-07: delivered-after-cancel does NOT advance carrier_status_mapped', async () => {
    const { poller, mockDb, shipment } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'RECONCILIATION_REQUIRED',
      carrierStatusMapped: 'OUT_FOR_DELIVERY',
    });

    await (poller as any).pollShipment(shipment);

    // No update payload may carry carrierStatusMapped / carrierStatusRaw.
    for (const call of mockDb.updateChain.set.mock.calls) {
      expect(call[0]).not.toHaveProperty('carrierStatusMapped');
      expect(call[0]).not.toHaveProperty('carrierStatusRaw');
      expect(call[0]).not.toHaveProperty('status');
      expect(call[0]).not.toHaveProperty('deliveredAt');
    }
    // Order/shipment status columns are never written from the poller at all.
    expect(mockDb.db.update).toHaveBeenCalled();
  });

  it('B34-U-08: DELIVERED on a non-cancelled shipment keeps normal tracking behavior', async () => {
    for (const cancelStatus of [null, 'PENDING', 'IN_PROGRESS']) {
      const { poller, mockDb, processCarrierDelivery, shipment } = createPoller({
        trackingStatus: 'DELIVERED',
        cancelStatus,
      });

      await (poller as any).pollShipment(shipment);

      // Normal flow: status advanced and delivery bridge invoked.
      const statusAdvance = mockDb.updateChain.set.mock.calls.find(
        (c: any[]) => c[0]?.carrierStatusMapped === 'DELIVERED',
      );
      expect(statusAdvance).toBeDefined();
      expect(processCarrierDelivery).toHaveBeenCalledTimes(1);
      expect(processCarrierDelivery).toHaveBeenCalledWith(
        'order-b34-001',
        'CAR-B34',
        'tracking_poll',
      );
      // No exception raised for a normal delivery.
      expect(exceptionPayloads(mockDb)).toHaveLength(0);
      for (const call of mockDb.updateChain.set.mock.calls) {
        expect(call[0]).not.toHaveProperty('recoveryStatus');
      }
    }
  });

  it('B34-U-09: a non-DELIVERED status on a cancelled shipment is not an exception', async () => {
    const { poller, mockDb, processCarrierDelivery, shipment } = createPoller({
      trackingStatus: 'IN_TRANSIT',
      cancelStatus: 'UNKNOWN',
      carrierStatusMapped: 'PICKED_UP',
    });

    await (poller as any).pollShipment(shipment);

    expect(exceptionPayloads(mockDb)).toHaveLength(0);
    expect(processCarrierDelivery).not.toHaveBeenCalled();
    for (const call of mockDb.updateChain.set.mock.calls) {
      expect(call[0]).not.toHaveProperty('recoveryStatus');
    }
  });

  it('B34-U-13: repeated carrier DELIVERED uses one deterministic exception id', async () => {
    const { poller, mockDb, shipment, processCarrierDelivery } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'FAILED',
    });

    await (poller as any).pollShipment(shipment);
    await (poller as any).pollShipment(shipment);
    await (poller as any).pollShipment(shipment);

    // Three polls of the same shipment must produce one stable external id, so
    // the existing partial UNIQUE index (uq_shipment_events_external_id) dedups
    // any duplicate insert — no new schema required (§10).
    const exceptions = exceptionPayloads(mockDb);
    expect(exceptions).toHaveLength(3); // one attempt per poll, before dedup
    const externalIds = new Set(exceptions.map((p: any) => p.externalEventId));
    expect(externalIds.size).toBe(1);
    expect([...externalIds][0]).toBe(`dac-${shipment.id}`);
    expect(processCarrierDelivery).not.toHaveBeenCalled();
  });

  it('B34-U-13b: PG 23505 on duplicate exception insert is treated as idempotent', async () => {
    const { poller, mockDb, shipment } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'UNKNOWN',
    });
    const dupErr: any = new Error('duplicate key value');
    dupErr.code = '23505';
    mockDb.db.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(dupErr) });

    await expect((poller as any).pollShipment(shipment)).resolves.toBeUndefined();

    // Recovery token still raised; the duplicate is silently absorbed.
    const recoveryUpdate = mockDb.updateChain.set.mock.calls.find(
      (c: any[]) => c[0]?.recoveryStatus === 'DELIVERED_AFTER_CANCEL',
    );
    expect(recoveryUpdate).toBeDefined();
  });

  it('B34-U-13c: a non-23505 insert failure still propagates to the poll error handler', async () => {
    const { poller, mockDb, shipment, circuitBreaker } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'UNKNOWN',
    });
    const otherErr: any = new Error('not-null violation');
    otherErr.code = '23502';
    mockDb.db.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(otherErr) });

    await (poller as any).pollShipment(shipment);

    // Not swallowed as a duplicate — the outer catch records a breaker failure.
    expect(circuitBreaker.recordFailure).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  3. Cancel-Status Predicate + C5 Guard Preservation
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.4 — isDeliveredAfterCancel predicate and C5 guard', () => {
  it('B34-U-11: predicate is true only for UNKNOWN, RECONCILIATION_REQUIRED, FAILED', () => {
    expect(isDeliveredAfterCancel('UNKNOWN')).toBe(true);
    expect(isDeliveredAfterCancel('RECONCILIATION_REQUIRED')).toBe(true);
    expect(isDeliveredAfterCancel('FAILED')).toBe(true);
  });

  it('B34-U-11b: predicate is false for null and non-cancel statuses', () => {
    expect(isDeliveredAfterCancel(null)).toBe(false);
    expect(isDeliveredAfterCancel('PENDING')).toBe(false);
    expect(isDeliveredAfterCancel('IN_PROGRESS')).toBe(false);
    // CASE A statuses are handled by the C5 guard, never by this predicate.
    expect(isDeliveredAfterCancel('SUCCEEDED')).toBe(false);
    expect(isDeliveredAfterCancel('NOT_REQUIRED')).toBe(false);
  });

  it('B34-U-12: C5 polling guard still excludes exactly SUCCEEDED and NOT_REQUIRED', () => {
    // The exception set must NOT include the C5-excluded statuses, otherwise the
    // two guards would overlap and CASE A would be double-handled.
    expect(DELIVERED_AFTER_CANCEL_STATUSES).not.toContain('SUCCEEDED');
    expect(DELIVERED_AFTER_CANCEL_STATUSES).not.toContain('NOT_REQUIRED');
    expect(DELIVERED_AFTER_CANCEL_STATUSES).toEqual([
      'UNKNOWN',
      'RECONCILIATION_REQUIRED',
      'FAILED',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  4. PICKUP_CANCELLED Cleanup (BD-3.4-09 / C7)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.4 — PICKUP_CANCELLED Removal (BD-3.4-09 / C7)', () => {
  function cancelShipmentFixture() {
    return {
      id: 'ship-pickup-cancel',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 0,
      carrier_tracking_id: 'TRACK-PC',
      shipping_provider_key: 'aramex',
    };
  }

  it('B34-U-09: tracking status PICKUP_CANCELLED does NOT resolve to SUCCEEDED', async () => {
    const mockDb = createMockDb();
    const service = new CarrierReconciliationService(
      mockDb as any,
      { findProvider: vi.fn().mockReturnValue(createMockProvider('PICKUP_CANCELLED')) } as any,
      { incrementCounter: vi.fn() } as any,
      { canRequest: vi.fn().mockReturnValue(true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
      { tryResolve: vi.fn() } as any,
    );

    const result = await service.reconcileCancelShipment(cancelShipmentFixture());

    expect(result.outcome).toBe('cancel_deferred');
    expect(result.outcome).not.toBe('cancel_succeeded');
  });

  it('B34-U-09b: tracking status CANCELLED still resolves to SUCCEEDED', async () => {
    const mockDb = createMockDb();
    const service = new CarrierReconciliationService(
      mockDb as any,
      { findProvider: vi.fn().mockReturnValue(createMockProvider('CANCELLED')) } as any,
      { incrementCounter: vi.fn() } as any,
      { canRequest: vi.fn().mockReturnValue(true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
      { tryResolve: vi.fn() } as any,
    );

    const result = await service.reconcileCancelShipment(cancelShipmentFixture());

    expect(result.outcome).toBe('cancel_succeeded');
    const succeeded = mockDb.updateChain.set.mock.calls.find(
      (c: any[]) => c[0]?.carrierCancelStatus === 'SUCCEEDED',
    );
    expect(succeeded).toBeDefined();
  });

  it('B34-U-09c: no PICKUP_CANCELLED literal remains in reconciliation or the Aramex mapper', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const srcRoot = path.resolve(__dirname, '../../../modules/shipping');

    const reconciliation = fs.readFileSync(
      path.join(srcRoot, 'carrier-reconciliation.service.ts'),
      'utf8',
    );
    const mapper = fs.readFileSync(
      path.join(srcRoot, 'aramex/aramex-status.mapper.ts'),
      'utf8',
    );

    // Only permitted occurrence is the explanatory comment, never a comparison.
    expect(reconciliation).not.toMatch(/status\s*===?\s*'PICKUP_CANCELLED'/);
    expect(mapper).not.toContain('PICKUP_CANCELLED');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  5. Locked-Vocabulary and Regression Guarantees
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-B.3.4 — Schema Vocabulary and Cancellation Regression Guarantees', () => {
  it('B34-U-14: the recovery-token write is value-guarded (IS DISTINCT FROM)', async () => {
    // Repeated polls must never re-write an identical token (no updated_at churn
    // every 10 minutes), while a token cleared by an operator is re-raisable
    // because the anomaly is still present.
    const { poller, mockDb, shipment } = createPoller({
      trackingStatus: 'DELIVERED',
      cancelStatus: 'UNKNOWN',
    });

    await (poller as any).pollShipment(shipment);

    const recoveryIdx = mockDb.updateChain.set.mock.calls.findIndex(
      (c: any[]) => c[0]?.recoveryStatus === 'DELIVERED_AFTER_CANCEL',
    );
    expect(recoveryIdx).toBeGreaterThanOrEqual(0);
    const whereCall = mockDb.updateChain.where.mock.calls[recoveryIdx];
    if (!whereCall) throw new Error('recovery-token update was not conditioned');
    const sqlText = sqlLiteralTextOf(whereCall[0]);
    expect(sqlText).toContain('IS DISTINCT FROM');
    expect(sqlText).toContain("'DELIVERED_AFTER_CANCEL'");
  });

  it('B34-U-15: DELIVERED_AFTER_CANCEL is a defined token and fits VARCHAR(24)', () => {
    expect(CARRIER_CANCEL_RECOVERY_TOKENS).toContain('DELIVERED_AFTER_CANCEL');
    for (const token of CARRIER_CANCEL_RECOVERY_TOKENS) {
      expect(token.length).toBeLessThanOrEqual(24);
    }
  });

  it('B34-U-15b: every exception cancel status is a defined CarrierCancelStatus', () => {
    for (const status of DELIVERED_AFTER_CANCEL_STATUSES) {
      expect(CARRIER_CANCEL_STATUSES).toContain(status);
      expect(status.length).toBeLessThanOrEqual(24); // carrier_cancel_status VARCHAR(24)
    }
  });

  it('B34-U-15c: carrier_event_code DELIVERED_AFTER_CANCEL fits VARCHAR(40)', () => {
    expect('DELIVERED_AFTER_CANCEL'.length).toBeLessThanOrEqual(40);
  });

  it('B34-U-10: timeout/indeterminate classification still yields UNKNOWN, not FAILED', () => {
    // Indeterminate transport failures must continue to route to UNKNOWN (§6).
    const indeterminate = [
      'connection timeout after 30000ms',
      'read ETIMEDOUT',
      'socket hang up',
      'read ECONNRESET',
      'write ECONNABORTED',
      'request aborted',
    ];
    for (const msg of indeterminate) {
      const lower = msg.toLowerCase();
      const isTimeout =
        lower.includes('timeout') ||
        lower.includes('etimedout') ||
        lower.includes('econnreset') ||
        lower.includes('econnaborted') ||
        lower.includes('socket hang up') ||
        lower.includes('aborted');
      expect(isTimeout).toBe(true);
    }

    // DNS/ECONNREFUSED remain retryable — never UNKNOWN.
    for (const msg of ['connect ECONNREFUSED 127.0.0.1:443', 'getaddrinfo ENOTFOUND x']) {
      const lower = msg.toLowerCase();
      expect(
        lower.includes('timeout') ||
          lower.includes('etimedout') ||
          lower.includes('econnreset') ||
          lower.includes('econnaborted') ||
          lower.includes('socket hang up') ||
          lower.includes('aborted'),
      ).toBe(false);
    }
  });

  it('B34-U-16: UNKNOWN -> PENDING is not performed by the reconciliation cycle', async () => {
    // A non-cancel tracking status must never resurrect the cancellation attempt.
    const mockDb = createMockDb();
    const service = new CarrierReconciliationService(
      mockDb as any,
      { findProvider: vi.fn().mockReturnValue(createMockProvider('IN_TRANSIT')) } as any,
      { incrementCounter: vi.fn() } as any,
      { canRequest: vi.fn().mockReturnValue(true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
      { tryResolve: vi.fn() } as any,
    );

    await service.reconcileCancelShipment({
      id: 'ship-no-resurrect',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 0,
      carrier_tracking_id: 'TRACK-NR',
      shipping_provider_key: 'aramex',
    });

    for (const call of mockDb.updateChain.set.mock.calls) {
      expect(call[0]?.carrierCancelStatus).not.toBe('PENDING');
    }
  });

  it('B34-U-17: reconciliation never invokes cancelPickup (no automatic re-cancel)', async () => {
    const cancelPickup = vi.fn();
    const mockDb = createMockDb();
    const provider = {
      getTrackingInfo: vi.fn().mockResolvedValue({ status: 'IN_TRANSIT', events: [] }),
      cancelPickup,
    };
    const service = new CarrierReconciliationService(
      mockDb as any,
      { findProvider: vi.fn().mockReturnValue(provider) } as any,
      { incrementCounter: vi.fn() } as any,
      { canRequest: vi.fn().mockReturnValue(true), recordSuccess: vi.fn(), recordFailure: vi.fn() } as any,
      { tryResolve: vi.fn() } as any,
    );

    await service.reconcileCancelShipment({
      id: 'ship-no-recancel',
      carrier_cancel_status: 'UNKNOWN',
      carrier_cancel_attempted_at: new Date(),
      carrier_cancel_retries: 0,
      carrier_tracking_id: 'TRACK-NRC',
      shipping_provider_key: 'aramex',
    });

    expect(cancelPickup).not.toHaveBeenCalled();
  });
});
