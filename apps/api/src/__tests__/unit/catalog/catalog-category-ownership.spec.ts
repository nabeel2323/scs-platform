import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

const actor = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

function buildService(options?: {
  category?: Record<string, unknown> | null;
  product?: Record<string, unknown> | null;
}) {
  const categoryFindFirst = vi.fn().mockResolvedValue(options?.category ?? null);
  const productInsertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: productInsertValues }));
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }));
  const withActorContext = vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => operation());
  const db = {
    withActorContext,
    db: {
      query: {
        categories: { findFirst: categoryFindFirst },
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

  return { service, categoryFindFirst, insert, productInsertValues, update, withActorContext };
}

describe('CatalogService category ownership predicates (G-002)', () => {
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
