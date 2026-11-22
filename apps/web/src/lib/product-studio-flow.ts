export function resolveProductPersistenceTarget(input: {
  productId: string | null;
  useExistingProductId: string | null;
}): { productId: string | null; isExistingCanonical: boolean } {
  return {
    productId: input.useExistingProductId ?? input.productId,
    isExistingCanonical: Boolean(input.useExistingProductId),
  };
}

export async function persistProductStudioMedia(
  productId: string,
  mediaItems: Array<{ url: string; altText: string }>,
  fetchExisting: (productId: string) => Promise<Array<{ url: string }>>,
  add: (productId: string, input: { url: string; mediaType: string; altText?: string; sortOrder: number }) => Promise<unknown>,
): Promise<void> {
  if (mediaItems.length === 0) return;

  const existing = await fetchExisting(productId);
  const existingUrls = new Set(existing.map((item) => item.url));
  let nextSortOrder = existing.length;

  for (const item of mediaItems) {
    const url = item.url.trim();
    if (!url || existingUrls.has(url)) continue;

    await add(productId, {
      url,
      mediaType: 'IMAGE',
      altText: item.altText.trim() || undefined,
      sortOrder: nextSortOrder,
    });
    existingUrls.add(url);
    nextSortOrder += 1;
  }
}

export interface ProductStudioContinueOptions {
  step: string;
  saving: boolean;
  productId: string | null;
  title: string;
  storeId: string;
  saveProduct: (options: { includeOffer: false }) => Promise<string | null>;
  setError: (message: string) => void;
  goNext: () => void;
}

/**
 * The offer step must persist the product and its variants before continuing,
 * but the offer itself is created only from the final review/save action.
 */
export async function continueProductStudioStep({
  step,
  saving,
  productId,
  title,
  storeId,
  saveProduct,
  setError,
  goNext,
}: ProductStudioContinueOptions): Promise<boolean> {
  if (saving) return false;

  if (step === 'offer' && !productId) {
    if (!storeId || !title.trim()) {
      setError('Choose a store and enter a product title before continuing.');
      return false;
    }

    const savedProductId = await saveProduct({ includeOffer: false });
    if (!savedProductId) return false;
  }

  goNext();
  return true;
}
