import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProductVariants, fetchStoreProducts } = vi.hoisted(() => ({
  fetchProductVariants: vi.fn(),
  fetchStoreProducts: vi.fn(),
}));

vi.mock('../lib/buyer-api', () => ({
  fetchProductVariants: (...args: unknown[]) => fetchProductVariants(...args),
  fetchStoreProducts: (...args: unknown[]) => fetchStoreProducts(...args),
}));

import { fetchMerchantInventoryVariants } from '../lib/merchant-inventory-variants';

describe('merchant inventory variant reads', () => {
  beforeEach(() => {
    fetchProductVariants.mockReset();
    fetchStoreProducts.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('loads every product page and combines its variants', async () => {
    fetchStoreProducts
      .mockResolvedValueOnce({ items: [{ id: 'product-1' }], total: 2 })
      .mockResolvedValueOnce({ items: [{ id: 'product-2' }], total: 2 });
    fetchProductVariants
      .mockResolvedValueOnce([{ id: 'variant-1', sku: 'SKU-1' }])
      .mockResolvedValueOnce([{ id: 'variant-2', sku: 'SKU-2' }]);

    await expect(fetchMerchantInventoryVariants('store-1')).resolves.toEqual([
      { id: 'variant-1', sku: 'SKU-1' },
      { id: 'variant-2', sku: 'SKU-2' },
    ]);
    expect(fetchStoreProducts).toHaveBeenNthCalledWith(1, 'store-1', { limit: 50, offset: 0 });
    expect(fetchStoreProducts).toHaveBeenNthCalledWith(2, 'store-1', { limit: 50, offset: 1 });
    expect(fetchProductVariants).toHaveBeenCalledTimes(2);
  });

  it('returns a successful empty result when the store has no products', async () => {
    fetchStoreProducts.mockResolvedValueOnce({ items: [], total: 0 });

    await expect(fetchMerchantInventoryVariants('store-1')).resolves.toEqual([]);
    expect(fetchProductVariants).not.toHaveBeenCalled();
  });

  it('rejects a partial variant read instead of silently hiding a failed product', async () => {
    fetchStoreProducts.mockResolvedValueOnce({
      items: [{ id: 'product-1' }, { id: 'product-2' }],
      total: 2,
    });
    fetchProductVariants
      .mockResolvedValueOnce([{ id: 'variant-1', sku: 'SKU-1' }])
      .mockRejectedValueOnce(new Error('Variant directory unavailable'));

    await expect(fetchMerchantInventoryVariants('store-1')).rejects.toThrow(
      'Variant directory unavailable',
    );
  });
});
