import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../../../modules/catalog/search.service';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * PHASE 9 — SearchService unit tests (mock-DB pattern).
 *
 * The search service relies heavily on raw SQL (FTS, trigram, EXISTS subqueries)
 * that cannot be exercised without a real Postgres. These tests cover the
 * testable surface: construction, query normalization, and the empty-query
 * code path with a minimal mock that returns controlled data.
 */

type Row = Record<string, unknown>;

function makeMockDb(
  opts: {
    products?: Row[];
    productCount?: number;
    variants?: Row | null;
    activeOffer?: Row | null;
    capturedProductWhere?: unknown[];
    categories?: Row[];
    brands?: Row[];
    capturedWhere?: unknown[];
    executedSql?: unknown[];
  } = {},
) {
  return {
    db: {
      query: {
        products: {
          findFirst: async (config?: { where?: unknown }) => {
            if (config?.where) opts.capturedProductWhere?.push(config.where);
            return opts.products?.[0] ?? null;
          },
          findMany: async (config?: { where?: unknown }) => {
            if (config?.where) opts.capturedWhere?.push(config.where);
            return opts.products ?? [];
          },
        },
        productVariants: {
          findFirst: async () => opts.variants ?? null,
          findMany: async () => [],
        },
        merchantOffers: {
          findFirst: async () => opts.activeOffer ?? null,
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
          where: (where: unknown) => {
            opts.capturedWhere?.push(where);
            return {
              orderBy: () => ({
                limit: () => ({
                  offset: async () => [],
                }),
              }),
            };
          },
        }),
      }),
      execute: async (query: unknown) => {
        opts.executedSql?.push(query);
        return { rows: [] };
      },
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

describe('SearchService — publication boundary', () => {
  it('restricts empty-query product rows and counts to ACTIVE products', async () => {
    const capturedWhere: unknown[] = [];
    const svc = makeHarness({ products: [], capturedWhere });

    await svc.search('');

    expect(capturedWhere.length).toBeGreaterThanOrEqual(2);
    for (const where of capturedWhere) {
      const query = new PgDialect().sqlToQuery(where as any);
      expect(query.params).toContain('ACTIVE');
      expect(query.params).not.toContain('PUBLISHED');
    }
  });

  it('restricts full-text search and count SQL to ACTIVE products', async () => {
    const executedSql: unknown[] = [];
    const svc = makeHarness({ executedSql });

    await svc.search('laptop');

    expect(executedSql).toHaveLength(2);
    for (const statement of executedSql) {
      const query = new PgDialect().sqlToQuery(statement as any);
      expect(query.sql).toContain("p.status = 'ACTIVE'");
      expect(query.sql).not.toContain('PUBLISHED');
    }
  });

  it('does not return a PUBLISHED-only product through the SKU fast path', async () => {
    const executedSql: unknown[] = [];
    const svc = makeHarness({
      variants: { id: 'variant-a', productId: 'product-a' },
      products: [
        {
          id: 'product-a',
          status: 'PUBLISHED',
          deletedAt: null,
        },
      ],
      executedSql,
    });

    const result = await svc.search('SKU-PRIVATE');

    expect(result.items).toEqual([]);
    expect(executedSql).toHaveLength(2);
    for (const statement of executedSql) {
      const query = new PgDialect().sqlToQuery(statement as any);
      expect(query.sql).toContain("p.status = 'ACTIVE'");
    }
  });
});

describe('SearchService — active offer filter', () => {
  it('adds an ACTIVE merchant-offer predicate to empty-query result and count scopes', async () => {
    const capturedWhere: unknown[] = [];
    const svc = makeHarness({ products: [], capturedWhere });

    await svc.search('', { hasOffers: true });

    expect(capturedWhere.length).toBeGreaterThanOrEqual(2);
    for (const where of capturedWhere) {
      const query = new PgDialect().sqlToQuery(where as any);
      expect(query.sql).toContain('merchant_offers');
      expect(query.sql).toContain("mo.status = 'ACTIVE'");
      expect(query.sql).toContain('mo.is_available = true');
    }
  });

  it('adds an ACTIVE merchant-offer predicate to full-text result and count SQL', async () => {
    const executedSql: unknown[] = [];
    const svc = makeHarness({ executedSql });

    await svc.search('laptop', { hasOffers: true });

    expect(executedSql).toHaveLength(2);
    for (const statement of executedSql) {
      const query = new PgDialect().sqlToQuery(statement as any);
      expect(query.sql).toContain('merchant_offers');
      expect(query.sql).toContain("mo.status = 'ACTIVE'");
    }
  });

  it('applies store/category/brand constraints to the exact-SKU fast path', async () => {
    const capturedProductWhere: unknown[] = [];
    const svc = makeHarness({
      variants: { id: 'variant-a', productId: 'product-a' },
      products: [
        {
          id: 'product-a',
          categoryId: 'category-a',
          brandId: 'brand-a',
          status: 'ACTIVE',
          deletedAt: null,
        },
      ],
      activeOffer: { id: 'offer-a' },
      capturedProductWhere,
    });

    const result = await svc.search('SKU-PRIVATE', {
      storeId: 'store-a',
      categoryId: 'category-a',
      brandId: 'brand-a',
      hasOffers: true,
    });

    expect(result.matchType).toBe('exact');
    const compiled = new PgDialect().sqlToQuery(capturedProductWhere[0] as any);
    expect(compiled.params).toContain('store-a');
    expect(compiled.params).toContain('category-a');
    expect(compiled.params).toContain('brand-a');
  });

  it('does not let the SKU fast path bypass the active-offer filter', async () => {
    const executedSql: unknown[] = [];
    const svc = makeHarness({
      variants: { id: 'variant-a', productId: 'product-a' },
      products: [{ id: 'product-a', status: 'ACTIVE', deletedAt: null }],
      activeOffer: null,
      executedSql,
    });

    const result = await svc.search('SKU-PRIVATE', { hasOffers: true });

    expect(result.items).toEqual([]);
    expect(executedSql).toHaveLength(2);
  });
});

describe('SearchService — cached facet actor boundary (G-002)', () => {
  it('keeps Redis cache I/O outside the DB actor scope and scopes the facet query', async () => {
    const actor = { sub: 'buyer-user', role: 'BUYER', activeOrg: 'org-1' };
    let activeActor: Record<string, unknown> | null = null;
    const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
      activeActor = context;
      try {
        return await operation();
      } finally {
        activeActor = null;
      }
    });
    const redisGet = vi.fn(async (key: string) => {
      expect(activeActor).toBeNull();
      expect(key).toBe('search:facets:v2:all');
      return null;
    });
    const redisSet = vi.fn(async () => {
      expect(activeActor).toBeNull();
    });
    const db = {
      get currentActorContext() {
        return activeActor;
      },
      withActorContext,
      db: {},
    };
    const svc = new SearchService(
      db as any,
      { createPresignedGetUrl: async () => null } as any,
      { client: { get: redisGet, set: redisSet } } as any,
    );
    const getFacets = vi.spyOn(svc, 'getFacets').mockImplementation(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return [];
    });

    const result = await svc.getFacetsCached(undefined, actor);

    expect(result).toEqual([]);
    expect(withActorContext).toHaveBeenCalledOnce();
    expect(getFacets).toHaveBeenCalledOnce();
    expect(redisGet).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledOnce();
  });

  it('restricts facet taxonomy and values to active platform categories and published products', async () => {
    const whereConditions: unknown[] = [];
    let selectCount = 0;
    const select = vi.fn(() => {
      const index = selectCount++;
      const builder: any = {
        from: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn((condition: unknown) => {
          whereConditions.push(condition);
          if (index === 0) return [{ id: 'type-1' }];
          if (index === 1) return [{ code: 'ram_gb', name: 'RAM', type: 'INTEGER' }];
          return builder;
        }),
        groupBy: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        limit: vi.fn(async () => [{ val: '16', cnt: 2 }]),
      };
      return builder;
    });
    const attributeDefinitionsFindMany = vi.fn().mockResolvedValue([
      { id: 'attribute-ram', code: 'ram_gb' },
    ]);
    const svc = new SearchService(
      { db: { select, query: { attributeDefinitions: { findMany: attributeDefinitionsFindMany } } } } as any,
      {} as any,
      {} as any,
    );

    const result = await svc.getFacets('platform-category');

    expect(result).toEqual([
      { code: 'ram_gb', label: 'RAM', type: 'INTEGER', values: [{ value: '16', count: 2 }] },
    ]);
    expect(selectCount).toBe(3);

    const taxonomyWhere = new PgDialect().sqlToQuery(whereConditions[0] as any);
    expect(taxonomyWhere.sql.toLowerCase()).toContain('store_id');
    expect(taxonomyWhere.sql.toLowerCase()).toContain('is null');
    expect(taxonomyWhere.sql.toLowerCase()).toContain('is_active');
    expect(taxonomyWhere.params).toContain('platform-category');

    const valuesWhere = new PgDialect().sqlToQuery(whereConditions[2] as any);
    expect(valuesWhere.params).toContain('attribute-ram');
    expect(valuesWhere.params).toContain('ACTIVE');
    expect(valuesWhere.sql.toLowerCase()).toContain('deleted_at');
    expect(valuesWhere.sql.toLowerCase()).toContain('is null');
    expect(valuesWhere.sql.toLowerCase()).toContain('product_type_id');
  });

  it('rejects cached facet reads without a verified user actor', async () => {
    const svc = new SearchService(
      {} as any,
      {} as any,
      { client: {} } as any,
    );

    await expect(svc.getFacetsCached(undefined, undefined as any)).rejects.toThrow(
      'Authenticated user actor context is required',
    );
  });
});
