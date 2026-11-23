import { fetchProductVariants, fetchStoreProducts, ProductVariant } from './buyer-api';

/**
 * Load every variant available to the merchant's store.
 *
 * A failed product or variant request rejects the whole read. Returning a
 * partial list would make the picker look complete and could hide selectable
 * variants from the merchant.
 */
export async function fetchMerchantInventoryVariants(storeId: string): Promise<ProductVariant[]> {
  const products: Array<{ id: string }> = [];
  let offset = 0;

  while (true) {
    const page = await fetchStoreProducts(storeId, { limit: 50, offset });
    const pageProducts = page.items.filter(
      (item): item is { id: string } =>
        typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string',
    );
    products.push(...pageProducts);

    if (products.length >= page.total || page.items.length === 0 || pageProducts.length === 0) {
      break;
    }
    offset += page.items.length;
  }

  const variantGroups = await Promise.all(
    products.map((product) => fetchProductVariants(product.id)),
  );

  return variantGroups.flat();
}
