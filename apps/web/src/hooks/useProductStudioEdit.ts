'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ProductTypeSchemaDetail, fetchProductTypeSchema, fetchCategories, fetchBrandsAdmin,
  Category, Brand, updateProduct, UpdateProductInput, upsertProductAttributeValues,
  updateVariant, listVariants, listMedia, fetchProduct, Product, ProductVariant,
  MediaItem, fetchProductAttributeValues, fetchVariantAttributeValues,
  upsertVariantAttributeValues, createVariant, addMedia, removeMedia,
  reorderProductMedia, TypedAttributeValue, TypedVariantAttributeValue,
} from '../lib/buyer-api';
import { fetchMyStores } from '../lib/api';
import { generateSku, buildVariantTitle, resolveComboAttributes } from '../lib/sku-utils';
import { type Step, type StudioState, STEPS } from './useProductStudio';

export type EditLoadStatus = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error';

export interface EditConflictInfo {
  resourceType: 'product' | 'variant';
  resourceId: string;
  currentUpdatedAt: string;
}

export function useProductStudioEdit(productId: string) {
  const [step, setStep] = useState<Step>('identity');
  const [state, setState] = useState<StudioState | null>(null);
  const [loadStatus, setLoadStatus] = useState<EditLoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [stores, setStores] = useState<Array<{ id: string; displayName: string; currency?: string }>>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState<EditConflictInfo | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [existingVariants, setExistingVariants] = useState<ProductVariant[]>([]);
  const [existingMedia, setExistingMedia] = useState<MediaItem[]>([]);
  const [variantAttributeValues, setVariantAttributeValues] = useState<Record<string, Record<string, string>>>({});

  const productUpdatedAtRef = useRef<string>('');
  const cleanStateRef = useRef<string>('');

  // Load initial reference data + product
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadStatus('loading');
        // Load reference data and product in parallel
        const [myStores, cats, brs, product] = await Promise.all([
          fetchMyStores(),
          fetchCategories(),
          fetchBrandsAdmin(),
          fetchProduct(productId),
        ]);
        if (cancelled) return;

        setStores(myStores as Array<{ id: string; displayName: string; currency?: string }>);
        setCategories(cats);
        setBrands(brs);

        const p = product as Product & { updatedAt?: string; gtin?: string | null; ean?: string | null; mpn?: string | null };

        // Populate StudioState from loaded product
        const initialState: StudioState = {
          storeId: p.storeId || '',
          categoryId: p.categoryId || '',
          brandId: p.brandId || '',
          productTypeId: p.productTypeId || '',
          productTypeSchema: null,
          title: p.title || '',
          titleAr: p.titleAr || '',
          slug: p.slug || '',
          description: p.description || '',
          descriptionAr: p.descriptionAr || '',
          gtin: p.gtin || '',
          ean: p.ean || '',
          mpn: p.mpn || '',
          condition: p.condition || 'NEW',
          useExistingProductId: null,
          selectedExistingVariantId: null,
          attributeValues: {},
          variantDimensions: {},
          enabledCombinations: new Set(),
          currency: 'SAR',
          basePriceMinor: 0,
          moq: 1,
          leadTimeDays: 3,
          warehouseId: '',
          mediaItems: [],
          productId: p.id,
        };

        setState(initialState);
        productUpdatedAtRef.current = p.updatedAt || '';
        cleanStateRef.current = JSON.stringify(initialState);

        // Load attributes, variants, media in parallel
        const [attrValues, variants, media] = await Promise.all([
          fetchProductAttributeValues(productId).catch(() => [] as TypedAttributeValue[]),
          listVariants(productId).catch(() => [] as ProductVariant[]),
          listMedia(productId).catch(() => [] as MediaItem[]),
        ]);
        if (cancelled) return;

        // Map attribute values to the StudioState format (attributeDefinitionId → valueText)
        const attrMap: Record<string, string> = {};
        for (const av of attrValues) {
          const val = av.valueText ?? (av.valueNumber != null ? String(av.valueNumber) : '')
            ?? (av.valueBoolean != null ? String(av.valueBoolean) : '')
            ?? (av.optionValue || '')
            ?? '';
          attrMap[av.attributeDefinitionId] = val;
        }

        // Map media items
        const mediaItems = media.map(m => ({
          storageKey: m.url || '',
          url: m.displayUrl || m.url || '',
          altText: m.altText || '',
          isPrimary: m.sortOrder === 0,
        }));

        setState(prev => {
          if (!prev) return prev;
          const next = {
            ...prev,
            attributeValues: attrMap,
            mediaItems,
          };
          cleanStateRef.current = JSON.stringify(next);
          return next;
        });

        setExistingVariants(variants);
        setExistingMedia(media);

        // Load variant attribute values for each variant
        const varAttrMap: Record<string, Record<string, string>> = {};
        await Promise.all(
          variants.map(async (v) => {
            try {
              const vAttrs = await fetchVariantAttributeValues(productId, v.id);
              const vAttrMap: Record<string, string> = {};
              for (const va of vAttrs) {
                const val = va.valueText ?? (va.valueNumber != null ? String(va.valueNumber) : '')
                  ?? (va.valueBoolean != null ? String(va.valueBoolean) : '')
                  ?? (va.optionValue || '')
                  ?? '';
                vAttrMap[va.attributeDefinitionId] = val;
              }
              varAttrMap[v.id] = vAttrMap;
            } catch { /* variant attrs may not exist */ }
          }),
        );
        if (!cancelled) {
          setVariantAttributeValues(varAttrMap);
          setLoadStatus('ready');
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as { status?: number; message?: string };
        if (err?.status === 403) {
          setLoadStatus('forbidden');
        } else if (err?.status === 404) {
          setLoadStatus('notfound');
        } else {
          setLoadStatus('error');
          setLoadError(e instanceof Error ? e.message : 'Failed to load product');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  // Load product type schema when productTypeId is available
  useEffect(() => {
    if (!state?.productTypeId) return;
    fetchProductTypeSchema(state.productTypeId)
      .then((schema: ProductTypeSchemaDetail) => setState(prev => prev ? { ...prev, productTypeSchema: schema } : prev))
      .catch(() => { /* schema may not exist */ });
  }, [state?.productTypeId]);

  // Track dirty state
  useEffect(() => {
    if (!state) return;
    const current = JSON.stringify(state);
    setIsDirty(current !== cleanStateRef.current);
  }, [state]);

  // beforeunload protection
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const update = useCallback(<K extends keyof StudioState>(key: K, value: StudioState[K]) => {
    setState(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const goNext = () => { setError(''); if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]!.key); };
  const goPrev = () => { setError(''); if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!.key); };

  // Reload product data after conflict
  const handleReload = useCallback(async () => {
    try {
      setLoadStatus('loading');
      setConflict(null);
      setError('');

      const [product, attrValues, variants, media] = await Promise.all([
        fetchProduct(productId),
        fetchProductAttributeValues(productId).catch(() => [] as TypedAttributeValue[]),
        listVariants(productId).catch(() => [] as ProductVariant[]),
        listMedia(productId).catch(() => [] as MediaItem[]),
      ]);

      const p = product as Product & { updatedAt?: string; gtin?: string | null; ean?: string | null; mpn?: string | null };

      const attrMap: Record<string, string> = {};
      for (const av of attrValues) {
        const val = av.valueText ?? (av.valueNumber != null ? String(av.valueNumber) : '')
          ?? (av.valueBoolean != null ? String(av.valueBoolean) : '')
          ?? (av.optionValue || '')
          ?? '';
        attrMap[av.attributeDefinitionId] = val;
      }

      const mediaItems = media.map(m => ({
        storageKey: m.url || '',
        url: m.displayUrl || m.url || '',
        altText: m.altText || '',
        isPrimary: m.sortOrder === 0,
      }));

      const reloaded: StudioState = {
        storeId: p.storeId || '',
        categoryId: p.categoryId || '',
        brandId: p.brandId || '',
        productTypeId: p.productTypeId || '',
        productTypeSchema: null,
        title: p.title || '',
        titleAr: p.titleAr || '',
        slug: p.slug || '',
        description: p.description || '',
        descriptionAr: p.descriptionAr || '',
        gtin: p.gtin || '',
        ean: p.ean || '',
        mpn: p.mpn || '',
        condition: p.condition || 'NEW',
        useExistingProductId: null,
        selectedExistingVariantId: null,
        attributeValues: attrMap,
        variantDimensions: {},
        enabledCombinations: new Set(),
        currency: 'SAR',
        basePriceMinor: 0,
        moq: 1,
        leadTimeDays: 3,
        warehouseId: '',
        mediaItems,
        productId: p.id,
      };

      setState(reloaded);
      productUpdatedAtRef.current = p.updatedAt || '';
      cleanStateRef.current = JSON.stringify(reloaded);
      setExistingVariants(variants);
      setExistingMedia(media);
      setLoadStatus('ready');
      setSuccess('Data reloaded with latest changes.');
    } catch {
      setLoadStatus('error');
      setLoadError('Failed to reload product');
    }
  }, [productId]);

  // Discard local changes and reload
  const handleDiscard = useCallback(() => {
    const clean = JSON.parse(cleanStateRef.current) as StudioState;
    setState(clean);
    setConflict(null);
    setError('');
    setSuccess('Local changes discarded.');
  }, []);

  // Save product (edit mode — PATCH)
  const handleSaveProduct = useCallback(async (): Promise<string | null> => {
    if (!state || !state.productId) return null;
    setSaving(true);
    setError('');
    setSuccess('');
    setConflict(null);
    try {
      const pid = state.productId;

      // Step 1: Update product scalar fields with optimistic locking
      const updateInput: UpdateProductInput = {
        title: state.title,
        titleAr: state.titleAr || undefined,
        description: state.description || undefined,
        descriptionAr: state.descriptionAr || undefined,
        slug: state.slug || undefined,
        condition: state.condition,
        categoryId: state.categoryId || undefined,
        brandId: state.brandId || undefined,
        gtin: state.gtin || null,
        ean: state.ean || null,
        mpn: state.mpn || null,
        updatedAt: productUpdatedAtRef.current || undefined,
      };

      const updated = await updateProduct(pid, updateInput);
      const updatedProduct = updated as Product & { updatedAt?: string };
      productUpdatedAtRef.current = updatedProduct.updatedAt || '';

      // Step 2: Save product attribute values
      if (state.productTypeSchema && Object.keys(state.attributeValues).length > 0) {
        const values = Object.entries(state.attributeValues)
          .filter(([, v]) => v !== '')
          .map(([attrId, val]) => ({ attributeDefinitionId: attrId, valueText: val }));
        if (values.length > 0) {
          await upsertProductAttributeValues(pid, values);
        }
      }

      // Step 3: Update clean state reference
      setState(prev => {
        if (!prev) return prev;
        cleanStateRef.current = JSON.stringify(prev);
        return prev;
      });

      setSuccess('Product updated successfully!');
      return pid;
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string; currentUpdatedAt?: string };
      if (err?.status === 409) {
        setConflict({
          resourceType: 'product',
          resourceId: productId,
          currentUpdatedAt: err.currentUpdatedAt || '',
        });
        setError('This product was modified by someone else. Please reload or discard your changes.');
      } else {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [state, productId]);

  // Save variant updates
  const handleSaveVariant = useCallback(async (
    variantId: string,
    updates: Partial<{ sku: string; title: string; titleAr: string; barcode: string; unit: string; weightGrams: number; isActive: boolean }>,
    variantUpdatedAt: string,
  ): Promise<boolean> => {
    if (!state?.productId) return false;
    try {
      await updateVariant(state.productId, variantId, { ...updates, updatedAt: variantUpdatedAt } as any);
      return true;
    } catch (e: unknown) {
      const err = e as { status?: number; currentUpdatedAt?: string };
      if (err?.status === 409) {
        setConflict({
          resourceType: 'variant',
          resourceId: variantId,
          currentUpdatedAt: err.currentUpdatedAt || '',
        });
        setError('This variant was modified by someone else. Please reload.');
      } else {
        setError(e instanceof Error ? e.message : 'Variant update failed');
      }
      return false;
    }
  }, [state?.productId]);

  // Save variant attribute values
  const handleSaveVariantAttributes = useCallback(async (
    variantId: string,
    attrs: Record<string, string>,
  ): Promise<boolean> => {
    if (!state?.productId) return false;
    try {
      const values = Object.entries(attrs)
        .filter(([, v]) => v !== '')
        .map(([attrId, val]) => ({ attributeDefinitionId: attrId, valueText: val }));
      await upsertVariantAttributeValues(state.productId, variantId, values);
      setVariantAttributeValues(prev => ({ ...prev, [variantId]: attrs }));
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Variant attributes update failed');
      return false;
    }
  }, [state?.productId]);

  // Media operations
  const handleAddMedia = useCallback(async (url: string, altText?: string): Promise<boolean> => {
    if (!state?.productId) return false;
    try {
      const media = await addMedia(state.productId, { url, altText });
      setExistingMedia(prev => [...prev, media]);
      setState(prev => {
        if (!prev) return prev;
        const items = [...prev.mediaItems, {
          storageKey: media.url || '',
          url: media.displayUrl || media.url || '',
          altText: media.altText || altText || '',
          isPrimary: prev.mediaItems.length === 0,
        }];
        return { ...prev, mediaItems: items };
      });
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Add media failed');
      return false;
    }
  }, [state?.productId]);

  const handleRemoveMedia = useCallback(async (mediaId: string): Promise<boolean> => {
    if (!state?.productId) return false;
    try {
      await removeMedia(state.productId, mediaId);
      setExistingMedia(prev => prev.filter(m => m.id !== mediaId));
      setState(prev => {
        if (!prev) return prev;
        const items = prev.mediaItems.filter(m => m.storageKey !== mediaId && m.url !== mediaId);
        return { ...prev, mediaItems: items };
      });
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Remove media failed');
      return false;
    }
  }, [state?.productId]);

  const handleReorderMedia = useCallback(async (order: string[]): Promise<boolean> => {
    if (!state?.productId) return false;
    try {
      await reorderProductMedia(state.productId, order);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reorder media failed');
      return false;
    }
  }, [state?.productId]);

  // Compute completeness score
  const completeness = useCallback((): number => {
    if (!state) return 0;
    let score = 0;
    if (state.title) score += 10;
    if (state.categoryId) score += 5;
    if (state.brandId) score += 5;
    if (state.productTypeId) score += 5;
    if (state.gtin || state.ean || state.mpn) score += 5;
    if (state.productTypeSchema) {
      const requiredAttrs = state.productTypeSchema.attributes.filter((a) => a.required && a.definition?.scope === 'PRODUCT');
      const filledRequired = requiredAttrs.filter((a) => state.attributeValues[a.attributeDefinitionId]);
      score += requiredAttrs.length > 0 ? Math.round((filledRequired.length / requiredAttrs.length) * 25) : 25;
    } else {
      score += 25;
    }
    if (existingVariants.length > 0) score += 15;
    if (state.mediaItems.length > 0) score += 15;
    if (state.mediaItems.some(m => m.isPrimary)) score += 5;
    score += 10; // Edit mode baseline
    return Math.min(score, 100);
  }, [state, existingVariants]);

  return {
    step, setStep, stepIndex, state, setState, update,
    stores, categories, brands,
    error, setError, saving, success, setSuccess,
    loadStatus, loadError,
    conflict, handleReload, handleDiscard,
    isDirty,
    existingVariants, setExistingVariants,
    existingMedia,
    variantAttributeValues,
    goNext, goPrev,
    handleSaveProduct, handleSaveVariant, handleSaveVariantAttributes,
    handleAddMedia, handleRemoveMedia, handleReorderMedia,
    completeness,
  };
}
