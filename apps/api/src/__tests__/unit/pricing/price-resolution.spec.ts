import { describe, it, expect, vi } from 'vitest';
import { priceForQty, resolveVariantPrices } from '../../../modules/pricing/price-resolution';

/**
 * Price resolution (A5-1) — the rule shared by `CartService.addItem` and the
 * product detail page, so display and charge cannot drift apart.
 *
 *  - winner = highest-priority ACTIVE list having a tier at or below the quantity
 *  - within it, the largest `minQty` tier <= qty, upper bound exclusive
 */

interface TierRow {
  variantId: string;
  priceListId?: string;
  minQty: number;
  maxQty?: number | null;
  unitPriceMinor: number;
  priceListName?: string;
  currency?: string;
}

/**
 * Minimal drizzle builder: every clause returns the builder, and awaiting it
 * resolves the next fixture set, since the function issues the candidate query
 * first and the ladder query second.
 */
function fakeDb(queries: TierRow[][]) {
  let call = 0;
  return {
    db: {
      select: () => {
        const builder: Record<string, unknown> = {
          from: () => builder,
          innerJoin: () => builder,
          where: () => builder,
          orderBy: () => builder,
          then: (
            resolve: (rows: TierRow[]) => unknown,
            reject: (err: unknown) => unknown,
          ) => Promise.resolve(queries[call++] ?? []).then(resolve, reject),
        };
        return builder;
      },
    },
    executed: () => call,
  };
}

const asDb = (db: unknown) => db as unknown as Parameters<typeof resolveVariantPrices>[0];

const WHOLESALE = {
  priceListId: 'pl-wholesale',
  priceListName: 'Wholesale',
  currency: 'SAR',
};

describe('resolveVariantPrices', () => {
  it('takes the first candidate row per variant, as the ordering guarantees', async () => {
    // The DB returns rows ordered by list priority then tier depth; the deepest
    // qualifying tier of the best list is therefore the first row per variant.
    const db = fakeDb([
      [
        { variantId: 'v-rice', minQty: 10, unitPriceMinor: 900, ...WHOLESALE },
        { variantId: 'v-rice', minQty: 1, unitPriceMinor: 1000, priceListId: 'pl-retail', priceListName: 'Retail', currency: 'SAR' },
        { variantId: 'v-oil', minQty: 5, unitPriceMinor: 2500, priceListId: 'pl-retail', priceListName: 'Retail', currency: 'USD' },
      ],
      [
        { variantId: 'v-rice', priceListId: 'pl-wholesale', minQty: 10, maxQty: 50, unitPriceMinor: 900 },
        { variantId: 'v-rice', priceListId: 'pl-wholesale', minQty: 50, maxQty: null, unitPriceMinor: 800 },
        { variantId: 'v-oil', priceListId: 'pl-retail', minQty: 5, maxQty: null, unitPriceMinor: 2500 },
      ],
    ]);

    const prices = await resolveVariantPrices(asDb(db.db), 'store-1', ['v-rice', 'v-oil'], 12);

    expect([...prices.keys()]).toEqual(['v-rice', 'v-oil']);
    expect(prices.get('v-rice')).toEqual({
      priceListId: 'pl-wholesale',
      priceListName: 'Wholesale',
      currency: 'SAR',
      unitPriceMinor: 900,
      minQty: 10,
      tiers: [
        { minQty: 10, maxQty: 50, unitPriceMinor: 900 },
        { minQty: 50, maxQty: null, unitPriceMinor: 800 },
      ],
    });
    // Each variant keeps its own list's currency — prices are never merged across
    // stores or lists.
    expect(prices.get('v-oil')?.currency).toBe('USD');
    expect(db.executed()).toBe(2);
  });

  it('skips the ladder read entirely when the caller only needs a unit price', async () => {
    // `ladder: false` is what the cart passes, so snapshotting a line costs no
    // more reads than the inline query it replaced.
    const db = fakeDb([
      [{ variantId: 'v-rice', minQty: 10, unitPriceMinor: 900, ...WHOLESALE }],
      [{ variantId: 'v-rice', priceListId: 'pl-wholesale', minQty: 10, maxQty: null, unitPriceMinor: 900 }],
    ]);

    const prices = await resolveVariantPrices(
      asDb(db.db),
      'store-1',
      ['v-rice'],
      12,
      { ladder: false },
    );

    expect(prices.get('v-rice')?.unitPriceMinor).toBe(900);
    expect(prices.get('v-rice')?.minQty).toBe(10);
    expect(prices.get('v-rice')?.tiers).toEqual([]);
    expect(db.executed()).toBe(1);
  });

  it('omits variants with no qualifying tier', async () => {
    const db = fakeDb([[{ variantId: 'v-rice', minQty: 10, unitPriceMinor: 900, ...WHOLESALE }]]);

    const prices = await resolveVariantPrices(asDb(db.db), 'store-1', ['v-rice', 'v-gone'], 12);

    expect(prices.has('v-gone')).toBe(false);
    expect(prices.size).toBe(1);
  });

  it('asks for no ladder query when nothing qualifies', async () => {
    const db = fakeDb([[]]);

    const prices = await resolveVariantPrices(asDb(db.db), 'store-1', ['v-rice'], 1);

    expect(prices.size).toBe(0);
    expect(db.executed()).toBe(1);
  });

  it('short-circuits an empty variant list instead of issuing IN ()', async () => {
    const select = vi.fn();

    const prices = await resolveVariantPrices(
      asDb({ select }),
      'store-1',
      [],
      5,
    );

    expect(prices.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('priceForQty', () => {
  const ladder = [
    { minQty: 1, maxQty: 10, unitPriceMinor: 1000 },
    { minQty: 10, maxQty: 50, unitPriceMinor: 900 },
    { minQty: 50, maxQty: null, unitPriceMinor: 800 },
  ];

  it('picks the deepest tier at or below the quantity', () => {
    expect(priceForQty(ladder, 5)).toBe(1000);
    expect(priceForQty(ladder, 25)).toBe(900);
    expect(priceForQty(ladder, 5000)).toBe(800);
  });

  it('treats maxQty as an exclusive upper bound', () => {
    // qty 10 belongs to the 10-50 tier, not the 1-10 one.
    expect(priceForQty(ladder, 10)).toBe(900);
    expect(priceForQty(ladder, 50)).toBe(800);
  });

  it('returns undefined below the first tier and for an empty ladder', () => {
    expect(priceForQty(ladder, 0)).toBeUndefined();
    expect(priceForQty([], 10)).toBeUndefined();
  });
});
