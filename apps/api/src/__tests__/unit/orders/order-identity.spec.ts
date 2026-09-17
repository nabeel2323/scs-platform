import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import {
  FALLBACK_ORDER_CURRENCY,
  attachItemCounts,
  attachOrderIdentity,
  totalsByCurrency,
} from '../../../modules/orders/order-identity';

/**
 * Order money identity (A2-4, A4-6, A5-4, A5-16).
 *
 * Every amount on an order is in some currency and belongs to some supplier. The
 * rows carried neither name, so clients guessed SAR and printed order ids where
 * a seller should be. These tests pin the precedence rules — above all that a
 * snapshot outranks a live store row, and that an inference is labelled.
 */

interface Row {
  [key: string]: unknown;
}

function fakeDb(options: {
  stores?: Row[];
  counts?: { orderId: string; itemCount: number }[];
}) {
  const queries = { stores: 0, itemCounts: 0 };
  const storeWhere: string[] = [];
  const countWhere: string[] = [];
  const show = (value: unknown) =>
    inspect(value, { depth: 12, breakLength: Infinity, compact: true });

  const db = {
    query: {
      stores: {
        findMany: (query: any) => {
          queries.stores += 1;
          storeWhere.push(show(query?.where));
          return Promise.resolve(options.stores ?? []);
        },
      },
    },
    select: () => {
      const builder: Record<string, unknown> = {
        from: () => builder,
        where: (clause: unknown) => {
          queries.itemCounts += 1;
          countWhere.push(show(clause));
          return builder;
        },
        groupBy: () => builder,
        then: (resolve: (rows: Row[]) => unknown) =>
          Promise.resolve(options.counts ?? []).then(resolve),
      };
      return builder;
    },
  };

  return {
    db: db as unknown as Parameters<typeof attachOrderIdentity>[0],
    queries,
    storeWhere,
    countWhere,
  };
}

const SAR_STORE = { id: 'store-1', displayName: 'Al Noor Trading', slug: 'al-noor', currency: 'SAR' };
const AED_STORE = { id: 'store-2', displayName: 'Emirates Fresh', slug: 'emirates-fresh', currency: 'AED' };

describe('attachOrderIdentity', () => {
  it('prefers the checkout snapshot over the seller\'s current currency', async () => {
    // The seller switched currency after the order was placed. Restating a past
    // invoice would be a lie, so the recorded code wins.
    const h = fakeDb({ stores: [SAR_STORE] });
    const [row] = await attachOrderIdentity(h.db, [
      { storeId: 'store-1', currency: 'AED', totalMinor: 4500 },
    ]);

    expect(row).toMatchObject({
      storeName: 'Al Noor Trading',
      storeSlug: 'al-noor',
      currency: 'AED',
      currencyFromSnapshot: true,
    });
  });

  it('falls back to the seller\'s currency and says it was not snapshotted', async () => {
    const h = fakeDb({ stores: [AED_STORE] });
    const [row] = await attachOrderIdentity(h.db, [
      { storeId: 'store-2', totalMinor: 4500 },
    ]);

    expect(row?.currency).toBe('AED');
    expect(row?.currencyFromSnapshot).toBe(false);
  });

  it('names the seller and reports the fallback when nothing can be read', async () => {
    const h = fakeDb({ stores: [] });
    const [row] = await attachOrderIdentity(h.db, [
      { storeId: 'deleted-store', totalMinor: 100 },
    ]);

    expect(row?.storeName).toBeNull();
    expect(row?.storeSlug).toBeNull();
    expect(row?.currency).toBe(FALLBACK_ORDER_CURRENCY);
    expect(row?.currencyFromSnapshot).toBe(false);
  });

  it('resolves a whole page with one batched store read', async () => {
    const h = fakeDb({ stores: [SAR_STORE, AED_STORE] });
    const rows = await attachOrderIdentity(h.db, [
      { storeId: 'store-1', currency: 'SAR' },
      { storeId: 'store-2', currency: 'AED' },
      { storeId: 'store-1', currency: 'SAR' },
    ]);

    expect(h.queries.stores).toBe(1);
    expect(rows.map(r => r.currency)).toEqual(['SAR', 'AED', 'SAR']);
    // Both sellers are asked for in the same statement, not one per row.
    expect(h.storeWhere[0]).toContain('store-1');
    expect(h.storeWhere[0]).toContain('store-2');
  });

  it('issues no query for an empty page', async () => {
    const h = fakeDb({});
    expect(await attachOrderIdentity(h.db, [])).toEqual([]);
    expect(h.queries.stores).toBe(0);
  });
});

describe('totalsByCurrency', () => {
  it('keeps amounts apart instead of adding unlike money', () => {
    const totals = totalsByCurrency([
      { currency: 'SAR', totalMinor: 1200 },
      { currency: 'AED', totalMinor: 4500 },
      { currency: 'SAR', totalMinor: 300 },
    ]);

    expect(totals).toEqual({ SAR: 1500, AED: 4500 });
  });

  it('returns nothing for nothing', () => {
    expect(totalsByCurrency([])).toEqual({});
  });
});

describe('attachItemCounts', () => {
  it('counts each order\'s lines in one grouped query', async () => {
    const h = fakeDb({
      counts: [
        { orderId: 'o-1', itemCount: 3 },
        { orderId: 'o-2', itemCount: 1 },
      ],
    });
    const rows = await attachItemCounts(h.db, [{ id: 'o-1' }, { id: 'o-2' }, { id: 'o-3' }]);

    expect(rows.map(r => r.itemCount)).toEqual([3, 1, 0]);
    expect(h.queries.itemCounts).toBe(1);
    expect(h.countWhere[0]).toContain('o-1');
  });

  it('does not query at all for an empty page', async () => {
    const h = fakeDb({});
    expect(await attachItemCounts(h.db, [])).toEqual([]);
    expect(h.queries.itemCounts).toBe(0);
  });
});
