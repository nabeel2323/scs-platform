'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ProductTypeSchemaDetail, fetchProductTypeSchema, fetchCategories, fetchBrandsAdmin,
  Category, Brand, createProduct, updateProduct, upsertProductAttributeValues, createVariant,
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
  // Created product ID and optimistic-lock timestamp (after first save)
  productId: string | null;
  productUpdatedAt: string | null;
}

const INITIAL: StudioState = {
  storeId: '', categoryId: '', brandId: '', productTypeId: '', productTypeSchema: null,
  title: '', titleAr: '', slug: '', description: '', descriptionAr: '',
  gtin: '', ean: '', mpn: '', condition: 'NEW', useExistingProductId: null,
  selectedExistingVariantId: null,
  attributeValues: {}, variantDimensions: {}, enabledCombinations: new Set(),
  currency: 'SAR', basePriceMinor: 0, moq: 1, leadTimeDays: 3, warehouseId: '',
  mediaItems: [], productId: null, productUpdatedAt: null,
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
  const [offerCreatedForProductId, setOfferCreatedForProductId] = useState<string | null>(null);

  // P7 Phase 5 — dirty-state tracking for beforeunload protection
  const initialRef = useRef<string>(JSON.stringify(INITIAL));
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const current = JSON.stringify(state);
    setIsDirty(current !== initialRef.current);
  }, [state]);

  // beforeunload protection (browser refresh, back, close tab)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
  const handleSaveProduct = useCallback(async (options: { includeOffer?: boolean } = {}): Promise<string | null> => {
    const includeOffer = options.includeOffer ?? true;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!state.storeId || !state.title.trim()) {
        throw new Error('A store and product title are required before saving.');
      }

      let productId = state.productId;
      let productUpdatedAt = state.productUpdatedAt;

      // Step 1: Create the product once, then update that same product on
      // subsequent saves so edits made after navigating back are persisted.
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
          gtin: state.gtin || undefined,
          ean: state.ean || undefined,
          mpn: state.mpn || undefined,
          productTypeId: state.productTypeId || undefined,
        });
        productId = product.id;
        productUpdatedAt = product.updatedAt ?? null;
        setState(prev => ({ ...prev, productId, productUpdatedAt }));
      } else {
        const updatedProduct = await updateProduct(productId, {
          title: state.title,
          titleAr: state.titleAr || undefined,
          slug: state.slug || undefined,
          description: state.description || undefined,
          descriptionAr: state.descriptionAr || undefined,
          categoryId: state.categoryId || undefined,
          brandId: state.brandId || undefined,
          condition: state.condition,
          gtin: state.gtin || null,
          ean: state.ean || null,
          mpn: state.mpn || null,
          productTypeId: state.productTypeId || null,
          updatedAt: productUpdatedAt || undefined,
        });
        productUpdatedAt = updatedProduct.updatedAt ?? productUpdatedAt;
        setState(prev => ({ ...prev, productUpdatedAt }));
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
          // A previous save may have created some variants before another
          // operation failed. Re-read before retrying so those variants are
          // not duplicated by a second click on Save.
          const persistedVariants = await fetchProductVariants(productId);
          const existingSkus = new Set(persistedVariants.map((variant) => variant.sku));
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
            if (existingSkus.has(sku)) continue;
            await createVariant(productId, {
              sku,
              title: title || undefined,
              attributes: JSON.parse(comboKey),
            });
            existingSkus.add(sku);
          }
        }
      }

      // Create the commercial offer only from the final review/save action.
      // The offer step persists the product first so media and review can proceed.
      if (
        includeOffer &&
        state.basePriceMinor > 0 &&
        offerCreatedForProductId !== productId
      ) {
        await createMerchantOffer({
          storeId: state.storeId,
          productId,
          currency: state.currency,
          basePriceMinor: state.basePriceMinor,
          moq: state.moq,
          leadTimeDays: state.leadTimeDays || undefined,
          warehouseId: state.warehouseId || undefined,
        });
        setOfferCreatedForProductId(productId);
      }

      setSuccess(
        includeOffer && state.basePriceMinor > 0
          ? 'Product and offer saved successfully!'
          : includeOffer
            ? 'Product saved successfully!'
            : 'Product details saved. Continue to review to create the offer.',
      );
      // P7 Phase 5: reset dirty state after successful save
      initialRef.current = JSON.stringify({ ...state, productId, productUpdatedAt });
      setIsDirty(false);
      return productId;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  }, [state, brands, offerCreatedForProductId]);

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
    error, setError, saving, success, isDirty,
    canonicalMatches, searchCanonical,
    canonicalSearchResults, searchCanonicalFreeText,
    existingVariants, loadExistingVariants,
    goNext, goPrev, handleSaveProduct, completeness,
  };
}
