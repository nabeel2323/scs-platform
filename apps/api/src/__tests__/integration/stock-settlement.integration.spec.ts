import { describe, it, expect, vi } from 'vitest';
import { inspect } from 'node:util';
import { OrdersService } from '../../modules/orders/orders.service';

/**
 * A4-4 — stock settlement against the order FSM.
 *
 * A reservation is created when a merchant accepts an order; these tests pin the
 * two things that used to be missing: the reservation coming BACK on
 * CANCELLED/REJECTED, and it being CONSUMED on DELIVERED. They also lock in the
 * guard that makes a replayed transition a no-op, because double-releasing stock
 * is as bad as never releasing it.
 */

const ORDER_ID = 'order-stock-001';
const BUYER_ID = 'buyer-001';
const MERCHANT_ID = 'merchant-001';
const INV_RICE = 'inv-rice';

interface LedgerRow {
  inventoryItemId: string;
  movementType: string;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
}

/** A RESERVE row as `reserveStock` writes it today (negative = stock going out). */
function reserved(quantity: number, inventoryItemId = INV_RICE): LedgerRow {
  return { inventoryItemId, movementType: 'RESERVE', quantity: -quantity, referenceType: 'ORDER', referenceId: ORDER_ID };
}

function createHarness(initialStatus: string, ledger: LedgerRow[]) {
  let order: Record<string, any> = {
    id: ORDER_ID,
    masterOrderId: 'master-001',
    storeId: 'store-001',
    buyerId: BUYER_ID,
    status: initialStatus,
    fulfillmentMethod: 'PLATFORM_DELIVERY',
    subtotalMinor: 1000,
    totalMinor: 1200,
  };

  const inserted: Record<string, any>[] = [];
  const insertValues = vi.fn(async (values: Record<string, any> | Record<string, any>[]) => {
    inserted.push(...(Array.isArray(values) ? values : [values]));
  });

  const updated: Record<string, any>[] = [];
  const updateSet = vi.fn((values: Record<string, any>) => {
    updated.push(values);
    if (values['status']) order = { ...order, status: values['status'] };
    return { where: vi.fn().mockResolvedValue(undefined) };
  });

  const findMany = vi.fn(async () => ledger);

  const db = {
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: updateSet })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })),
    })),
    query: {
      orders: { findFirst: vi.fn(async () => ({ ...order })) },
      orderItems: { findMany: vi.fn(async () => []) },
      orderStatusHistory: { findMany: vi.fn(async () => []) },
      masterOrders: { findFirst: vi.fn(async () => undefined) },
      stockMovements: { findMany },
    },
  };

  const service = new OrdersService(
    { db } as any,
    { publish: vi.fn(async () => undefined) } as any,
    {
      resolveApplicable: vi.fn(async () => null),
      calculateDiscount: vi.fn(() => 0),
      redeemPromotion: vi.fn(async () => ({ discountMinor: 0 })),
    } as any,
  );

  // Movement rows and inventory updates are interleaved with status history and
  // the status write itself, so pull out only the stock side effects.
  const writtenMovements = () => inserted.filter((row) => row['movementType']);
  const stockUpdates = () =>
    updated.filter((v) => v['qtyReserved'] !== undefined || v['qtyOnHand'] !== undefined);
  // The predicate handed to the ledger read, for the scoping assertion below.
  const ledgerWhere = () =>
    (findMany.mock.calls[0] as unknown as [{ where: unknown }] | undefined)?.[0]?.['where'];

  return {
    service,
    db,
    findMany,
    ledgerWhere,
    writtenMovements,
    stockUpdates,
    status: () => order['status'],
  };
}

/** Drizzle SQL wrappers are circular, so JSON.stringify throws — inspect renders them. */
function sql(node: unknown): string {
  return inspect(node, { depth: 12, breakLength: Infinity, compact: true });
}

describe('Order stock settlement (A4-4)', () => {
  it('releases the reservation when the order is cancelled', async () => {
    const h = createHarness('ACCEPTED', [reserved(10)]);

    await h.service.cancelOrder(ORDER_ID, BUYER_ID, 'Changed my mind');

    const [movement] = h.writtenMovements();
    expect(movement).toMatchObject({
      movementType: 'RELEASE',
      quantity: 10, // positive = stock coming back
      referenceType: 'ORDER',
      referenceId: ORDER_ID,
      performedBy: BUYER_ID,
    });
    // On-hand must NOT move — the goods were never shipped.
    const update = h.stockUpdates()[0]!;
    expect(update['qtyOnHand']).toBeUndefined();
    expect(sql(update)).toContain('qty_reserved');
  });

  it('scopes the ledger read to this order', async () => {
    const h = createHarness('ACCEPTED', [reserved(10)]);

    await h.service.cancelOrder(ORDER_ID, BUYER_ID, 'Changed my mind');

    // The fake below ignores the predicate and returns every row it is given, so
    // the only way to catch a dropped WHERE is to assert on the SQL itself.
    expect(h.findMany).toHaveBeenCalledTimes(1);
    const text = sql(h.ledgerWhere());
    expect(h.ledgerWhere()).toBeDefined();
    expect(text).toContain('reference_id');
    expect(text).toContain(ORDER_ID);
    expect(text).toContain('reference_type');
  });

  it('deducts on-hand and reserved when the order is delivered', async () => {
    const h = createHarness('READY', [reserved(4)]);

    await h.service.transitionStatus(ORDER_ID, 'DELIVERED', MERCHANT_ID, 'MERCHANT');

    const [movement] = h.writtenMovements();
    expect(movement).toMatchObject({ movementType: 'SALE', quantity: -4, referenceId: ORDER_ID });
    const update = h.stockUpdates()[0]!;
    expect(update['qtyOnHand']).toBeDefined();
    expect(update['qtyReserved']).toBeDefined();
    expect(sql(update)).toContain('qty_on_hand');
  });

  it('is a no-op when the reservation was already settled', async () => {
    const h = createHarness('ACCEPTED', [
      reserved(10),
      {
        inventoryItemId: INV_RICE,
        movementType: 'RELEASE',
        quantity: 10,
        referenceType: 'ORDER',
        referenceId: ORDER_ID,
      },
    ]);

    await h.service.cancelOrder(ORDER_ID, BUYER_ID, 'Duplicate request');

    expect(h.writtenMovements()).toEqual([]);
    expect(h.stockUpdates()).toEqual([]);
    expect(h.status()).toBe('CANCELLED');
  });

  it('releases only what was actually held, not the ordered quantity', async () => {
    // Short stock: reserveStock holds 7 of the 10 ordered units.
    const h = createHarness('ACCEPTED', [reserved(7)]);

    await h.service.cancelOrder(ORDER_ID, BUYER_ID, 'Changed my mind');

    expect(h.writtenMovements()[0]!['quantity']).toBe(7);
  });

  it('normalises RESERVE rows written under the old unsigned convention', async () => {
    const legacy: LedgerRow = {
      inventoryItemId: INV_RICE,
      movementType: 'RESERVE',
      quantity: 6,
      referenceType: 'ORDER',
      referenceId: ORDER_ID,
    };
    const h = createHarness('ACCEPTED', [legacy]);

    await h.service.cancelOrder(ORDER_ID, BUYER_ID, 'Changed my mind');

    expect(h.writtenMovements()[0]!['quantity']).toBe(6);
  });

  it('settles across the multiple inventory items one order can touch', async () => {
    // Only this order's rows are handed back, because that is what the WHERE in
    // the scoping test above guarantees the database will do.
    const h = createHarness('READY', [reserved(5), reserved(8, 'inv-oil')]);

    await h.service.transitionStatus(ORDER_ID, 'DELIVERED', MERCHANT_ID, 'MERCHANT');

    expect(h.writtenMovements().map((m) => [m['inventoryItemId'], m['quantity']])).toEqual([
      [INV_RICE, -5],
      ['inv-oil', -8],
    ]);
  });

  it('releases on rejectOrder, which bypasses transitionStatus', async () => {
    const h = createHarness('PENDING_CONFIRMATION', [reserved(3)]);

    await h.service.rejectOrder(ORDER_ID, MERCHANT_ID, 'Out of stock');

    expect(h.writtenMovements()[0]).toMatchObject({ movementType: 'RELEASE', quantity: 3 });
    expect(h.status()).toBe('REJECTED');
  });

  it('leaves stock alone for statuses that do not move goods', async () => {
    const h = createHarness('ACCEPTED', [reserved(10)]);

    await h.service.transitionStatus(ORDER_ID, 'PREPARING', MERCHANT_ID, 'MERCHANT');

    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.writtenMovements()).toEqual([]);
  });
});
