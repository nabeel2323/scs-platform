import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../../../modules/inventory/inventory.service';

/**
 * Stock lifecycle integration test.
 *
 * Covers the full inventory flow: create item → adjust stock → transfer
 * between warehouses → export CSV → low-stock notification.
 * Uses a mock DB harness following the same pattern as other service specs.
 *
 * NOTE: InventoryService accesses the ORM through `this.db.db.query…`
 * (DatabaseService wraps the Drizzle client under a `.db` getter), so the
 * mock must mirror that double-nesting.
 */

const VARIANT_ID = 'variant-001';
const WH_A = 'warehouse-a';
const WH_B = 'warehouse-b';
const STORE_ID = 'store-001';

function createHarness() {
  const inventoryRows: Record<string, any>[] = [];
  const movementRows: Record<string, any>[] = [];
  const warehouseRows: Record<string, any>[] = [
    { id: WH_A, storeId: STORE_ID, name: 'Main Warehouse' },
    { id: WH_B, storeId: STORE_ID, name: 'Overflow' },
  ];
  const outboxEvents: Record<string, any>[] = [];

  // findFirst response queue — lets each test control what the *next*
  // findFirst call returns.  When the queue is empty the mock falls back to
  // a simple in-memory search by `id` or `variantId`.
  const findFirstQueue: (Record<string, any> | null)[] = [];

  const innerDb = {
    query: {
      inventoryItems: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (findFirstQueue.length > 0) return findFirstQueue.shift()!;
          // Fallback: match by explicit id, then by variantId
          if (where?.id) return inventoryRows.find(r => r['id'] === where.id) ?? null;
          return inventoryRows.find(r => r['variantId'] === VARIANT_ID) ?? null;
        }),
        findMany: vi.fn(async () => inventoryRows),
      },
      stockMovements: {
        findMany: vi.fn(async () => movementRows),
      },
      warehouses: {
        findFirst: vi.fn(async () => warehouseRows[0] ?? null),
        findMany: vi.fn(async () => warehouseRows),
      },
      productVariants: {
        findMany: vi.fn(async () => [
          { id: VARIANT_ID, sku: 'SKU-001', title: 'Test Variant', productId: 'prod-001' },
        ]),
      },
      products: {
        findMany: vi.fn(async () => [
          { id: 'prod-001', title: 'Test Product' },
        ]),
      },
    },
    insert: vi.fn((_table: any) => ({
      values: vi.fn(async (values: any) => {
        const rows = Array.isArray(values) ? values : [values];
        for (const row of rows) {
          if (row.variantId !== undefined && row.warehouseId !== undefined && row.qtyOnHand !== undefined) {
            inventoryRows.push(row);
          } else if (row.movementType !== undefined) {
            movementRows.push(row);
          } else if (row.eventType !== undefined) {
            outboxEvents.push(row);
          }
        }
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };

  // DatabaseService exposes the Drizzle client as `.db`
  const dbService = { db: innerDb } as any;

  const outbox = {
    publish: vi.fn(async (eventType: string, aggregateId: string, payload: any) => {
      outboxEvents.push({ eventType, aggregateId, payload });
    }),
  };

  const service = new InventoryService(dbService, outbox as any);

  // Spy on getItem so tests can look up pre-populated rows by plain ID
  // (Drizzle's eq() where-clauses are opaque SQL objects that the mock
  // findFirst cannot parse).
  let pendingGetItemId: string | null = null;
  vi.spyOn(service, 'getItem').mockImplementation(async (id: string): Promise<any> => {
    if (pendingGetItemId === id) {
      const row = inventoryRows.find(r => r['id'] === id);
      if (row) return row;
    }
    // Fall through to the findFirst mock (used by createItem's queue)
    const item = await innerDb.query.inventoryItems.findFirst({ where: {} });
    if (!item) throw new Error('Inventory item not found');
    return item;
  });

  return {
    service, db: innerDb, dbService, outbox,
    inventoryRows, movementRows, outboxEvents, warehouseRows, findFirstQueue,
    setGetItem: (id: string | null) => { pendingGetItemId = id; },
  };
}

describe('InventoryService — stock lifecycle', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('creates an inventory item with initial stock and records IMPORT movement', async () => {
    // 1st findFirst → null (no existing item); 2nd → the inserted row
    const created = {
      id: 'inv-new',
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      qtyOnHand: 100,
      qtyReserved: 0,
      reorderPoint: 0,
    };
    harness.findFirstQueue.push(null, created);

    await harness.service.createItem({
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      initialQty: 100,
      reason: 'Initial stock',
    });

    expect(harness.inventoryRows.length).toBe(1);
    expect(harness.inventoryRows[0]!['qtyOnHand']).toBe(100);
    expect(harness.inventoryRows[0]!['variantId']).toBe(VARIANT_ID);
    expect(harness.inventoryRows[0]!['warehouseId']).toBe(WH_A);
    expect(harness.movementRows.length).toBe(1);
    expect(harness.movementRows[0]!['movementType']).toBe('IMPORT');
    expect(harness.movementRows[0]!['quantity']).toBe(100);
  });

  it('adjusts stock and emits low-stock alert when below reorder point', async () => {
    harness.inventoryRows.push({
      id: 'inv-001',
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      qtyOnHand: 20,
      qtyReserved: 0,
      reorderPoint: 10,
      lowStockAlert: true,
    });
    harness.setGetItem('inv-001');

    const result = await harness.service.adjustStock({
      inventoryItemId: 'inv-001',
      quantity: -15,
      reason: 'Sold some',
    });

    expect(result.newQty).toBe(5);
    expect(harness.movementRows.length).toBe(1);
    expect(harness.movementRows[0]!['movementType']).toBe('ADJUST');
    expect(harness.movementRows[0]!['quantity']).toBe(-15);
    // Low-stock alert should have been emitted (5 <= 10 reorder point)
    expect(harness.outbox.publish).toHaveBeenCalledWith(
      'inventory.low_stock',
      'inv-001',
      expect.objectContaining({ variantId: VARIANT_ID, reorderPoint: 10 }),
    );
  });

  it('rejects adjustment that would make stock negative', async () => {
    harness.inventoryRows.push({
      id: 'inv-002',
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      qtyOnHand: 5,
      qtyReserved: 0,
      reorderPoint: 0,
      lowStockAlert: false,
    });
    harness.setGetItem('inv-002');

    await expect(
      harness.service.adjustStock({
        inventoryItemId: 'inv-002',
        quantity: -10,
      }),
    ).rejects.toThrow('Insufficient stock');
  });

  it('transfers stock between warehouses', async () => {
    harness.inventoryRows.push({
      id: 'inv-003',
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      qtyOnHand: 50,
      qtyReserved: 0,
      reorderPoint: 0,
      lowStockAlert: false,
    });
    harness.setGetItem('inv-003');

    await harness.service.transferStock({
      inventoryItemId: 'inv-003',
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      quantity: 20,
      reason: 'Rebalancing',
    });

    // Source should be decremented
    expect(harness.db.update).toHaveBeenCalled();
    // Two movements: one negative on source, one positive on destination
    expect(harness.movementRows.length).toBe(2);
    expect(harness.movementRows[0]!['quantity']).toBe(-20);
    expect(harness.movementRows[1]!['quantity']).toBe(20);
    // Outbox event should be emitted
    expect(harness.outbox.publish).toHaveBeenCalledWith(
      'inventory.transferred',
      'inv-003',
      expect.objectContaining({
        fromWarehouseId: WH_A,
        toWarehouseId: WH_B,
        quantity: 20,
      }),
    );
  });

  it('rejects transfer with zero or negative quantity', async () => {
    await expect(
      harness.service.transferStock({
        inventoryItemId: 'inv-001',
        fromWarehouseId: WH_A,
        toWarehouseId: WH_B,
        quantity: 0,
      }),
    ).rejects.toThrow('Transfer quantity must be positive');
  });

  it('rejects transfer to the same warehouse', async () => {
    await expect(
      harness.service.transferStock({
        inventoryItemId: 'inv-001',
        fromWarehouseId: WH_A,
        toWarehouseId: WH_A,
        quantity: 10,
      }),
    ).rejects.toThrow('Source and destination warehouses must differ');
  });

  it('exports inventory as CSV with correct headers', async () => {
    harness.inventoryRows.push({
      id: 'inv-004',
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      qtyOnHand: 30,
      qtyReserved: 5,
      reorderPoint: 10,
      lowStockAlert: true,
    });

    const csv = await harness.service.exportInventoryCsv(STORE_ID);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Warehouse,SKU,Product,On Hand,Reserved,Available,Reorder Point');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toContain('Main Warehouse');
    expect(lines[1]).toContain('SKU-001');
    expect(lines[1]!).toContain('30');
    expect(lines[1]!).toContain('25'); // Available = 30 - 5
  });

  it('exports movements as CSV', async () => {
    harness.inventoryRows.push({
      id: 'inv-005',
      variantId: VARIANT_ID,
      warehouseId: WH_A,
      qtyOnHand: 100,
      qtyReserved: 0,
      reorderPoint: 0,
    });
    harness.movementRows.push({
      id: 'mov-001',
      inventoryItemId: 'inv-005',
      movementType: 'IMPORT',
      quantity: 100,
      reason: 'Initial stock',
      createdAt: new Date('2026-01-01'),
    });

    const csv = await harness.service.exportMovementsCsv(STORE_ID);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Movement Type,SKU,Product,Warehouse,Quantity,Reason,Date');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toContain('IMPORT');
    expect(lines[1]!).toContain('100');
  });

  it('checkAndNotifyLowStock emits events for items below reorder point', async () => {
    harness.inventoryRows.push(
      { id: 'inv-low1', variantId: 'v1', warehouseId: WH_A, qtyOnHand: 3, qtyReserved: 0, reorderPoint: 10, lowStockAlert: true },
      { id: 'inv-ok1', variantId: 'v2', warehouseId: WH_A, qtyOnHand: 50, qtyReserved: 0, reorderPoint: 10, lowStockAlert: true },
      { id: 'inv-noalert', variantId: 'v3', warehouseId: WH_A, qtyOnHand: 2, qtyReserved: 0, reorderPoint: 10, lowStockAlert: false },
    );

    const alerted = await harness.service.checkAndNotifyLowStock(STORE_ID);
    expect(alerted.length).toBe(1);
    const first = alerted[0];
    expect(first).toBeDefined();
    expect(first!.id).toBe('inv-low1');
    expect(harness.outbox.publish).toHaveBeenCalledTimes(1);
    expect(harness.outbox.publish).toHaveBeenCalledWith(
      'inventory.low_stock',
      'inv-low1',
      expect.objectContaining({ reorderPoint: 10 }),
    );
  });

  it('bulk adjust applies to multiple items', async () => {
    harness.inventoryRows.push(
      { id: 'inv-b1', variantId: 'v1', warehouseId: WH_A, qtyOnHand: 50, qtyReserved: 0, reorderPoint: 0, lowStockAlert: false },
      { id: 'inv-b2', variantId: 'v2', warehouseId: WH_A, qtyOnHand: 30, qtyReserved: 0, reorderPoint: 0, lowStockAlert: false },
    );

    // bulkAdjustStock calls getItem for each item sequentially
    const origGetItem = harness.service.getItem;
    let callIdx = 0;
    const ids = ['inv-b1', 'inv-b2'];
    vi.spyOn(harness.service, 'getItem').mockImplementation(async (id: string) => {
      harness.setGetItem(ids[callIdx] ?? id);
      callIdx++;
      return origGetItem.call(harness.service, id);
    });

    const results = await harness.service.bulkAdjustStock([
      { inventoryItemId: 'inv-b1', quantity: 10 },
      { inventoryItemId: 'inv-b2', quantity: -5 },
    ]);

    expect(results.length).toBe(2);
    expect(results[0]!.newQty).toBe(60);
    expect(results[1]!.newQty).toBe(25);
    expect(harness.movementRows.length).toBe(2);
  });

  // ── Reservations ──────────────────────────────────────────────

  it('reserves stock and records a RESERVE movement with negative quantity', async () => {
    harness.inventoryRows.push({
      id: 'inv-r1', variantId: VARIANT_ID, warehouseId: WH_A,
      qtyOnHand: 100, qtyReserved: 0, reorderPoint: 0, lowStockAlert: false,
    });
    harness.setGetItem('inv-r1');

    const result = await harness.service.reserveStock({
      inventoryItemId: 'inv-r1',
      quantity: 30,
      referenceType: 'ORDER',
      referenceId: 'order-001',
    });

    expect(result.movementId).toBeDefined();
    expect(harness.movementRows.length).toBe(1);
    expect(harness.movementRows[0]!['movementType']).toBe('RESERVE');
    expect(harness.movementRows[0]!['quantity']).toBe(-30);
    expect(harness.movementRows[0]!['referenceType']).toBe('ORDER');
    expect(harness.movementRows[0]!['referenceId']).toBe('order-001');
  });

  it('rejects reservation when available stock is insufficient', async () => {
    harness.inventoryRows.push({
      id: 'inv-r2', variantId: VARIANT_ID, warehouseId: WH_A,
      qtyOnHand: 20, qtyReserved: 15, reorderPoint: 0, lowStockAlert: false,
    });
    harness.setGetItem('inv-r2');

    // Available = 20 - 15 = 5, requesting 10 should fail
    await expect(
      harness.service.reserveStock({
        inventoryItemId: 'inv-r2',
        quantity: 10,
      }),
    ).rejects.toThrow('Insufficient available stock');
  });

  it('releases reserved stock and records a RELEASE movement', async () => {
    harness.inventoryRows.push({
      id: 'inv-r3', variantId: VARIANT_ID, warehouseId: WH_A,
      qtyOnHand: 50, qtyReserved: 20, reorderPoint: 0, lowStockAlert: false,
    });
    harness.setGetItem('inv-r3');

    const result = await harness.service.releaseStock({
      inventoryItemId: 'inv-r3',
      quantity: 15,
      referenceType: 'ORDER',
      referenceId: 'order-002',
    });

    expect(result.movementId).toBeDefined();
    expect(harness.movementRows.length).toBe(1);
    expect(harness.movementRows[0]!['movementType']).toBe('RELEASE');
    expect(harness.movementRows[0]!['quantity']).toBe(15);
  });

  it('clamps release to zero when releasing more than reserved', async () => {
    harness.inventoryRows.push({
      id: 'inv-r4', variantId: VARIANT_ID, warehouseId: WH_A,
      qtyOnHand: 50, qtyReserved: 5, reorderPoint: 0, lowStockAlert: false,
    });
    harness.setGetItem('inv-r4');

    // Release 100 but only 5 reserved — should clamp, not go negative
    const result = await harness.service.releaseStock({
      inventoryItemId: 'inv-r4',
      quantity: 100,
    });

    expect(result.movementId).toBeDefined();
    expect(harness.movementRows.length).toBe(1);
    expect(harness.movementRows[0]!['movementType']).toBe('RELEASE');
    expect(harness.movementRows[0]!['quantity']).toBe(100);
  });
});
