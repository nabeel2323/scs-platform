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
    const rowsQuery = vi
      .spyOn(service as any, 'queryCategoryProductRows')
      .mockResolvedValue([]);

    await service.getCategoryProducts('category-a');

    const [conditions] = rowsQuery.mock.calls[0] as [unknown[]];
    expect(conditions).toHaveLength(3);
    const statusFilter = new PgDialect().sqlToQuery(conditions[2] as any);
    expect(statusFilter.params).toContain('ACTIVE');
  });
});
