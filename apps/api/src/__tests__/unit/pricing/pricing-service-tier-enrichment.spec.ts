import { describe, expect, it, vi } from 'vitest';
import { PricingService } from '../../../modules/pricing/pricing.service';
import { priceTiers } from '../../../modules/pricing/pricing.schema';
import { products, productVariants } from '../../../modules/catalog/catalog.schema';

describe('PricingService price-list tier enrichment', () => {
  it('returns product and variant labels with each price tier', async () => {
    const rows = [{
      id: 'tier-a',
      priceListId: 'list-a',
      variantId: 'variant-a',
      minQty: 1,
      maxQty: null,
      unitPriceMinor: 1250,
      variantSku: 'SKU-A',
      variantTitle: 'Blue / Large',
      productTitle: 'Cotton Shirt',
    }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const productsJoin = vi.fn().mockReturnValue({ where });
    const variantsJoin = vi.fn().mockReturnValue({ innerJoin: productsJoin });
    const from = vi.fn().mockReturnValue({ innerJoin: variantsJoin });
    const select = vi.fn().mockReturnValue({ from });
    const service = new PricingService({ db: { select } } as any, {} as any);

    await expect(service.listTiersByPriceList('list-a')).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({
      variantSku: productVariants.sku,
      variantTitle: productVariants.title,
      productTitle: products.title,
    }));
    expect(from).toHaveBeenCalledWith(priceTiers);
    expect(where).toHaveBeenCalledOnce();
  });
});
