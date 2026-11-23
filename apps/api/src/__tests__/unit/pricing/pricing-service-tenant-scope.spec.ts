import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PricingService } from '../../../modules/pricing/pricing.service';

function makeHarness(variantStoreId: string | null) {
  const priceListFindFirst = vi.fn().mockResolvedValue({ id: 'list-a', storeId: 'store-a' });
  const variantFindFirst = vi.fn().mockResolvedValue({ productId: 'product-a' });
  const productFindFirst = vi.fn().mockResolvedValue({ storeId: variantStoreId });
  const tierFindMany = vi.fn().mockResolvedValue([]);
  const tierInsertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: tierInsertValues }));

  const db = {
    db: {
      insert,
      query: {
        priceLists: { findFirst: priceListFindFirst },
        priceTiers: { findMany: tierFindMany },
        productVariants: { findFirst: variantFindFirst },
        products: { findFirst: productFindFirst },
      },
    },
  };

  const service = new PricingService(db as any, { publish: vi.fn() } as any);
  return {
    service,
    priceListFindFirst,
    variantFindFirst,
    productFindFirst,
    tierFindMany,
    insert,
  };
}

describe('PricingService — price-list variant ownership', () => {
  it('rejects creating a tier for a variant owned by another store', async () => {
    const h = makeHarness('store-b');

    await expect(
      h.service.addTier('list-a', {
        variantId: 'variant-a',
        unitPriceMinor: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.variantFindFirst).toHaveBeenCalled();
    expect(h.productFindFirst).toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects resolving a tier for a variant owned by another store', async () => {
    const h = makeHarness('store-b');

    await expect(h.service.resolvePrice('variant-a', 'list-a', 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.tierFindMany).not.toHaveBeenCalled();
  });

  it('does not accept a canonical product variant without a merchant store owner', async () => {
    const h = makeHarness(null);

    await expect(
      h.service.addTier('list-a', {
        variantId: 'variant-a',
        unitPriceMinor: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.insert).not.toHaveBeenCalled();
  });
});
