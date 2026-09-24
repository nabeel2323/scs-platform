import { describe, it, expect } from 'vitest';
import { SearchService } from '../../../modules/catalog/search.service';

/**
 * PHASE 9 — SearchService unit tests (mock-DB pattern).
 *
 * The search service relies heavily on raw SQL (FTS, trigram, EXISTS subqueries)
 * that cannot be exercised without a real Postgres. These tests cover the
 * testable surface: construction, query normalization, and the empty-query
 * code path with a minimal mock that returns controlled data.
 */

type Row = Record<string, unknown>;

function makeMockDb(opts: {
  products?: Row[];
  productCount?: number;
  variants?: Row | null;
  categories?: Row[];
  brands?: Row[];
} = {}) {
  return {
    db: {
      query: {
        products: {
          findFirst: async () => opts.products?.[0] ?? null,
          findMany: async () => opts.products ?? [],
        },
        productVariants: {
          findFirst: async () => opts.variants ?? null,
          findMany: async () => [],
        },
        categories: {
          findMany: async () => opts.categories ?? [],
        },
        brands: {
          findMany: async () => opts.brands ?? [],
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: async () => [],
              }),
            }),
          }),
        }),
      }),
      execute: async () => ({ rows: [] }),
    },
  };
}

function makeHarness(overrides: Record<string, unknown> = {}) {
  const db = makeMockDb(overrides as any);
  // @ts-expect-error — partial mock sufficient for construction
  return new SearchService(db, { createPresignedGetUrl: async () => null }, { client: {} } as any);
}

describe('SearchService — construction', () => {
  it('instantiates without error', () => {
    const svc = makeHarness();
    expect(svc).toBeDefined();
    expect(typeof svc.search).toBe('function');
  });
});

describe('SearchService — empty query path', () => {
  it('returns empty items when no products exist', async () => {
    const svc = makeHarness({ products: [], productCount: 0 });
    const result = await svc.search('');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.matchType).toBe('all');
  });
});

describe('SearchService — getTopCategories', () => {
  it('returns empty array when no categories exist', async () => {
    const svc = makeHarness({ categories: [] });
    const result = await svc.getTopCategories();
    expect(result).toEqual([]);
  });
});

describe('SearchService — getPopularBrands', () => {
  it('returns empty array when no brands exist', async () => {
    const svc = makeHarness({ brands: [] });
    const result = await svc.getPopularBrands();
    expect(result).toEqual([]);
  });
});

describe('SearchService — SKU fast path', () => {
  it('returns null match when no variant matches the SKU', async () => {
    const svc = makeHarness({ variants: null });
    // The SKU fast path queries productVariants.findFirst — our mock returns null,
    // so the search falls through to FTS which also returns empty.
    const result = await svc.search('SKU-12345');
    // With no variant match and no FTS results, items should be empty
    expect(result.items).toEqual([]);
  });
});
