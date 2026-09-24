'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchProduct, ProductDetail } from '../lib/buyer-api';

const MAX_COMPARE = 4;
const STORAGE_KEY = 'scs_compare_ids';

/**
 * PHASE COS-13: Load multiple products + their attribute values,
 * compute the shared attribute set, and filter to comparable attributes.
 *
 * Products must share a productTypeId to be meaningfully comparable.
 * The hook exposes the common attribute rows for the comparison table.
 */
export function useProductComparison(productIds: string[]) {
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (productIds.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all(productIds.map(id => fetchProduct(id).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const valid = results.filter((p): p is ProductDetail => p !== null);
        setProducts(valid);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load products');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [productIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute the shared attribute rows: only attributes present in ALL products
  const sharedAttributes = useCallback((): Array<{
    code: string;
    label: string;
    values: Array<{ productId: string; value: unknown }>;
    differs: boolean;
  }> => {
    if (products.length < 2) return [];

    // Build a map: code -> { label, productId -> value }
    const attrMap = new Map<string, { label: string; values: Map<string, unknown> }>();

    for (const p of products) {
      const attrs = p.attributeValues ?? [];
      for (const a of attrs) {
        if (!attrMap.has(a.code)) {
          attrMap.set(a.code, { label: a.label, values: new Map() });
        }
        attrMap.get(a.code)!.values.set(p.id, a.value);
      }
    }

    // Only keep attributes present in ALL products
    const result: Array<{ code: string; label: string; values: Array<{ productId: string; value: unknown }>; differs: boolean }> = [];
    for (const [code, { label, values }] of attrMap) {
      if (values.size < products.length) continue; // not shared
      const valueArr = products.map(p => ({ productId: p.id, value: values.get(p.id) }));
      const first = valueArr[0];
      const differs = first !== undefined && !valueArr.every(v => stringify(v.value) === stringify(first.value));
      result.push({ code, label, values: valueArr, differs });
    }

    return result;
  }, [products]);

  // Are all products sharing the same product type? (compatibility check)
  const compatible = products.length >= 2 && products.every(p => p.productTypeId === products[0]?.productTypeId);

  return { products, loading, error, sharedAttributes: sharedAttributes(), compatible, MAX_COMPARE };
}

/* ── Compare list management (persisted to localStorage) ───── */

export function useCompareList() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed)) setIds(parsed.slice(0, MAX_COMPARE));
      }
    } catch { /* ignore */ }
  }, []);

  const persist = useCallback((next: string[]) => {
    setIds(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const add = useCallback((id: string) => {
    setIds(prev => {
      if (prev.includes(id) || prev.length >= MAX_COMPARE) return prev;
      const next = [...prev, id];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setIds(prev => {
      const next = prev.filter(x => x !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return { ids, add, remove, clear, isFull: ids.length >= MAX_COMPARE };
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}
