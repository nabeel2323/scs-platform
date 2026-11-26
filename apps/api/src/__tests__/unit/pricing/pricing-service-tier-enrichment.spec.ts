import { describe, expect, it, vi } from 'vitest';
import { PricingService } from '../../../modules/pricing/pricing.service';

describe('PricingService price-list tier enrichment', () => {
  it('returns product and variant labels with each price tier', async () => {
    const tier = {
      id: 'tier-a',
      priceListId: 'list-a',
      variantId: 'variant-a',
      minQty: 1,
      maxQty: null,
      unitPriceMinor: 1250,
    };
    const priceTierFindMany = vi.fn().mockResolvedValue([tier]);
    const catalogLookup = {
      getVariantPricingDetails: vi.fn().mockResolvedValue([
        {
          variantId: 'variant-a',
          variantSku: 'SKU-A',
          variantTitle: 'Blue / Large',
          productTitle: 'Cotton Shirt',
          storeId: 'store-a',
        },
      ]),
    };
    const service = new PricingService(
      { db: { query: { priceTiers: { findMany: priceTierFindMany } } } } as any,
      {} as any,
      catalogLookup as any,
    );

    await expect(service.listTiersByPriceList('list-a')).resolves.toEqual([
      {
        ...tier,
        variantSku: 'SKU-A',
        variantTitle: 'Blue / Large',
        productTitle: 'Cotton Shirt',
      },
    ]);
    expect(priceTierFindMany).toHaveBeenCalledOnce();
    expect(catalogLookup.getVariantPricingDetails).toHaveBeenCalledWith(['variant-a']);
  });
});
