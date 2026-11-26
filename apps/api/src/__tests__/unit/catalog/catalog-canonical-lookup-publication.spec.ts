import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CatalogService } from '../../../modules/catalog/catalog.service';

function sqlText(expression: unknown) {
  return new PgDialect().sqlToQuery(expression as any);
}

describe('Canonical product lookup publication boundary', () => {
  it('matches identifiers only against ACTIVE platform-canonical products', async () => {
    const whereCalls: unknown[] = [];
    const service = Object.create(CatalogService.prototype) as CatalogService;
    (service as any).db = {
      db: {
        query: {
          products: {
            findFirst: vi.fn(async (config: any) => {
              whereCalls.push(config.where);
              return {
                id: 'canonical-active',
                title: 'Published product',
                slug: 'published-product',
                gtin: '000123',
                ean: null,
                mpn: null,
              };
            }),
          },
        },
      },
    };

    await expect(service.findProductByIdentifiers({ gtin: '000123' })).resolves.toEqual({
      id: 'canonical-active',
      title: 'Published product',
      slug: 'published-product',
      matched: 'gtin',
    });

    const query = sqlText(whereCalls[0]);
    expect(query.sql).toContain('"store_id" is null');
    expect(query.sql).toContain('"deleted_at" is null');
    expect(query.params).toContain('ACTIVE');
  });

  it('applies the same canonical/publication scope to fallback identifier matches', async () => {
    const whereCalls: unknown[] = [];
    const findFirst = vi.fn(async (config: any) => {
      whereCalls.push(config.where);
      return whereCalls.length === 1
        ? null
        : { id: 'canonical-active', title: 'Published product', slug: 'published-product' };
    });
    const service = Object.create(CatalogService.prototype) as CatalogService;
    (service as any).db = { db: { query: { products: { findFirst } } } };

    await expect(
      service.findProductByIdentifiers({ gtin: 'missing', ean: '000456' }),
    ).resolves.toEqual({
      id: 'canonical-active',
      title: 'Published product',
      slug: 'published-product',
      matched: 'ean',
    });

    expect(whereCalls).toHaveLength(2);
    for (const where of whereCalls) {
      const query = sqlText(where);
      expect(query.sql).toContain('"store_id" is null');
      expect(query.sql).toContain('"deleted_at" is null');
      expect(query.params).toContain('ACTIVE');
    }
  });

  it('restricts canonical selector search to ACTIVE platform products', async () => {
    let capturedWhere: unknown;
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn((where: unknown) => {
        capturedWhere = where;
        return chain;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    const service = Object.create(CatalogService.prototype) as CatalogService;
    (service as any).db = { db: { select: vi.fn(() => chain) } };

    await expect(service.searchCanonicalProducts({ search: 'laptop' })).resolves.toEqual({
      items: [],
      total: 0,
    });

    const query = sqlText(capturedWhere);
    expect(query.sql).toContain('"store_id" is null');
    expect(query.sql).toContain('"deleted_at" is null');
    expect(query.params).toContain('ACTIVE');
  });
});
