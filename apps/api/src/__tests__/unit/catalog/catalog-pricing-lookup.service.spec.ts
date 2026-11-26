import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '../../../common/database/database.service';
import { CatalogPricingLookupService } from '../../../modules/catalog/catalog-pricing-lookup.service';

describe('CatalogPricingLookupService', () => {
  const productVariantsFindMany = vi.fn();
  const productsFindMany = vi.fn();
  let service: CatalogPricingLookupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CatalogPricingLookupService({
      currentActorContext: {
        actorKind: 'user',
        actorId: 'pricing-user',
        actorRole: 'BUYER',
        activeOrgId: 'org-1',
      },
      db: {
        query: {
          productVariants: { findMany: productVariantsFindMany },
          products: { findMany: productsFindMany },
        },
      },
    } as unknown as DatabaseService);
  });

  it('rejects non-empty lookup without a verified user actor context', async () => {
    const unscoped = new CatalogPricingLookupService({
      db: { query: { productVariants: { findMany: productVariantsFindMany } } },
    } as unknown as DatabaseService);

    await expect(unscoped.getVariantPricingDetails(['variant-a'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(unscoped.variantBelongsToStore('variant-a', 'store-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns variant and owning-product details in display order', async () => {
    productVariantsFindMany.mockResolvedValue([
      { id: 'variant-b', productId: 'product-b', sku: 'SKU-B', title: 'Blue' },
      { id: 'variant-a', productId: 'product-a', sku: 'SKU-A', title: 'Small' },
    ]);
    productsFindMany.mockResolvedValue([
      { id: 'product-b', storeId: 'store-b', title: 'Zebra' },
      { id: 'product-a', storeId: 'store-a', title: 'Apple' },
    ]);

    await expect(service.getVariantPricingDetails(['variant-b', 'variant-a'])).resolves.toEqual([
      {
        variantId: 'variant-a',
        variantSku: 'SKU-A',
        variantTitle: 'Small',
        productTitle: 'Apple',
        storeId: 'store-a',
      },
      {
        variantId: 'variant-b',
        variantSku: 'SKU-B',
        variantTitle: 'Blue',
        productTitle: 'Zebra',
        storeId: 'store-b',
      },
    ]);
    expect(productVariantsFindMany).toHaveBeenCalledOnce();
    expect(productsFindMany).toHaveBeenCalledOnce();
  });

  it('omits variants whose owning product is missing', async () => {
    productVariantsFindMany.mockResolvedValue([
      { id: 'variant-orphan', productId: 'missing-product', sku: 'ORPHAN', title: null },
    ]);
    productsFindMany.mockResolvedValue([]);

    await expect(service.getVariantPricingDetails(['variant-orphan'])).resolves.toEqual([]);
  });

  it('returns an empty result without querying for empty input', async () => {
    await expect(service.getVariantPricingDetails([])).resolves.toEqual([]);
    expect(productVariantsFindMany).not.toHaveBeenCalled();
    expect(productsFindMany).not.toHaveBeenCalled();
  });

  it('deduplicates requested variant identifiers before querying', async () => {
    productVariantsFindMany.mockResolvedValue([]);
    productsFindMany.mockResolvedValue([]);

    await service.getVariantPricingDetails(['variant-a', 'variant-a']);

    expect(productVariantsFindMany).toHaveBeenCalledOnce();
  });

  it('enforces store ownership and rejects shared products', async () => {
    productVariantsFindMany.mockResolvedValue([
      { id: 'variant-a', productId: 'product-a', sku: 'SKU-A', title: null },
    ]);
    productsFindMany.mockResolvedValue([
      { id: 'product-a', storeId: 'store-a', title: 'Product A' },
    ]);

    await expect(service.variantBelongsToStore('variant-a', 'store-a')).resolves.toBe(true);
    await expect(service.variantBelongsToStore('variant-a', 'store-b')).resolves.toBe(false);

    productsFindMany.mockResolvedValue([
      { id: 'product-a', storeId: null, title: 'Shared Product' },
    ]);
    await expect(service.variantBelongsToStore('variant-a', 'store-a')).resolves.toBe(false);
  });
});
