import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import { enrichProductCards } from '../../../modules/catalog/product-card';

/**
 * Listing-card enrichment (A5-2) — search hits must carry the seller and a
 * price, and must keep coming from the cart's own resolver.
 */

interface Row {
  [key: string]: unknown;
}

/**
 * Fake covering the three reads `enrichProductCards` makes: sellers, active
 * variants, then one candidate-tier query per (store, MOQ) batch. Predicates are
 * ignored — the batch boundaries and the rendered SQL are asserted instead.
 */
function fakeDb(options: { stores?: Row[]; variants?: Row[]; priceBatches?: Row[][] }) {
  const counts = { stores: 0, variants: 0, prices: 0 };
  const whereSql: string[] = [];

  const db = {
    query: {
      stores: {
        findMany: async () => {
          counts.stores += 1;
          return options.stores ?? [];
        },
      },
      productVariants: {
        findMany: async () => {
          counts.variants += 1;
          return options.variants ?? [];
        },
      },
    },
    select: () => {
      const builder: Record<string, unknown> = {
        from: () => builder,
        innerJoin: () => builder,
        where: (clause: unknown) => {
          whereSql.push(inspect(clause, { depth: 12, breakLength: Infinity, compact: true }));
          return builder;
        },
        orderBy: () => builder,
        then: (resolve: (rows: Row[]) => unknown) =>
          Promise.resolve(options.priceBatches?.[counts.prices++] ?? []).then(resolve),
      };
      return builder;
    },
  };

  return { db: db as unknown as Parameters<typeof enrichProductCards>[0], counts, whereSql };
}

const AL_NOOR = {
  id: 'store-1',
  displayName: 'Al Noor Trading',
  slug: 'al-noor',
  verificationStatus: 'VERIFIED',
  currency: 'SAR',
};

const LIST = [
  { id: 'p-rice', storeId: 'store-1', moq: 10, title: 'Rice' },
  { id: 'p-oil', storeId: 'store-1', moq: 25, title: 'Oil' },
];

function tier(variantId: string, unitPriceMinor: number, currency = 'SAR'): Row {
  return {
    variantId,
    minQty: 1,
    unitPriceMinor,
    priceListId: 'pl-wholesale',
    priceListName: 'Wholesale',
    currency,
  };
}

describe('enrichProductCards', () => {
  it('attaches the seller and the cheapest variant price per product', async () => {
    const h = fakeDb({
      stores: [AL_NOOR],
      variants: [
        { id: 'v-rice-25kg', productId: 'p-rice' },
        { id: 'v-rice-50kg', productId: 'p-rice' },
        { id: 'v-oil', productId: 'p-oil' },
      ],
      priceBatches: [
        [tier('v-rice-25kg', 900), tier('v-rice-50kg', 850)],
        [tier('v-oil', 1200)],
      ],
    });

    const items = await enrichProductCards(h.db, LIST);

    expect(items.map(i => i.priceFromMinor)).toEqual([850, 1200]);
    expect(items[0]).toMatchObject({
      store: {
        id: 'store-1',
        name: 'Al Noor Trading',
        slug: 'al-noor',
        verificationStatus: 'VERIFIED',
        currency: 'SAR',
      },
      priceCurrency: 'SAR',
    });
    // Seller and variants are batch reads, not per-row ones.
    expect(h.counts.stores).toBe(1);
    expect(h.counts.variants).toBe(1);
  });

  it('prices each product at its own MOQ, in one batch per (store, MOQ) pair', async () => {
    const h = fakeDb({
      stores: [AL_NOOR],
      variants: [
        { id: 'v-rice', productId: 'p-rice' },
        { id: 'v-oil', productId: 'p-oil' },
      ],
      priceBatches: [[tier('v-rice', 900)], [tier('v-oil', 1200)]],
    });

    await enrichProductCards(h.db, LIST);

    // Two different MOQs cannot share a tier query: the quantity decides which
    // volume tier wins, so collapsing them would quote the wrong price.
    expect(h.counts.prices).toBe(2);
    expect(h.whereSql[0]).toContain('10');
    expect(h.whereSql[1]).toContain('25');
  });

  it('keeps a product whose seller row is missing instead of dropping it', async () => {
    const h = fakeDb({
      stores: [],
      variants: [{ id: 'v-rice', productId: 'p-rice' }],
      priceBatches: [[tier('v-rice', 900, 'USD')]],
    });

    const items = await enrichProductCards(h.db, [LIST[0]!]);

    expect(items).toHaveLength(1);
    expect(items[0]!.store).toBeNull();
    // The price does not depend on the seller row being present.
    expect(items[0]!.priceFromMinor).toBe(900);
    expect(items[0]!.priceCurrency).toBe('USD');
  });

  it('reports no price rather than a false one when nothing is priced', async () => {
    const h = fakeDb({
      stores: [AL_NOOR],
      variants: [], // every variant delisted → no orderable unit to price
    });

    const items = await enrichProductCards(h.db, [LIST[0]!]);

    expect(items[0]!.priceFromMinor).toBeNull();
    expect(items[0]!.store?.name).toBe('Al Noor Trading');
    expect(h.counts.prices).toBe(0);
  });

  it('issues no queries at all for an empty page', async () => {
    const h = fakeDb({});

    expect(await enrichProductCards(h.db, [])).toEqual([]);
    expect(h.counts).toEqual({ stores: 0, variants: 0, prices: 0 });
  });
});
