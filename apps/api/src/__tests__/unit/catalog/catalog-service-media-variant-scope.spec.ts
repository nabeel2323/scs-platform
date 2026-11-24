import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';
import { PgDialect, type SQL } from 'drizzle-orm/pg-core';

describe('CatalogService.addMedia variant ownership', () => {
  it('rejects media linked to a variant from another product before inserting', async () => {
    const variantFindFirst = vi.fn().mockResolvedValue(null);
    const insert = vi.fn();
    const db = {
      withActorContext: vi.fn((_actor, operation) => operation()),
      db: {
        query: { productVariants: { findFirst: variantFindFirst } },
        insert,
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
    vi.spyOn(service, 'getProduct').mockResolvedValue({
      id: 'product-a',
      storeId: 'store-a',
    } as any);

    await expect(
      service.addMedia('product-a', {
        variantId: 'variant-from-product-b',
        url: 'https://cdn.example.test/image.jpg',
      } as any,
      { sub: 'user-a', role: 'STAFF', activeOrg: 'org-a' },
    ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(variantFindFirst).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('CatalogService.removeMedia ownership predicate', () => {
  it('binds both the media ID and parent product ID on read and delete', async () => {
    const readWhere: unknown[] = [];
    const deleteWhere: unknown[] = [];
    const findFirst = vi.fn(async (config: { where: unknown }) => {
      readWhere.push(config.where);
      return { id: 'media-a', productId: 'product-a', url: 'https://cdn.example.test/a.jpg' };
    });
    const whereDelete = vi.fn((condition: unknown) => {
      deleteWhere.push(condition);
      return Promise.resolve(undefined);
    });
    const db = {
      db: {
        query: { productMedia: { findFirst } },
        delete: vi.fn(() => ({ where: whereDelete })),
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
    vi.spyOn(service, 'getProduct').mockResolvedValue({
      id: 'product-a',
      storeId: 'store-a',
    } as any);

    await service.removeMedia('product-a', 'media-a');

    expect(findFirst).toHaveBeenCalledOnce();
    expect(whereDelete).toHaveBeenCalledOnce();
    for (const predicate of [readWhere[0], deleteWhere[0]]) {
      const compiled = new PgDialect().sqlToQuery(predicate as SQL);
      expect(compiled.params).toContain('media-a');
      expect(compiled.params).toContain('product-a');
    }
  });
});
