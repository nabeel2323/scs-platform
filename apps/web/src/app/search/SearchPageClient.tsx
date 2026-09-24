'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  searchProducts, fetchCategories, fetchBrands, fetchProductVariants, addToCart,
  Product, Category, FacetEntry,
} from '../../lib/buyer-api';
import { formatMinor, EmptyState, ErrorBanner, ProductCardImage } from '../../components/Shared';
import {
  colors, typeScale, radii, shadows, transitions,
} from '@scs/ui-kit';
import { useCompareList } from '../../hooks/useProductComparison';
import { analytics } from '../../lib/analytics';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'title-asc';

const LIMIT_OPTIONS = [20, 40, 60];

export default function SearchPageClient() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#555' }}>Loading search…</div>}>
      <SearchPageContent />
    </Suspense>
  );
}


function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-backed state
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get('cat') ? searchParams.get('cat')!.split(',').filter(Boolean) : [],
  );
  const [selectedBrand, setSelectedBrand] = useState(searchParams.get('brand') || '');
  const [sort, setSort] = useState<SortOption>((searchParams.get('sort') as SortOption) || 'featured');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [limit, setLimit] = useState(Number(searchParams.get('limit')) || 20);
  const [priceMin, setPriceMin] = useState(searchParams.get('pmin') || '');
  const [priceMax, setPriceMax] = useState(searchParams.get('pmax') || '');
  const [verifiedOnly, setVerifiedOnly] = useState(searchParams.get('verified') === '1');
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('instock') === '1');

  // PHASE COS-13: compare list
  const compareList = useCompareList();

  const [results, setResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [facets, setFacets] = useState<FacetEntry[]>([]);
  const [selectedAttrFilters, setSelectedAttrFilters] = useState<Record<string, string[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [cartError, setCartError] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load categories and brands once
  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    fetchBrands().then(setBrands).catch(() => {});
  }, []);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (selectedCategories.length > 0) params.set('cat', selectedCategories.join(','));
    if (selectedBrand) params.set('brand', selectedBrand);
    if (sort !== 'featured') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    if (limit !== 20) params.set('limit', String(limit));
    if (priceMin) params.set('pmin', priceMin);
    if (priceMax) params.set('pmax', priceMax);
    if (verifiedOnly) params.set('verified', '1');
    if (inStockOnly) params.set('instock', '1');
    const qs = params.toString();
    router.replace(`/search${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [query, selectedCategories, selectedBrand, sort, page, limit, priceMin, priceMax, verifiedOnly, inStockOnly, router]);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      // Send categoryId to API only when exactly one is selected (backward compatible);
      // multi-category is handled client-side after the API returns results.
      const categoryId = selectedCategories.length === 1 ? selectedCategories[0] : undefined;
      const res = await searchProducts({
        q: query || undefined,
        categoryId,
        brandId: selectedBrand || undefined,
        limit: limit + 20, // fetch extra for client-side filtering
        offset,
        attrFilters: Object.keys(selectedAttrFilters).length > 0 ? selectedAttrFilters : undefined,
      });
      setResults(res.items || []);
      setTotal(res.total || 0);
      if (res.facets) setFacets(res.facets);
      // PHASE COS-14: track search
      analytics.searchPerformed(query || '', res.total || 0, selectedCategories.length === 1 ? selectedCategories[0] : undefined);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, selectedCategories, selectedBrand, page, limit, selectedAttrFilters]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doSearch, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [doSearch]);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  const handleCategoryToggle = (id: string) => {
    setSelectedCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    analytics.filterUsed('category', id);
    resetPage();
  };
  // Header dropdown: quick single-select that replaces any multi-selection
  const handleHeaderCategoryChange = (id: string) => {
    setSelectedCategories(id ? [id] : []);
    resetPage();
  };
  const handleBrandChange = (id: string) => { setSelectedBrand(selectedBrand === id ? '' : id); analytics.filterUsed('brand', id); resetPage(); };
  const handleSortChange = (s: SortOption) => { setSort(s); analytics.filterUsed('sort', s); resetPage(); };
  const handleLimitChange = (l: number) => { setLimit(l); setPage(1); };

  // Price input sanitizers — strip non-numeric, prevent negatives
  const handlePriceMinChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    setPriceMin(cleaned);
    resetPage();
  };
  const handlePriceMaxChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    setPriceMax(cleaned);
    resetPage();
  };

  // Active filter count for mobile badge
  const activeFilterCount = [
    selectedCategories.length > 0,
    !!selectedBrand,
    !!priceMin,
    !!priceMax,
    verifiedOnly,
    inStockOnly,
  ].filter(Boolean).length;

  // Client-side filtering, validation, and sorting
  const { displayedResults, filteredCount, priceErrorMsg } = useMemo(() => {
    let filtered = [...results];
    let errorMsg = '';

    // Validate price inputs
    const minNum = priceMin ? parseFloat(priceMin) : NaN;
    const maxNum = priceMax ? parseFloat(priceMax) : NaN;
    if (priceMin && isNaN(minNum)) errorMsg = 'Invalid minimum price';
    else if (priceMax && isNaN(maxNum)) errorMsg = 'Invalid maximum price';
    else if (priceMin && minNum < 0) errorMsg = 'Price cannot be negative';
    else if (priceMax && maxNum < 0) errorMsg = 'Price cannot be negative';
    else if (priceMin && priceMax && !isNaN(minNum) && !isNaN(maxNum) && minNum > maxNum) {
      errorMsg = 'Minimum exceeds maximum';
    }

    // Price filter (client-side since API doesn't support it)
    // Only filter when no validation error — prices are compared in minor units
    if (!errorMsg && priceMin && !isNaN(minNum)) {
      const minVal = Math.round(minNum * 100);
      filtered = filtered.filter(p => p.priceFromMinor != null && p.priceFromMinor >= minVal);
    }
    if (!errorMsg && priceMax && !isNaN(maxNum)) {
      const maxVal = Math.round(maxNum * 100);
      filtered = filtered.filter(p => p.priceFromMinor != null && p.priceFromMinor <= maxVal);
    }

    // Multi-category filter (client-side when >1 selected; API handles 0 or 1)
    if (selectedCategories.length > 1) {
      filtered = filtered.filter(p => p.categoryId && selectedCategories.includes(p.categoryId));
    }

    // Verified only
    if (verifiedOnly) {
      filtered = filtered.filter(p => p.store?.verificationStatus === 'VERIFIED');
    }

    // In stock only
    if (inStockOnly) {
      filtered = filtered.filter(p => p.isAvailable);
    }

    // Sort
    switch (sort) {
      case 'price-asc':
        filtered.sort((a, b) => (a.priceFromMinor ?? Infinity) - (b.priceFromMinor ?? Infinity));
        break;
      case 'price-desc':
        filtered.sort((a, b) => (b.priceFromMinor ?? 0) - (a.priceFromMinor ?? 0));
        break;
      case 'newest':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'title-asc':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        // featured = default order from API
        break;
    }

    return { displayedResults: filtered.slice(0, limit), filteredCount: filtered.length, priceErrorMsg: errorMsg };
  }, [results, priceMin, priceMax, selectedCategories, verifiedOnly, inStockOnly, sort, limit]);

  const handleAddToCart = async (product: Product) => {
    setCartError('');
    try {
      const variants = await fetchProductVariants(product.id);
      const variant = variants.find(v => v.isActive);
      if (!variant) {
        setCartError(`"${product.title}" has no orderable variant yet.`);
        return;
      }
      await addToCart({ variantId: variant.id, storeId: product.storeId, quantity: product.moq || 1 });
      setAddedItems(prev => new Set(prev).add(product.id));
      setTimeout(() => setAddedItems(prev => { const n = new Set(prev); n.delete(product.id); return n; }), 2000);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : `Could not add "${product.title}" to your cart.`);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()));
  const selectedCatNames = selectedCategories.map(id => categories.find(c => c.id === id)?.name).filter(Boolean);
  const selectedBrandName = brands.find(b => b.id === selectedBrand)?.name;
  // Currency label from first priced result (for price filter context)
  const resultCurrency = results.find(r => r.priceCurrency)?.priceCurrency || '';

  return (
    <>
      <style>{`
        .sr-skeleton { animation: sr-pulse 1.5s ease-in-out infinite; background: ${colors.border}; border-radius: ${radii.sm}; }
        @keyframes sr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .sr-card { transition: box-shadow ${transitions.normal}, transform ${transitions.fast}; }
        .sr-card:hover { box-shadow: ${shadows.lg}; transform: translateY(-2px); }
        .sr-filter-section { border-bottom: 1px solid ${colors.border}; padding: 16px 0; }
        .sr-filter-section:last-child { border-bottom: none; }
        .sr-checkbox { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; font-size: 13px; color: ${colors.brand[700]}; }
        .sr-page-btn { min-width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 1px solid ${colors.border}; border-radius: ${radii.sm}; background: ${colors.surface}; color: ${colors.muted}; font-size: 13px; cursor: pointer; transition: background ${transitions.fast}; }
        .sr-page-btn:hover { background: ${colors.bgSubtle}; }
        .sr-page-btn-active { background: ${colors.brand[700]}; color: #fff; border-color: ${colors.brand[700]}; }
        @media (max-width: 768px) {
          .sr-sidebar { display: none; }
          .sr-sidebar-open { display: block !important; position: fixed; top: 0; left: 0; bottom: 0; width: 280px; z-index: 200; background: ${colors.surface}; overflow-y: auto; padding: 20px; box-shadow: 4px 0 20px rgba(0,0,0,0.15); }
          .sr-filter-toggle { display: flex !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Amazon-style Search Header ── */}
        <div style={{ background: `linear-gradient(135deg, ${colors.brand[900]} 0%, ${colors.brand[500]} 100%)`, padding: '20px 24px', margin: '0 -16px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: radii.md, overflow: 'hidden', boxShadow: shadows.md }}>
              <select
                value={selectedCategories.length === 1 ? selectedCategories[0] : ''}
                onChange={e => handleHeaderCategoryChange(e.target.value)}
                style={{ padding: '12px 14px', fontSize: 13, border: 'none', background: colors.bgSubtle, color: colors.brand[700], fontWeight: 600, minWidth: 140, cursor: 'pointer', outline: 'none' }}
              >
                <option value="">{selectedCategories.length > 1 ? `${selectedCategories.length} selected` : 'All Departments'}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="text"
                placeholder="Search products, brands, SKU, barcode..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                style={{ flex: 1, padding: '12px 18px', fontSize: 15, border: 'none', outline: 'none', minWidth: 0 }}
              />
              <button onClick={doSearch} style={{ padding: '12px 28px', fontSize: 15, fontWeight: 600, background: colors.amber, color: colors.brand[700], border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>⌕</span> Search
              </button>
            </div>
          </div>
        </div>

        {/* ── Breadcrumb ── */}
        <div style={{ padding: '12px 0', fontSize: 12, color: colors.muted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Link href="/search" style={{ color: colors.brand[500], textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          {selectedCatNames.length === 1 && <><span style={{ color: colors.brand[500] }}>{selectedCatNames[0]}</span><span>›</span></>}
          {selectedCatNames.length > 1 && <><span style={{ color: colors.brand[500] }}>{selectedCatNames.length} departments</span><span>›</span></>}
          {selectedBrandName && <><span>{selectedBrandName}</span><span>›</span></>}
          <span style={{ color: colors.brand[700], fontWeight: 500 }}>
            {query ? `Results for "${query}"` : selectedCatNames.length > 0 ? 'Category' : 'All Products'}
          </span>
        </div>

        {/* ── Results count + sort bar ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ ...typeScale.bodySm, color: colors.muted }}>
            {total > 0 ? (
              <>
                <span style={{ fontWeight: 600, color: colors.brand[700] }}>{total.toLocaleString()}</span> result{total !== 1 ? 's' : ''}
                {query && <> for "<strong style={{ color: colors.brand[700] }}>{query}</strong>"</>}
                {filteredCount < total && !loading && <span style={{ marginLeft: 8, color: colors.brand[500], fontWeight: 500 }}>({filteredCount} shown after filters)</span>}
              </>
            ) : !loading && <span>No results found</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Mobile filter toggle */}
            <button
              className="sr-filter-toggle"
              onClick={() => setMobileFiltersOpen(true)}
              style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: activeFilterCount > 0 ? colors.brand[700] : colors.surface, border: '1px solid ' + (activeFilterCount > 0 ? colors.brand[700] : colors.border), borderRadius: radii.sm, cursor: 'pointer', color: activeFilterCount > 0 ? '#fff' : colors.brand[700] }}
            >
              ☰ Filters{activeFilterCount > 0 && <span style={{ background: colors.amber, color: colors.brand[700], fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: radii.full, marginLeft: 2 }}>{activeFilterCount}</span>}
            </button>
            <label style={{ ...typeScale.bodySm, color: colors.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              Sort by:
              <select value={sort} onChange={e => handleSortChange(e.target.value as SortOption)} style={{ padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: radii.sm, background: colors.surface, color: colors.brand[700], fontWeight: 500, cursor: 'pointer' }}>
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="newest">Newest Arrivals</option>
                <option value="title-asc">Name: A to Z</option>
              </select>
            </label>
            <label style={{ ...typeScale.bodySm, color: colors.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              Show:
              <select value={limit} onChange={e => handleLimitChange(Number(e.target.value))} style={{ padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: radii.sm, background: colors.surface, color: colors.brand[700], cursor: 'pointer' }}>
                {LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* ── Main Layout: Sidebar + Results ── */}
        <div style={{ display: 'flex', gap: 24 }}>

          {/* ── Left Sidebar Filters ── */}
          <aside className={`sr-sidebar${mobileFiltersOpen ? ' sr-sidebar-open' : ''}`} style={{ width: 240, flexShrink: 0 }}>
            {mobileFiltersOpen && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ ...typeScale.h2, color: colors.brand[700], margin: 0 }}>Filters</h3>
                <button onClick={() => setMobileFiltersOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: colors.muted }}>✕</button>
              </div>
            )}

            {/* Department */}
            <div className="sr-filter-section">
              <h4 style={{ ...typeScale.caption, fontWeight: 700, color: colors.brand[700], marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</h4>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {categories.map(c => (
                  <label key={c.id} className="sr-checkbox">
                    <input type="checkbox" checked={selectedCategories.includes(c.id)} onChange={() => handleCategoryToggle(c.id)} style={{ accentColor: colors.brand[700] }} />
                    <span>{c.name}</span>
                    <span style={{ marginLeft: 'auto', ...typeScale.caption, color: colors.disabled }}>({c.productCount})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Brand */}
            <div className="sr-filter-section">
              <h4 style={{ ...typeScale.caption, fontWeight: 700, color: colors.brand[700], marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Brand</h4>
              <input
                type="text"
                placeholder="Search brands..."
                value={brandSearch}
                onChange={e => setBrandSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: radii.sm, marginBottom: 8, boxSizing: 'border-box' as const }}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {filteredBrands.slice(0, 20).map(b => (
                  <label key={b.id} className="sr-checkbox">
                    <input type="checkbox" checked={selectedBrand === b.id} onChange={() => handleBrandChange(b.id)} style={{ accentColor: colors.brand[700] }} />
                    <span>{b.name}</span>
                  </label>
                ))}
                {filteredBrands.length > 20 && <div style={{ ...typeScale.caption, color: colors.brand[500], padding: '4px 0', cursor: 'pointer' }}>See more...</div>}
              </div>
            </div>

            {/* Price Range */}
            <div className="sr-filter-section">
              <h4 style={{ ...typeScale.caption, fontWeight: 700, color: colors.brand[700], marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Price{resultCurrency && <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, fontSize: 11, color: colors.muted }}>({resultCurrency})</span>}
              </h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text" inputMode="decimal" placeholder="Min" value={priceMin}
                  onChange={e => handlePriceMinChange(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid ' + (priceErrorMsg && priceMin ? colors.err : colors.border), borderRadius: radii.sm, boxSizing: 'border-box' as const }}
                />
                <span style={{ color: colors.disabled }}>–</span>
                <input
                  type="text" inputMode="decimal" placeholder="Max" value={priceMax}
                  onChange={e => handlePriceMaxChange(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid ' + (priceErrorMsg && priceMax ? colors.err : colors.border), borderRadius: radii.sm, boxSizing: 'border-box' as const }}
                />
              </div>
              {priceErrorMsg && (
                <div role="alert" style={{ marginTop: 6, padding: '4px 8px', background: colors.errBg, color: colors.err, fontSize: 11, borderRadius: radii.sm, fontWeight: 500 }}>
                  {priceErrorMsg}
                </div>
              )}
            </div>

            {/* Availability */}
            <div className="sr-filter-section">
              <h4 style={{ ...typeScale.caption, fontWeight: 700, color: colors.brand[700], marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Availability</h4>
              <label className="sr-checkbox">
                <input type="checkbox" checked={inStockOnly} onChange={e => { setInStockOnly(e.target.checked); resetPage(); }} style={{ accentColor: colors.brand[700] }} />
                <span>In Stock Only</span>
              </label>
              <label className="sr-checkbox" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={verifiedOnly} onChange={e => { setVerifiedOnly(e.target.checked); resetPage(); }} style={{ accentColor: colors.brand[700] }} />
                <span style={{ color: colors.ok, fontWeight: 500 }}>Verified Sellers Only</span>
              </label>
            </div>

            {/* Dynamic attribute facets (PHASE 6) */}
            {facets.length > 0 && facets.map(facet => (
              <div key={facet.code} style={{ marginBottom: 16 }}>
                <h4 style={{ ...typeScale.caption, fontWeight: 700, color: colors.brand[700], textTransform: 'uppercase', marginBottom: 6 }}>{facet.label}</h4>
                {facet.values.slice(0, 8).map(fv => {
                  const checked = (selectedAttrFilters[facet.code] ?? []).includes(fv.value);
                  return (
                    <label key={fv.value} className="sr-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedAttrFilters(prev => {
                            const cur = prev[facet.code] ?? [];
                            const next = checked ? cur.filter(v => v !== fv.value) : [...cur, fv.value];
                            const copy = { ...prev };
                            if (next.length === 0) delete copy[facet.code]; else copy[facet.code] = next;
                            return copy;
                          });
                          resetPage();
                        }}
                        style={{ accentColor: colors.brand[700] }}
                      />
                      <span>{fv.value} <small style={{ color: colors.muted }}>({fv.count})</small></span>
                    </label>
                  );
                })}
              </div>
            ))}

            {/* Clear filters */}
            {(activeFilterCount > 0 || Object.keys(selectedAttrFilters).length > 0) && (
              <button onClick={() => { setSelectedCategories([]); setSelectedBrand(''); setPriceMin(''); setPriceMax(''); setVerifiedOnly(false); setInStockOnly(false); setSelectedAttrFilters({}); resetPage(); }}
                style={{ width: '100%', padding: '8px 12px', fontSize: 12, fontWeight: 600, background: colors.errBg, color: colors.err, border: `1px solid ${colors.err}`, borderRadius: radii.sm, cursor: 'pointer', marginTop: 12 }}>
                Clear All Filters ({activeFilterCount})
              </button>
            )}
          </aside>

          {/* Mobile overlay backdrop */}
          {mobileFiltersOpen && <div onClick={() => setMobileFiltersOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} />}

          {/* ── Results Area ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {error && <ErrorBanner message={error} onRetry={doSearch} />}
            {cartError && (
              <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', background: colors.errBg, border: `1px solid ${colors.err}`, borderRadius: radii.md, ...typeScale.bodySm, color: colors.err }}>
                {cartError}
              </div>
            )}

            {/* Skeleton loading */}
            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md, overflow: 'hidden' }}>
                    <div className="sr-skeleton" style={{ height: 180 }} />
                    <div style={{ padding: 14 }}>
                      <div className="sr-skeleton" style={{ height: 14, marginBottom: 8, width: '80%' }} />
                      <div className="sr-skeleton" style={{ height: 12, marginBottom: 8, width: '50%' }} />
                      <div className="sr-skeleton" style={{ height: 18, width: '40%' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && displayedResults.length === 0 && !error && (
              <EmptyState
                title="No products found"
                description={query
                  ? `No results for "${query}". Try different keywords or remove some filters.`
                  : 'Try adjusting your filters or browse categories.'}
                action={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {(selectedCategories.length > 0 || selectedBrand || priceMin || priceMax) && (
                      <button onClick={() => { setSelectedCategories([]); setSelectedBrand(''); setPriceMin(''); setPriceMax(''); setVerifiedOnly(false); setInStockOnly(false); }}
                        style={{ padding: '8px 20px', background: colors.brand[700], color: '#fff', borderRadius: radii.sm, textDecoration: 'none', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        Clear Filters
                      </button>
                    )}
                    <Link href="/stores" style={{ display: 'inline-block', padding: '8px 20px', background: colors.surface, color: colors.brand[700], border: `1px solid ${colors.border}`, borderRadius: radii.sm, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                      Browse Stores
                    </Link>
                  </div>
                }
              />
            )}

            {/* Product Grid */}
            {!loading && displayedResults.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                  {displayedResults.map(product => {
                    const isVerified = product.store?.verificationStatus === 'VERIFIED';
                    return (
                      <div key={product.id} className="sr-card" style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Link href={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                          <div style={{ height: 180, background: colors.bgSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                            <ProductCardImage
                              product={product}
                              alt={product.title}
                              imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              placeholderStyle={{ color: colors.disabled, fontSize: 40 }}
                            />
                            {isVerified && (
                              <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 700, background: colors.brand[700], color: '#fff', letterSpacing: '0.5px' }}>
                                ✓ VERIFIED
                              </span>
                            )}
                            {product.condition && product.condition !== 'NEW' && (
                              <span style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 600, background: colors.warnBg, color: colors.warn }}>
                                {product.condition}
                              </span>
                            )}
                          </div>
                          <div style={{ padding: '12px 14px 8px' }}>
                            <div style={{ ...typeScale.body, fontWeight: 500, color: colors.brand[700], lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36 }}>
                              {product.title}
                            </div>
                            <div style={{ marginBottom: 6 }}>
                              {product.priceFromMinor != null ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                  <span style={{ fontSize: 11, color: colors.muted, fontWeight: 500 }}>{product.priceCurrency || 'SAR'}</span>
                                  <span style={{ fontSize: 18, fontWeight: 700, color: colors.brand[700] }}>
                                    {(product.priceFromMinor / 100).toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ ...typeScale.bodySm, color: colors.warn, fontWeight: 500 }}>Price on request</span>
                              )}
                            </div>
                            {/* Stock status badge */}
                            {(product as any).stockStatus && (product as any).stockStatus !== 'UNKNOWN' && (
                              <div style={{ marginBottom: 6 }}>
                                {(product as any).stockStatus === 'IN_STOCK' && (
                                  <span style={{ padding: '1px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 600, background: colors.okBg, color: colors.ok }}>In Stock</span>
                                )}
                                {(product as any).stockStatus === 'LOW_STOCK' && (
                                  <span style={{ padding: '1px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 600, background: colors.warnBg, color: colors.warn }}>Low Stock</span>
                                )}
                                {(product as any).stockStatus === 'OUT_OF_STOCK' && (
                                  <span style={{ padding: '1px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 600, background: colors.errBg, color: colors.err }}>Out of Stock</span>
                                )}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...typeScale.caption, color: colors.muted }}>
                              <span>MOQ: {product.moq}</span>
                              {product.store && (
                                <>
                                  <span style={{ color: colors.border }}>|</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{product.store.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </Link>
                        <div style={{ padding: '8px 14px 14px', marginTop: 'auto' }}>
                          {/* PHASE COS-13: Compare checkbox */}
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: colors.muted, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={compareList.ids.includes(product.id)}
                              disabled={!compareList.ids.includes(product.id) && compareList.isFull}
                              onChange={() => compareList.ids.includes(product.id) ? compareList.remove(product.id) : compareList.add(product.id)}
                              style={{ accentColor: colors.brand[700] }}
                            />
                            Compare
                          </label>
                          <button
                            onClick={() => handleAddToCart(product)}
                            style={{
                              width: '100%',
                              padding: '8px 14px',
                              ...typeScale.button,
                              color: '#fff',
                              border: 'none',
                              borderRadius: radii.full,
                              cursor: 'pointer',
                              background: addedItems.has(product.id) ? colors.ok : colors.amber,
                              transition: `background ${transitions.normal}`,
                            }}
                          >
                            {addedItems.has(product.id) ? '✓ Added to Cart' : 'Add to Cart'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 32, flexWrap: 'wrap' }}>
                    <button
                      className="sr-page-btn"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{ opacity: page <= 1 ? 0.4 : 1 }}
                    >
                      ‹ Prev
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          className={`sr-page-btn${page === pageNum ? ' sr-page-btn-active' : ''}`}
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      className="sr-page-btn"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      style={{ opacity: page >= totalPages ? 0.4 : 1 }}
                    >
                      Next ›
                    </button>
                    <span style={{ ...typeScale.caption, color: colors.muted, marginLeft: 12 }}>
                      Page {page} of {totalPages}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* PHASE COS-13: Floating compare bar */}
      {compareList.ids.length >= 2 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: colors.brand[700], color: '#fff',
          padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.15)', zIndex: 100,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {compareList.ids.length} product{compareList.ids.length !== 1 ? 's' : ''} selected
          </span>
          <Link
            href={`/compare?ids=${compareList.ids.join(',')}`}
            style={{
              padding: '6px 18px', background: '#fff', color: colors.brand[700],
              borderRadius: radii.sm, textDecoration: 'none', fontWeight: 600, fontSize: 13,
            }}
          >
            Compare Now
          </Link>
          <button
            onClick={() => compareList.clear()}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '5px 12px', borderRadius: radii.sm, cursor: 'pointer', fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}
