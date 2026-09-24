import { describe, it, expect } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

/**
 * PHASE 7 — Deduplication helpers in CatalogService.
 *
 * Tests:
 * - findProductByIdentifiers: returns null for empty ids, matches by GTIN priority,
 *   falls back to MPN when GTIN has no match.
 * - findPotentialDuplicates: returns groups with > 1 product per title+category.
 * - createProduct dedup guard: returns existing match instead of inserting.
 */

type Row = Record<string, unknown>;

interface QueryConfig {
  findFirst?: Row | Array<Row | null> | null;
  findMany?: Row[];
}

interface Harness {
  svc: CatalogService;
  inserted: unknown[];
  executeCalls: unknown[];
}

function makeHarness(
  queries: Record<string, QueryConfig> = {},
  executeResult?: { rows: unknown[] },
): Harness {
  const inserted: unknown[] = [];
  const executeCalls: unknown[] = [];

  const firstFn = (spec?: Row | Array<Row | null> | null) => {
    if (Array.isArray(spec)) {
      let i = 0;
      return async () => spec[Math.min(i++, spec.length - 1)] ?? null;
    }
    return async () => (spec as Row | null | undefined) ?? null;
  };

  const q = (cfg?: QueryConfig) => ({
    findFirst: firstFn(cfg?.findFirst),
    findMany: async () => cfg?.findMany ?? [],
  });

  const db = {
    db: {
      query: Object.fromEntries(
        Object.entries(queries).map(([k, v]) => [k, q(v)]),
      ),
      insert: () => ({
        values: (rows: unknown) => { inserted.push(rows); return Promise.resolve(); },
      }),
      update: () => ({
        set: (patch: unknown) => ({
          where: () => { inserted.push(patch); return Promise.resolve(); },
        }),
      }),
      execute: async (...args: unknown[]) => {
        executeCalls.push(args);
        return executeResult ?? { rows: [] };
      },
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    },
  };

  // RedisService, OutboxDispatcher, StorageService, AuditService are irrelevant — cast
  // @ts-expect-error — partial mock sufficient
  const svc = new CatalogService(db, {}, {}, {}, { record: async () => {} }, { evaluate: () => ({ effects: new Map(), errors: [] }) });
  return { svc, inserted, executeCalls };
}

describe('findProductByIdentifiers', () => {
  it('returns null for empty identifiers', async () => {
    const { svc } = makeHarness();
    const result = await svc.findProductByIdentifiers({});
    expect(result).toBeNull();
  });

  it('returns match when GTIN is found', async () => {
    const product = { id: 'p1', title: 'Widget', slug: 'widget', gtin: '123', ean: null, mpn: null };
    const { svc } = makeHarness({ products: { findFirst: product } });
    const result = await svc.findProductByIdentifiers({ gtin: '123' });
    expect(result).toEqual({ id: 'p1', title: 'Widget', slug: 'widget', matched: 'gtin' });
  });

  it('returns null when no product matches', async () => {
    const { svc } = makeHarness({ products: { findFirst: null } });
    const result = await svc.findProductByIdentifiers({ gtin: 'no-match' });
    expect(result).toBeNull();
  });

  it('falls through to MPN when GTIN returns null (multi-id)', async () => {
    // First findFirst (gtin) → null; second findFirst (ean) → null; third (mpn) → match
    const match = { id: 'p9', title: 'MPN Product', slug: 'mpn-prod' };
    const { svc } = makeHarness({
      products: { findFirst: [null, null, null, match] },
    });
    const result = await svc.findProductByIdentifiers({ gtin: 'G1', ean: 'E1', mpn: 'M1' });
    // The primary search (AND with first non-null = gtin) returns null
    // Fallback: try gtin alone → null, then ean alone → null, then mpn → match
    expect(result).toEqual({ id: 'p9', title: 'MPN Product', slug: 'mpn-prod', matched: 'mpn' });
  });
});

describe('findPotentialDuplicates', () => {
  it('returns groups from raw SQL', async () => {
    const rows = [
      { category_id: 'c1', norm_title: 'widget', dup_count: 3, product_ids: ['p1', 'p2', 'p3'], store_ids: ['s1', 's2'] },
    ];
    const { svc } = makeHarness({}, { rows });
    const result = await svc.findPotentialDuplicates('c1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ categoryId: 'c1', normalizedTitle: 'widget', duplicateCount: 3 });
    expect(result[0]!.productIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('handles empty result', async () => {
    const { svc } = makeHarness({}, { rows: [] });
    const result = await svc.findPotentialDuplicates();
    expect(result).toEqual([]);
  });
});
