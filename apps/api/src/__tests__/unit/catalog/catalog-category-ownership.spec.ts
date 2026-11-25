import { NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

const actor = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

function buildService(options?: {
  category?: Record<string, unknown> | null;
  product?: Record<string, unknown> | null;
}) {
  const categoryFindFirst = vi.fn().mockResolvedValue(options?.category ?? null);
  const categoryFindMany = vi.fn().mockResolvedValue([]);
  const productInsertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: productInsertValues }));
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }));
  const withActorContext = vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => operation());
  const db = {
    withActorContext,
    db: {
      query: {
        categories: { findFirst: categoryFindFirst, findMany: categoryFindMany },
        products: { findFirst: vi.fn().mockResolvedValue({ storeId: 'store-a' }) },
        stores: { findFirst: vi.fn().mockResolvedValue({ orgId: 'org-a' }) },
        storeMembers: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
      },
      insert,
      update,
    },
  };
  const service = new CatalogService(
    db as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, categoryFindFirst, categoryFindMany, insert, productInsertValues, update, withActorContext };
}

describe('CatalogService category ownership predicates (G-002)', () => {
  it('defaults category listings to platform-level categories only', async () => {
    const h = buildService();

    await h.service.listCategories();

    expect(h.categoryFindMany).toHaveBeenCalledOnce();
    const config = h.categoryFindMany.mock.calls[0]?.[0] as { where: SQL };
    const compiled = new PgDialect().sqlToQuery(config.where);
    expect(compiled.sql.toLowerCase()).toContain('store_id');
    expect(compiled.sql.toLowerCase()).toContain('is null');
  });

  it('builds the public category tree from active platform categories only', async () => {
    const whereConditions: unknown[] = [];
    let selectCount = 0;
    const select = vi.fn(() => {
      const index = selectCount++;
      const builder: any = {
        from: vi.fn(() => builder),
        where: vi.fn((condition: unknown) => {
          whereConditions.push(condition);
          return builder;
        }),
        orderBy: vi.fn(async () => []),
        groupBy: vi.fn(async () => []),
      };
      return builder;
    });
    const service = new CatalogService(
      { db: { select } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getCategoryTree()).resolves.toEqual([]);

    expect(selectCount).toBe(2);
    const compiled = new PgDialect().sqlToQuery(whereConditions[0] as SQL);
    expect(compiled.sql.toLowerCase()).toContain('store_id');
    expect(compiled.sql.toLowerCase()).toContain('is_active');
    expect(compiled.params).toContain(true);
  });

  it('does not expose buyer-facing product results for a tenant-owned category', async () => {
    const h = buildService({
      category: { id: 'category-store-a', storeId: 'store-a', isActive: true },
    });

    await expect(h.service.getCategoryProducts('category-store-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects product creation with a category owned by another store before insert', async () => {
    const h = buildService({ category: null });

    await expect(
      h.service.createProduct(
        { storeId: 'store-a', categoryId: 'category-store-b', title: 'Private product' },
        actor.sub,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.categoryFindFirst).toHaveBeenCalledOnce();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects product category changes when the category is not global or owned by the product store', async () => {
    const h = buildService({ category: null });
    vi.spyOn(h.service, 'getProduct').mockResolvedValue({
      id: 'product-a',
      storeId: 'store-a',
      status: 'DRAFT',
      productTypeId: null,
    } as any);

    await expect(
      h.service.updateProduct('product-a', { categoryId: 'category-store-b' }, undefined, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.withActorContext).toHaveBeenCalledOnce();
    expect(h.categoryFindFirst).toHaveBeenCalledOnce();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('rejects creating a store category under another store category', async () => {
    const h = buildService({ category: null });

    await expect(
      h.service.createCategory({
        storeId: 'store-a',
        parentId: 'category-store-b',
        name: 'Child category',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.categoryFindFirst).toHaveBeenCalledOnce();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects reparenting a category under another store category', async () => {
    const h = buildService();
    vi.spyOn(h.service, 'getCategory').mockResolvedValue({
      id: 'category-a',
      storeId: 'store-a',
      parentId: null,
      path: '/root',
      slug: 'category-a',
    } as any);
    h.categoryFindFirst.mockResolvedValue(null);

    await expect(
      h.service.updateCategory('category-a', { parentId: 'category-store-b' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.categoryFindFirst).toHaveBeenCalledOnce();
    expect(h.update).not.toHaveBeenCalled();
  });
});
