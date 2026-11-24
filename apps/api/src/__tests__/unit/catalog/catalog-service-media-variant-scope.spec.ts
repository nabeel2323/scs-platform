import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

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
