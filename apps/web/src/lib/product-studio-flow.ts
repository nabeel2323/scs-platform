export function resolveProductPersistenceTarget(input: {
  productId: string | null;
  useExistingProductId: string | null;
}): { productId: string | null; isExistingCanonical: boolean } {
  return {
    productId: input.productId ?? input.useExistingProductId,
    isExistingCanonical: Boolean(input.useExistingProductId),
  };
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
