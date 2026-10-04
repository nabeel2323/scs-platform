/**
 * M7.3-C — Inventory Return-to-Stock (RTS physical return) Unit Tests
 *
 * Exercises the LOCKED return semantics against a purpose-built Drizzle mock
 * (no PostgreSQL required). The mock stages SELECT results in the deterministic
 * order recordReturn/getReturnEligibility consume them and records every
 * insert payload so movement-type semantics (RELEASE vs ADJUST, ordering,
 * server-resolved warehouse) can be asserted. The 21 real-counter cases live in
 * the companion PostgreSQL integration spec.
 *
 * Coverage maps to SCS-M7.3-C §23 "Unit tests" 1..18.
 */
import { describe, it, expect, vi } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';
import { DatabaseService } from '../../../common/database/database.service';

// ── Deterministic return mock ─────────────────────────────────────────
// A single engine backs both `db` and the transaction `tx`. `select()` chains
// pop the next staged row-set in await order; `insert()` records its payload;
// `update()` is a no-op. `query.<table>.findFirst/findMany` read from fixture.

interface ReturnFixture {
  shipment?: any;
  order?: any;
  store?: any;
  orderItems?: any[];
  // Staged SELECT results, consumed in await order:
  //   [reserveRows, invRows, returnRows]   // pre-lock ledger view (line resolution)
  //   ...locks([])                          // one [] per locked inventory item
  //   [reserveRows, invRows, returnRows]   // post-lock authoritative view (drives the cap)
  //   [priorEvent]                          // idempotency replay lookup
  selects?: any[];
}

function createReturnEngine(fixture: ReturnFixture) {
  const recorded: { inserts: any[]; updates: any[] } = { inserts: [], updates: [] };
  let selectIdx = 0;

  const makeSelect = () => {
    const b: any = {};
    b.from = () => b;
    b.where = () => b;
    b.orderBy = () => b;
    b.groupBy = () => b;
    b.for = () => b;
    b.limit = () => b;
    b.offset = () => b;
    // Awaitable: pop next staged SELECT result (default [] beyond the queue,
    // which covers the deterministic FOR UPDATE lock no-ops).
    b.then = (res: any, rej: any) => {
      const rows = fixture.selects && selectIdx < fixture.selects.length
        ? fixture.selects[selectIdx++]
        : [];
      return Promise.resolve(rows).then(res, rej);
    };
    return b;
  };

  const makeInsert = () => {
    const b: any = {};
    b.values = (v: any) => { recorded.inserts.push(v); return b; };
    b.onConflictDoNothing = () => b;
    b.returning = () => Promise.resolve([{ id: 'test-id' }]);
    b.then = (res: any, rej: any) => Promise.resolve(undefined).then(res, rej);
    return b;
  };

  const makeUpdate = () => {
    const b: any = {};
    b.set = (v: any) => { recorded.updates.push(v); return b; };
    b.where = () => b;
    b.returning = () => Promise.resolve([{ id: 'test-id' }]);
    b.then = (res: any, rej: any) => Promise.resolve(undefined).then(res, rej);
    return b;
  };

  const query = {
    shipments: { findFirst: vi.fn().mockResolvedValue(fixture.shipment ?? null) },
    orders: { findFirst: vi.fn().mockResolvedValue(fixture.order ?? null) },
    stores: { findFirst: vi.fn().mockResolvedValue(fixture.store ?? null) },
    orderItems: { findMany: vi.fn().mockResolvedValue(fixture.orderItems ?? []) },
  };

  const engine: any = {
    query,
    select: () => makeSelect(),
    insert: () => makeInsert(),
    update: () => makeUpdate(),
    transaction: async (fn: any) => fn(engine),
    recorded,
  };
  return engine;
}

function serviceFor(fixture: ReturnFixture) {
  const engine = createReturnEngine(fixture);
  const db = { db: engine, pool: {} } as unknown as DatabaseService;
  const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
  const promotions = {} as any;
  const realtime = { emitNewOrder: vi.fn(), emitOrderStatusChanged: vi.fn(), server: { to: () => ({ emit: vi.fn() }) } } as any;
  const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;
  const svc = new OrdersService(db, outbox, promotions, realtime, undefined, notifications);
  return { svc, engine };
}

// A completed-RTS shipment with a single 5-unit reserved line (GOOD path).
const baseFixture = (overrides: Partial<ReturnFixture> = {}): ReturnFixture => ({
  shipment: { id: 'ship-1', orderId: 'ord-1', storeId: 'store-1', exceptionStatus: 'RTS_COMPLETED', exceptionType: 'RECIPIENT_REFUSED' },
  order: { id: 'ord-1', status: 'OUT_FOR_DELIVERY' },
  store: { orgId: 'org-1' },
  orderItems: [{ id: 'item-1', orderId: 'ord-1', variantId: 'var-1', sku: 'SKU-1', title: 'Widget', quantity: 5 }],
  selects: [
    // pre-lock view — used only to resolve line → inventory origin
    [{ inventoryItemId: 'inv-1', quantity: -5 }], // RESERVE
    [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }], // inventory items
    [], // return RELEASE rows (pre-lock)
    [], // FOR UPDATE lock
    // post-lock authoritative view — drives the CI-05 cumulative cap
    [{ inventoryItemId: 'inv-1', quantity: -5 }], // RESERVE (re-read)
    [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }], // inventory items (re-read)
    [], // return RELEASE rows (re-read)
    [], // prior RETURN_PROCESSED event (no replay)
  ],
  ...overrides,
});

const MERCHANT = { sub: 'u-1', role: 'MERCHANT_OWNER', activeOrg: 'org-1' } as any;
const ADMIN = { sub: 'u-2', role: 'ADMIN', activeOrg: 'org-admin' } as any;
const line = (q = 5, c = 'GOOD') => [{ orderItemId: 'item-1', quantity: q, condition: c }];

const movements = (engine: any) =>
  engine.recorded.inserts.filter((v: any) => v.movementType).map((v: any) => v.movementType);

// ═══════════════════════════════════════════════════════════════════
//  §23.1-3  Request validation (throw before any DB access)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — Return request validation', () => {
  it('1. condition is required', async () => {
    const { svc } = serviceFor(baseFixture());
    await expect(
      svc.recordReturn('ship-1', [{ orderItemId: 'item-1', quantity: 1 } as any], MERCHANT),
    ).rejects.toThrow(/Invalid return condition/);
  });

  it('2. condition must belong to the locked vocabulary', async () => {
    const { svc } = serviceFor(baseFixture());
    await expect(
      svc.recordReturn('ship-1', line(1, 'MELTED'), MERCHANT),
    ).rejects.toThrow(/Invalid return condition 'MELTED'/);
  });

  it('2b. each locked condition is accepted by the validator', async () => {
    for (const c of ['GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE']) {
      const { svc } = serviceFor(baseFixture());
      // Passes validation; proceeds into the tx (no throw from the validator).
      const res = await svc.recordReturn('ship-1', line(1, c), MERCHANT);
      expect(res.idempotent).toBe(false);
    }
  });

  it('3. quantity must be an integer >= 1', async () => {
    for (const bad of [0, -3, 1.5, '2']) {
      const { svc } = serviceFor(baseFixture());
      await expect(
        svc.recordReturn('ship-1', [{ orderItemId: 'item-1', quantity: bad as any, condition: 'GOOD' }], MERCHANT),
      ).rejects.toThrow(/integer >= 1/);
    }
  });

  it('3b. an empty line array is rejected', async () => {
    const { svc } = serviceFor(baseFixture());
    await expect(svc.recordReturn('ship-1', [], MERCHANT)).rejects.toThrow(/at least one return line/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §23.4  Cumulative cap (quantity <= remaining)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — Cumulative return cap', () => {
  it('4. rejects a request exceeding reserved-minus-already-returned', async () => {
    // reserved 5, returned 0 → cap 5; request 6 → Conflict before any movement.
    const { svc, engine } = serviceFor(baseFixture());
    await expect(svc.recordReturn('ship-1', line(6, 'GOOD'), MERCHANT)).rejects.toThrow(/Over-return/);
    expect(movements(engine)).toEqual([]);
  });

  it('4b. cap is validated against the POST-LOCK ledger re-read (CI-05 concurrency refresh)', async () => {
    // Pre-lock snapshot shows nothing returned yet; the authoritative post-lock
    // re-read reveals a concurrent 5-unit return already committed. Requesting 3
    // more against reserved 5 must be REJECTED — proving the cap uses the refreshed
    // view, not the stale pre-lock one. The pre-fix code (single pre-lock view) would
    // wrongly accept this, which is exactly the reproduced over-release.
    const { svc, engine } = serviceFor(baseFixture({
      selects: [
        [{ inventoryItemId: 'inv-1', quantity: -5 }], // pre reserve
        [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }], // pre inventory
        [], // pre return rows: none observed yet
        [], // FOR UPDATE lock
        [{ inventoryItemId: 'inv-1', quantity: -5 }], // post reserve
        [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }], // post inventory
        [{ inventoryItemId: 'inv-1', quantity: 5 }], // post return rows: concurrent 5 already RELEASEd
        [], // prior event
      ],
    }));
    await expect(svc.recordReturn('ship-1', line(3, 'GOOD'), MERCHANT)).rejects.toThrow(/Over-return/);
    expect(movements(engine)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §23.5  Warehouse resolution from the RESERVE movement (CI-04)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — Warehouse resolution', () => {
  it('5. resolves warehouse/inventoryItemId from the RESERVE movement, not storeId', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    const res = await svc.recordReturn('ship-1', line(5, 'GOOD'), MERCHANT);
    const rel = res.linesReturned[0];
    expect(rel.inventoryItemId).toBe('inv-1');
    expect(rel.warehouseId).toBe('wh-1'); // from inventory items, never store-1
    const releaseInsert = engine.recorded.inserts.find((v: any) => v.movementType === 'RELEASE');
    expect(releaseInsert.metadata.return.warehouseId).toBe('wh-1');
  });

  it('5b. getReturnEligibility surfaces resolved warehouse + remaining quantity', async () => {
    const { svc } = serviceFor(baseFixture());
    const el = await svc.getReturnEligibility('ship-1', MERCHANT);
    expect(el.eligible).toBe(true);
    expect(el.lines[0]).toMatchObject({
      orderItemId: 'item-1', inventoryItemId: 'inv-1', warehouseId: 'wh-1',
      reservedQuantity: 5, returnedQuantity: 0, remainingQuantity: 5,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §23.6  LOST guard (rejected before any movement)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — LOST guard', () => {
  it('6. rejects a LOST shipment with 409 and performs no movement', async () => {
    const { svc, engine } = serviceFor(baseFixture({
      shipment: { id: 'ship-1', orderId: 'ord-1', storeId: 'store-1', exceptionStatus: 'RTS_COMPLETED', exceptionType: 'LOST' },
    }));
    await expect(svc.recordReturn('ship-1', line(1, 'GOOD'), MERCHANT)).rejects.toThrow(/LOST/);
    expect(movements(engine)).toEqual([]);
  });

  it('6b. requires exception_status = RTS_COMPLETED', async () => {
    const { svc } = serviceFor(baseFixture({
      shipment: { id: 'ship-1', orderId: 'ord-1', storeId: 'store-1', exceptionStatus: 'RTS_IN_PROGRESS', exceptionType: 'RECIPIENT_REFUSED' },
    }));
    await expect(svc.recordReturn('ship-1', line(1, 'GOOD'), MERCHANT)).rejects.toThrow(/expected RTS_COMPLETED/);
  });

  it('6c. rejects when the order is already CANCELLED', async () => {
    const { svc } = serviceFor(baseFixture({ order: { id: 'ord-1', status: 'CANCELLED' } }));
    await expect(svc.recordReturn('ship-1', line(1, 'GOOD'), MERCHANT)).rejects.toThrow(/CANCELLED/);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §23.7-11  Authorization + tenant isolation
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — Authorization & tenancy', () => {
  it('7. authorizes an own-store merchant', async () => {
    const { svc } = serviceFor(baseFixture());
    const res = await svc.recordReturn('ship-1', line(2, 'GOOD'), MERCHANT);
    expect(res.idempotent).toBe(false);
  });

  it('8. authorizes a platform admin (privileged bypass)', async () => {
    const { svc } = serviceFor(baseFixture({ store: undefined })); // admin bypasses store lookup
    const res = await svc.recordReturn('ship-1', line(2, 'GOOD'), ADMIN);
    expect(res.idempotent).toBe(false);
  });

  it('9. denies a DRIVER', async () => {
    const { svc } = serviceFor(baseFixture());
    await expect(
      svc.recordReturn('ship-1', line(1, 'GOOD'), { sub: 'd-1', role: 'DRIVER', activeOrg: 'org-1' } as any),
    ).rejects.toThrow(/cannot record returns/);
  });

  it('10. denies a BUYER', async () => {
    const { svc } = serviceFor(baseFixture());
    await expect(
      svc.recordReturn('ship-1', line(1, 'GOOD'), { sub: 'b-1', role: 'BUYER', activeOrg: 'org-1' } as any),
    ).rejects.toThrow(/cannot record returns/);
    await expect(
      svc.getReturnEligibility('ship-1', { sub: 'b-1', role: 'BUYER', activeOrg: 'org-1' } as any),
    ).rejects.toThrow(/cannot view return eligibility/);
  });

  it('11. isolates a merchant from another org\'s shipment', async () => {
    const { svc } = serviceFor(baseFixture({ store: { orgId: 'org-OTHER' } }));
    await expect(svc.recordReturn('ship-1', line(1, 'GOOD'), MERCHANT)).rejects.toThrow(/does not belong to your organization/);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §23.12-13  Idempotency fingerprint (CI-06)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — Idempotency fingerprint', () => {
  it('12. fingerprint is deterministic, order-independent, and sensitive to qty/condition', async () => {
    const { svc } = serviceFor(baseFixture());
    const fp = (lines: any[]) => (svc as any).computeReturnFingerprint(lines);
    const A = { orderItemId: 'a', quantity: 2, condition: 'GOOD' };
    const B = { orderItemId: 'b', quantity: 1, condition: 'DAMAGED' };
    expect(fp([A, B])).toBe(fp([B, A])); // sorted by orderItemId → stable
    expect(fp([A, B])).not.toBe(fp([A, { ...B, quantity: 2 }])); // qty changes it
    expect(fp([A, B])).not.toBe(fp([A, { ...B, condition: 'GOOD' }])); // condition changes it
    expect(fp([A])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('13. replays an identical operation without new movements', async () => {
    const { svc, engine } = serviceFor(baseFixture({
      selects: [
        [{ inventoryItemId: 'inv-1', quantity: -5 }],
        [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }],
        [], // return rows (pre-lock)
        [], // lock
        [{ inventoryItemId: 'inv-1', quantity: -5 }], // RESERVE (post-lock re-read)
        [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }], // inventory (re-read)
        [], // return rows (re-read)
        [{ id: 'evt-original', metadata: { return: { lines: [{ orderItemId: 'item-1', quantity: 5, condition: 'GOOD', writtenOff: false }] } } }], // prior event → replay
      ],
    }));
    const res = await svc.recordReturn('ship-1', line(5, 'GOOD'), MERCHANT);
    expect(res.idempotent).toBe(true);
    expect(res.returnEventId).toBe('evt-original');
    expect(movements(engine)).toEqual([]); // no new stock movements
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §23.14-18  Movement semantics: RELEASE / ADJUST + ordering (CI-01/02)
// ═══════════════════════════════════════════════════════════════════

describe('M7.3-C — Movement semantics', () => {
  it('14. GOOD = RELEASE only (no write-off)', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    const res = await svc.recordReturn('ship-1', line(5, 'GOOD'), MERCHANT);
    expect(movements(engine)).toEqual(['RELEASE']);
    expect(res.linesReturned[0].writtenOff).toBe(false);
  });

  it('15. DAMAGED = RELEASE + ADJUST (write-off)', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    const res = await svc.recordReturn('ship-1', line(5, 'DAMAGED'), MERCHANT);
    expect(movements(engine)).toEqual(['RELEASE', 'ADJUST']);
    expect(res.linesReturned[0].writtenOff).toBe(true);
  });

  it('16. DEFECTIVE = RELEASE + ADJUST (write-off)', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    await svc.recordReturn('ship-1', line(5, 'DEFECTIVE'), MERCHANT);
    expect(movements(engine)).toEqual(['RELEASE', 'ADJUST']);
  });

  it('17. UNSALEABLE = RELEASE + ADJUST (write-off)', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    await svc.recordReturn('ship-1', line(5, 'UNSALEABLE'), MERCHANT);
    expect(movements(engine)).toEqual(['RELEASE', 'ADJUST']);
  });

  it('18. every RELEASE precedes every ADJUST within one operation', async () => {
    // Two lines: one GOOD, one DAMAGED → 2 RELEASE then 1 ADJUST, strictly ordered.
    const { svc, engine } = serviceFor(baseFixture({
      orderItems: [
        { id: 'item-1', orderId: 'ord-1', variantId: 'var-1', sku: 'SKU-1', title: 'A', quantity: 5 },
        { id: 'item-2', orderId: 'ord-1', variantId: 'var-2', sku: 'SKU-2', title: 'B', quantity: 5 },
      ],
      selects: [
        [{ inventoryItemId: 'inv-1', quantity: -5 }, { inventoryItemId: 'inv-2', quantity: -5 }],
        [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }, { id: 'inv-2', variantId: 'var-2', warehouseId: 'wh-2' }],
        [],
        [], // lock inv-1
        [], // lock inv-2
        // post-lock authoritative view (both inventory items)
        [{ inventoryItemId: 'inv-1', quantity: -5 }, { inventoryItemId: 'inv-2', quantity: -5 }],
        [{ id: 'inv-1', variantId: 'var-1', warehouseId: 'wh-1' }, { id: 'inv-2', variantId: 'var-2', warehouseId: 'wh-2' }],
        [], // return rows (re-read)
        [], // prior event
      ],
    }));
    await svc.recordReturn('ship-1', [
      { orderItemId: 'item-1', quantity: 5, condition: 'GOOD' },
      { orderItemId: 'item-2', quantity: 5, condition: 'DAMAGED' },
    ], MERCHANT);
    const seq = movements(engine);
    const lastRelease = seq.lastIndexOf('RELEASE');
    const firstAdjust = seq.indexOf('ADJUST');
    expect(firstAdjust).toBeGreaterThan(-1);
    expect(lastRelease).toBeLessThan(firstAdjust);
  });

  it('18b. RELEASE carries ORDER reference (nets against a later cancellation); ADJUST is unreferenced', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    await svc.recordReturn('ship-1', line(5, 'DAMAGED'), MERCHANT);
    const rel = engine.recorded.inserts.find((v: any) => v.movementType === 'RELEASE');
    const adj = engine.recorded.inserts.find((v: any) => v.movementType === 'ADJUST');
    expect(rel.referenceType).toBe('ORDER');
    expect(rel.referenceId).toBe('ord-1');
    expect(rel.quantity).toBe(5); // RELEASE increments availability
    expect(adj.referenceType).toBeUndefined();
    expect(adj.quantity).toBe(-5); // ADJUST decrements on-hand
  });

  it('18c. emits RETURN_PROCESSED shipment event + shipment.return_processed outbox atomically', async () => {
    const { svc, engine } = serviceFor(baseFixture());
    await svc.recordReturn('ship-1', line(5, 'GOOD'), MERCHANT);
    const event = engine.recorded.inserts.find((v: any) => v.eventType === 'RETURN_PROCESSED');
    const outbox = engine.recorded.inserts.find((v: any) => v.eventType === 'shipment.return_processed');
    expect(event.metadata.return.lines[0].orderItemId).toBe('item-1');
    expect(outbox.aggregateId).toBe('ship-1');
    expect(outbox.status).toBe('PENDING');
    expect(outbox.payload.orderId).toBe('ord-1');
  });
});
