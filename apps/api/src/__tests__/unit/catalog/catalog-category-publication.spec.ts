import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CatalogService } from '../../../modules/catalog/catalog.service';

describe('Catalog canonical category publication filters', () => {
  it('constrains buyer-facing category product rows to ACTIVE products', async () => {
    const service = Object.create(CatalogService.prototype) as CatalogService;
    (service as any).db = {
      db: {
        query: {
          categories: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'category-a',
              slug: 'category-a',
            }),
          },
        },
      },
    };

    vi.spyOn(service as any, 'loadPlatformCategoryNodes').mockResolvedValue([]);
    const rowsQuery = vi.spyOn(service as any, 'queryCategoryProductRows').mockResolvedValue([]);

    await service.getCategoryProducts('category-a');

    const [conditions] = rowsQuery.mock.calls[0] as [unknown[]];
    expect(conditions).toHaveLength(3);
    const statusFilter = new PgDialect().sqlToQuery(conditions[2] as any);
    expect(statusFilter.params).toContain('ACTIVE');
  });

  it('preserves draft-inclusive canonical product counts in admin category list responses', async () => {
    let capturedWhere: unknown;
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn((where: unknown) => {
        capturedWhere = where;
        return chain;
      }),
      groupBy: vi.fn().mockResolvedValue([]),
    };
    const service = Object.create(CatalogService.prototype) as CatalogService;
    (service as any).db = {
      db: {
        query: {
          categories: {
            findMany: vi.fn().mockResolvedValue([{ id: 'category-a' }]),
          },
        },
        select: vi.fn(() => chain),
      },
    };

    await service.listCategories();

    const query = new PgDialect().sqlToQuery(capturedWhere as any);
    expect(query.sql).toContain('"store_id" is null');
    expect(query.sql).toContain('"deleted_at" is null');
    expect(query.params).not.toContain('ACTIVE');
  });
});
