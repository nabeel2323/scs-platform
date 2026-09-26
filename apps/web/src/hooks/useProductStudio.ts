'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ProductTypeSchemaDetail, fetchProductTypeSchema, fetchCategories, fetchBrandsAdmin,
  Category, Brand, createProduct, upsertProductAttributeValues, createVariant,
  createMerchantOffer, presignMedia, addMedia, searchCanonicalProducts, Product,
  searchCanonicalCatalog, CanonicalProductSummary, fetchProductVariants, ProductVariant,
} from '../lib/buyer-api';
import { fetchMyStores } from '../lib/api';
import { generateSku, buildVariantTitle, resolveComboAttributes } from '../lib/sku-utils';

export type Step = 'identity' | 'specifications' | 'variants' | 'offer' | 'media' | 'review';

export const STEPS: { key: Step; label: string; num: number }[] = [
  { key: 'identity', label: 'Identity', num: 1 },
  { key: 'specifications', label: 'Specifications', num: 2 },
  { key: 'variants', label: 'Variants', num: 3 },
  { key: 'offer', label: 'Offer', num: 4 },
  { key: 'media', label: 'Media', num: 5 },
  { key: 'review', label: 'Review', num: 6 },
];

/** Wizard-wide state shared across all steps. */
export interface StudioState {
  storeId: string;
  // Step 1: Identity
  categoryId: string;
  brandId: string;
  productTypeId: string;
  productTypeSchema: ProductTypeSchemaDetail | null;
  title: string;
  titleAr: string;
  slug: string;
  description: string;
  descriptionAr: string;
  gtin: string;
  ean: string;
  mpn: string;
  condition: string;
  useExistingProductId: string | null;
  selectedExistingVariantId: string | null;
  // Step 2: Specifications (attributeId → value)
  attributeValues: Record<string, string>;
  // Step 3: Variants
  variantDimensions: Record<string, string[]>;
  enabledCombinations: Set<string>;
  // Step 4: Offer
  currency: string;
  basePriceMinor: number;
  moq: number;
  leadTimeDays: number;
  warehouseId: string;
  // Step 5: Media
  mediaItems: Array<{ storageKey: string; url: string; altText: string; isPrimary: boolean }>;
  // Created product ID (after first save)
  productId: string | null;
}

const INITIAL: StudioState = {
  storeId: '', categoryId: '', brandId: '', productTypeId: '', productTypeSchema: null,
  title: '', titleAr: '', slug: '', description: '', descriptionAr: '',
  gtin: '', ean: '', mpn: '', condition: 'NEW', useExistingProductId: null,
  selectedExistingVariantId: null,
  attributeValues: {}, variantDimensions: {}, enabledCombinations: new Set(),
  currency: 'SAR', basePriceMinor: 0, moq: 1, leadTimeDays: 3, warehouseId: '',
  mediaItems: [], productId: null,
};

export function useProductStudio() {
  const [step, setStep] = useState<Step>('identity');
  const [state, setState] = useState<StudioState>(INITIAL);
  const [stores, setStores] = useState<Array<{ id: string; displayName: string }>>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [canonicalMatches, setCanonicalMatches] = useState<Product[]>([]);
  const [canonicalSearchResults, setCanonicalSearchResults] = useState<CanonicalProductSummary[]>([]);
  const [existingVariants, setExistingVariants] = useState<ProductVariant[]>([]);

  // Load initial data
  useEffect(() => {
    (async () => {
      try {
        const [myStores, cats, brs] = await Promise.all([
          fetchMyStores(),
          fetchCategories(),
          fetchBrandsAdmin(),
        ]);
        setStores(myStores as Array<{ id: string; displayName: string }>);
        setCategories(cats);
        setBrands(brs);
        if (myStores.length > 0) {
          setState(prev => ({ ...prev, storeId: (myStores[0] as any).id }));
        }
      } catch { /* auth redirect handles */ }
    })();
  }, []);

  // Load product type schema when productTypeId changes
  useEffect(() => {
    if (!state.productTypeId) { setState(prev => ({ ...prev, productTypeSchema: null })); return; }
    fetchProductTypeSchema(state.productTypeId)
      .then((schema: ProductTypeSchemaDetail) => setState(prev => ({ ...prev, productTypeSchema: schema })))
      .catch(() => setState(prev => ({ ...prev, productTypeSchema: null })));
  }, [state.productTypeId]);

  const update = useCallback(<K extends keyof StudioState>(key: K, value: StudioState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const goNext = () => { setError(''); if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]!.key); };
  const goPrev = () => { setError(''); if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!.key); };

  // Search canonical products by GTIN/EAN/MPN (legacy identifier match)
  const searchCanonical = useCallback(async (query: { gtin?: string; ean?: string; mpn?: string; title?: string }) => {
    try {
      const results = await searchCanonicalProducts(query);
      setCanonicalMatches(results);
      return results;
    } catch {
      setCanonicalMatches([]);
      return [];
    }
  }, []);

  // Free-text search across canonical catalog (Existing Product Selector)
  const searchCanonicalFreeText = useCallback(async (params: {
    search?: string; brandId?: string; categoryId?: string;
  }) => {
    try {
      const result = await searchCanonicalCatalog(params);
      setCanonicalSearchResults(result.items);
      return result.items;
    } catch {
      setCanonicalSearchResults([]);
      return [];
    }
  }, []);

  // Load existing variants when a canonical product is selected
  const loadExistingVariants = useCallback(async (productId: string) => {
    try {
      const variants = await fetchProductVariants(productId);
      setExistingVariants(variants);
      return variants;
    } catch {
      setExistingVariants([]);
      return [];
    }
  }, []);

  // Save product (creates or updates)
  const handleSaveProduct = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      let productId = state.productId;

      // Step 1: Create product if needed
      if (!productId) {
        const product = await createProduct({
          storeId: state.storeId,
          title: state.title,
          titleAr: state.titleAr || undefined,
          slug: state.slug || undefined,
          description: state.description || undefined,
          descriptionAr: state.descriptionAr || undefined,
          categoryId: state.categoryId || undefined,
          brandId: state.brandId || undefined,
          condition: state.condition,
        });
        productId = product.id;
        setState(prev => ({ ...prev, productId }));
      }

      // Step 2: Save attribute values
      if (state.productTypeSchema && Object.keys(state.attributeValues).length > 0) {
        const values = Object.entries(state.attributeValues)
          .filter(([, v]) => v !== '')
          .map(([attrId, val]) => ({ attributeDefinitionId: attrId, valueText: val }));
        if (values.length > 0) {
          await upsertProductAttributeValues(productId, values);
        }
      }

      // Step 3: Create variants for enabled combinations (skip if using existing variant)
      if (!state.selectedExistingVariantId) {
        // Resolve brand name for SKU generation (from the brands loaded at init).
        const brandName = brands.find(b => b.id === state.brandId)?.name ?? null;
        if (state.enabledCombinations.size > 0) {
          for (const comboKey of state.enabledCombinations) {
            // Resolve raw attrId/value pairs to human-readable attribute entries
            // using the product type schema (attribute definition names + option labels).
            const resolved = resolveComboAttributes(comboKey, state.productTypeSchema);
            const attrValues = resolved.map(r => r.label);
            const title = buildVariantTitle(
              resolved.map(r => ({ name: r.name, value: r.label })),
            );
            const sku = generateSku({
              brand: brandName,
              productTitle: state.title,
              attributeValues: attrValues,
            });
            await createVariant(productId, {
              sku,
              title: title || undefined,
              attributes: JSON.parse(comboKey),
            });
          }
        }
      }

      // Step 4: Create offer
      if (state.basePriceMinor > 0) {
        await createMerchantOffer({
          storeId: state.storeId,
          productId,
          currency: state.currency,
          basePriceMinor: state.basePriceMinor,
          moq: state.moq,
          leadTimeDays: state.leadTimeDays || undefined,
          warehouseId: state.warehouseId || undefined,
        });
      }

      setSuccess('Product saved successfully!');
      return productId;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  }, [state]);

  // Compute completeness score (0–100)
  const completeness = useCallback((): number => {
    let score = 0;
    const total = 100;
    // Identity (30 pts)
    if (state.title) score += 10;
    if (state.categoryId) score += 5;
    if (state.brandId) score += 5;
    if (state.productTypeId) score += 5;
    if (state.gtin || state.ean || state.mpn) score += 5;
    // Specifications (25 pts)
    if (state.productTypeSchema) {
      const requiredAttrs = state.productTypeSchema.attributes.filter((a: ProductTypeSchemaDetail['attributes'][number]) => a.required && a.definition?.scope === 'PRODUCT');
      const filledRequired = requiredAttrs.filter((a: ProductTypeSchemaDetail['attributes'][number]) => state.attributeValues[a.attributeDefinitionId]);
      score += requiredAttrs.length > 0 ? Math.round((filledRequired.length / requiredAttrs.length) * 25) : 25;
    } else {
      score += 25;
    }
    // Offer (25 pts)
    if (state.basePriceMinor > 0) score += 15;
    if (state.moq > 0) score += 5;
    if (state.currency) score += 5;
    // Media (20 pts)
    if (state.mediaItems.length > 0) score += 15;
    if (state.mediaItems.some(m => m.isPrimary)) score += 5;

    return Math.min(score, total);
  }, [state]);

  return {
    step, setStep, stepIndex, state, setState, update,
    stores, categories, brands,
    error, setError, saving, success,
    canonicalMatches, searchCanonical,
    canonicalSearchResults, searchCanonicalFreeText,
    existingVariants, loadExistingVariants,
    goNext, goPrev, handleSaveProduct, completeness,
  };
}
