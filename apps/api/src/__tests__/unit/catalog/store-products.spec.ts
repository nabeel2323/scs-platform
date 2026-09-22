import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import { CatalogService } from '../../../modules/catalog/catalog.service';

/**
 * A5-2 residual — a store's own product grid.
 *
 * `GET /v1/stores/:storeId/products` serves two audiences from one handler: the
 * buyer-facing store profile and a merchant's own catalog screen. Its rows are
 * now priced and attributed the way search rows are, which makes three properties
 * worth pinning — the enrichment cannot be dropped without a test failing, the
 * visibility filter stays the caller's decision, and a caller that sends no
 * `limit` must not start losing rows to a new default.
 */

interface Captured {
  productsQuery?: { where?: unknown; limit?: number; offset?: number };
  priceWhere: string[];
}

function sqlText(node: unknown): string {
  // Drizzle SQL wrappers are circular, so JSON.stringify throws — inspect
  // renders the whole clause tree (column names + bound param values).
  return inspect(node, { depth: 12, breakLength: Infinity, compact: true });
}

function harness(
  rows: unknown[],
  captured: Captured,
  options: { stores?: unknown[]; variants?: unknown[]; priceRows?: unknown[]; totalCount?: number } = {},
) {
  const priceChain: Record<string, unknown> = {};
  priceChain['from'] = () => priceChain;
  priceChain['innerJoin'] = () => priceChain;
  priceChain['where'] = (predicate: unknown) => {
    captured.priceWhere.push(sqlText(predicate));
    return priceChain;
  };
  priceChain['orderBy'] = () => priceChain;
  priceChain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(options.priceRows ?? []).then(resolve);

  // Count query mock: returns { count: N } for the paging envelope.
  const countChain: Record<string, unknown> = {};
  countChain['from'] = () => countChain;
  countChain['where'] = () => countChain;
  countChain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([{ count: options.totalCount ?? rows.length }]).then(resolve);

  const db = {
    query: {
      products: {
        findMany: (opts: { where?: unknown; limit?: number; offset?: number }) => {
          captured.productsQuery = opts;
          return Promise.resolve(rows);
        },
      },
      stores: { findMany: async () => options.stores ?? [] },
      productVariants: { findMany: async () => options.variants ?? [] },
    },
    select: () => priceChain,
  };

  // Override db.select to return countChain for count queries
  const dbWithCount = {
    ...db,
    select: (cols: unknown) => {
      // If selecting count, return the count chain
      if (cols && typeof cols === 'object' && 'count' in (cols as Record<string, unknown>)) {
        return countChain;
      }
      return priceChain;
    },
  };

  return new CatalogService(
    { db: dbWithCount } as never,
    { client: {} } as never,
    { publish: async () => undefined } as never,
    { createPresignedGetUrl: async () => null } as never,
  );
}

const RICE = {
  id: 'p-rice',
  storeId: 'store-1',
  title: 'Basmati Rice',
  status: 'ACTIVE',
  moq: 10,
  images: ['https://cdn.test/rice.jpg'],
  attributes: {},
  createdAt: new Date('2026-01-04'),
};

const STORE = {
  id: 'store-1',
  displayName: 'Al Noor Trading',
  slug: 'al-noor',
  verificationStatus: 'VERIFIED',
  currency: 'SAR',
};

const VARIANTS = [{ id: 'v-rice-25kg', productId: 'p-rice' }];

const PRICE_ROWS = [
  {
    variantId: 'v-rice-25kg',
    minQty: 10,
    unitPriceMinor: 1250,
    priceListId: 'pl-wholesale',
    priceListName: 'Wholesale',
    currency: 'SAR',
  },
];

function capture(): Captured {
  return { priceWhere: [] };
}

describe('CatalogService.listProductsByStore', () => {
  it('attaches the seller and the price without dropping the product columns', async () => {
    const captured = capture();
    const svc = harness([RICE], captured, {
      stores: [STORE],
      variants: VARIANTS,
      priceRows: PRICE_ROWS,
    });

    const result = await svc.listProductsByStore('store-1');

    expect(result.items[0]).toMatchObject({
      // Everything the merchant catalog screen reads must survive the enrichment.
      id: 'p-rice',
      title: 'Basmati Rice',
      moq: 10,
      images: ['https://cdn.test/rice.jpg'],
      store: { name: 'Al Noor Trading', slug: 'al-noor', verificationStatus: 'VERIFIED' },
      priceFromMinor: 1250,
      priceCurrency: 'SAR',
    });
    // Prices are resolved for this store only — never from a neighbouring tenant.
    expect(captured.priceWhere).toHaveLength(1);
    expect(captured.priceWhere[0]).toContain('store-1');
  });

  it('filters visibility on the caller\'s terms and always hides soft-deleted rows', async () => {
    const buyer = capture();
    await harness([RICE], buyer, { stores: [STORE], variants: VARIANTS }).listProductsByStore(
      'store-1',
      { status: 'ACTIVE' },
    );
    expect(sqlText(buyer.productsQuery?.where)).toContain('ACTIVE');
    // The guard against resurrected rows is not the caller's to waive.
    expect(sqlText(buyer.productsQuery?.where)).toContain('deleted_at');

    const merchant = capture();
    await harness([RICE], merchant, { stores: [STORE], variants: VARIANTS }).listProductsByStore(
      'store-1',
      {},
    );
    // A merchant screen sends no status and must still see its DRAFT listings.
    expect(sqlText(merchant.productsQuery?.where)).not.toContain('ACTIVE');
    expect(sqlText(merchant.productsQuery?.where)).toContain('deleted_at');
  });

  it('honours limit/offset only when the caller sends them, capped at one page', async () => {
    const unlimited = capture();
    await harness([], unlimited).listProductsByStore('store-1');
    // Mobile's store screen calls without a limit; a silent default would trim it.
    expect(unlimited.productsQuery?.limit).toBeUndefined();
    expect(unlimited.productsQuery?.offset).toBeUndefined();

    const paging = capture();
    await harness([], paging).listProductsByStore('store-1', { limit: 50, offset: 100 });
    expect(paging.productsQuery?.limit).toBe(50);
    expect(paging.productsQuery?.offset).toBe(100);

    const greedy = capture();
    await harness([], greedy).listProductsByStore('store-1', { limit: 100_000 });
    expect(greedy.productsQuery?.limit).toBe(500);

    const junk = capture();
    // A non-numeric limit reaches the service as NaN; treating it as absent is
    // what keeps one malformed query param from erroring the whole listing.
    await harness([], junk).listProductsByStore('store-1', { limit: Number.NaN, offset: -5 });
    expect(junk.productsQuery?.limit).toBeUndefined();
    expect(junk.productsQuery?.offset).toBeUndefined();
  });

  it('still lists a product that has no price rather than dropping it from the grid', async () => {
    const captured = capture();
    const svc = harness([RICE], captured, { stores: [STORE], variants: [] });

    const result = await svc.listProductsByStore('store-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.store?.name).toBe('Al Noor Trading');
    // The card falls back to "Price on request" instead of inventing a figure.
    expect(result.items[0]?.priceFromMinor).toBeNull();
    expect(captured.priceWhere).toHaveLength(0);
  });
});
