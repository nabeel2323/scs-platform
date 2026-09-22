'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  searchProducts, fetchCategories, fetchBrands, fetchProductVariants, addToCart,
  Product, Category,
} from '../../lib/buyer-api';
import { formatMinor, EmptyState, ErrorBanner, productImageSrc } from '../../components/Shared';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'title-asc';

const LIMIT_OPTIONS = [20, 40, 60];

export default function SearchPage() {
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
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('cat') || '');
  const [selectedBrand, setSelectedBrand] = useState(searchParams.get('brand') || '');
  const [sort, setSort] = useState<SortOption>((searchParams.get('sort') as SortOption) || 'featured');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [limit, setLimit] = useState(Number(searchParams.get('limit')) || 20);
  const [priceMin, setPriceMin] = useState(searchParams.get('pmin') || '');
  const [priceMax, setPriceMax] = useState(searchParams.get('pmax') || '');
  const [verifiedOnly, setVerifiedOnly] = useState(searchParams.get('verified') === '1');
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('instock') === '1');

  const [results, setResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string; slug: string }[]>([]);
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
    if (selectedCategory) params.set('cat', selectedCategory);
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
  }, [query, selectedCategory, selectedBrand, sort, page, limit, priceMin, priceMax, verifiedOnly, inStockOnly, router]);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      const res = await searchProducts({
        q: query || undefined,
        categoryId: selectedCategory || undefined,
        brandId: selectedBrand || undefined,
        limit: limit + 20, // fetch extra for client-side filtering
        offset,
      });
      setResults(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, selectedCategory, selectedBrand, page, limit]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doSearch, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [doSearch]);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  const handleCategoryChange = (id: string) => { setSelectedCategory(selectedCategory === id ? '' : id); resetPage(); };
  const handleBrandChange = (id: string) => { setSelectedBrand(selectedBrand === id ? '' : id); resetPage(); };
  const handleSortChange = (s: SortOption) => { setSort(s); resetPage(); };
  const handleLimitChange = (l: number) => { setLimit(l); setPage(1); };

  // Client-side filtering and sorting
  const displayedResults = useMemo(() => {
    let filtered = [...results];

    // Price filter (client-side since API doesn't support it)
    if (priceMin) {
      const minVal = Math.round(parseFloat(priceMin) * 100);
      filtered = filtered.filter(p => p.priceFromMinor != null && p.priceFromMinor >= minVal);
    }
    if (priceMax) {
      const maxVal = Math.round(parseFloat(priceMax) * 100);
      filtered = filtered.filter(p => p.priceFromMinor != null && p.priceFromMinor <= maxVal);
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

    return filtered.slice(0, limit);
  }, [results, priceMin, priceMax, verifiedOnly, inStockOnly, sort, limit]);

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
  const selectedCatName = categories.find(c => c.id === selectedCategory)?.name;
  const selectedBrandName = brands.find(b => b.id === selectedBrand)?.name;

  // Star rating component
  const StarRating = ({ rating }: { rating: number }) => (
    <span style={{ color: '#f59e0b', fontSize: 13, letterSpacing: 1 }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );

  return (
    <>
      <style>{`
        .sr-skeleton { animation: sr-pulse 1.5s ease-in-out infinite; background: #e2e8f0; border-radius: 6px; }
        @keyframes sr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .sr-card { transition: box-shadow 0.2s ease, transform 0.15s ease; }
        .sr-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-2px); }
        .sr-filter-section { border-bottom: 1px solid #e2e8f0; padding: 16px 0; }
        .sr-filter-section:last-child { border-bottom: none; }
        .sr-checkbox { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; font-size: 13px; color: #1e2d35; }
        .sr-page-btn { min-width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 1px solid #d9e2e6; border-radius: 6px; background: #fff; color: #5b6b74; font-size: 13; cursor: pointer; }
        .sr-page-btn-active { background: #0f3340; color: #fff; border-color: #0f3340; }
        @media (max-width: 768px) {
          .sr-sidebar { display: none; }
          .sr-sidebar-open { display: block !important; position: fixed; top: 0; left: 0; bottom: 0; width: 280px; z-index: 200; background: #fff; overflow-y: auto; padding: 20px; box-shadow: 4px 0 20px rgba(0,0,0,0.15); }
          .sr-filter-toggle { display: flex !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Amazon-style Search Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '20px 24px', margin: '0 -16px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <select
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value); resetPage(); }}
                style={{ padding: '12px 14px', fontSize: 13, border: 'none', background: '#f3f6f9', color: '#0f3340', fontWeight: 600, minWidth: 140, cursor: 'pointer', outline: 'none' }}
              >
                <option value="">All Departments</option>
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
              <button onClick={doSearch} style={{ padding: '12px 28px', fontSize: 15, fontWeight: 600, background: '#f59e0b', color: '#0f3340', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>⌕</span> Search
              </button>
            </div>
          </div>
        </div>

        {/* ── Breadcrumb ── */}
        <div style={{ padding: '12px 0', fontSize: 12, color: '#5b6b74', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Link href="/search" style={{ color: '#1e6178', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          {selectedCatName && <><Link href={`/search?cat=${selectedCategory}`} style={{ color: '#1e6178', textDecoration: 'none' }}>{selectedCatName}</Link><span>›</span></>}
          {selectedBrandName && <><span>{selectedBrandName}</span><span>›</span></>}
          <span style={{ color: '#0f3340', fontWeight: 500 }}>
            {query ? `Results for "${query}"` : selectedCatName ? 'Category' : 'All Products'}
          </span>
        </div>

        {/* ── Results count + sort bar ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#5b6b74' }}>
            {total > 0 ? (
              <>
                <span style={{ fontWeight: 600, color: '#0f3340' }}>{total.toLocaleString()}</span> result{total !== 1 ? 's' : ''}
                {query && <> for "<strong style={{ color: '#0f3340' }}>{query}</strong>"</>}
              </>
            ) : !loading && <span>No results found</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Mobile filter toggle */}
            <button
              className="sr-filter-toggle"
              onClick={() => setMobileFiltersOpen(true)}
              style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer', color: '#0f3340' }}
            >
              ☰ Filters
            </button>
            <label style={{ fontSize: 13, color: '#5b6b74', display: 'flex', alignItems: 'center', gap: 6 }}>
              Sort by:
              <select value={sort} onChange={e => handleSortChange(e.target.value as SortOption)} style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#0f3340', fontWeight: 500, cursor: 'pointer' }}>
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="newest">Newest Arrivals</option>
                <option value="title-asc">Name: A to Z</option>
              </select>
            </label>
            <label style={{ fontSize: 13, color: '#5b6b74', display: 'flex', alignItems: 'center', gap: 6 }}>
              Show:
              <select value={limit} onChange={e => handleLimitChange(Number(e.target.value))} style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#0f3340', cursor: 'pointer' }}>
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
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f3340', margin: 0 }}>Filters</h3>
                <button onClick={() => setMobileFiltersOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#5b6b74' }}>✕</button>
              </div>
            )}

            {/* Department */}
            <div className="sr-filter-section">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</h4>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {categories.map(c => (
                  <label key={c.id} className="sr-checkbox">
                    <input type="checkbox" checked={selectedCategory === c.id} onChange={() => handleCategoryChange(c.id)} style={{ accentColor: '#0f3340' }} />
                    <span>{c.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#a0aec0' }}>({c.productCount})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Brand */}
            <div className="sr-filter-section">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Brand</h4>
              <input
                type="text"
                placeholder="Search brands..."
                value={brandSearch}
                onChange={e => setBrandSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 4, marginBottom: 8, boxSizing: 'border-box' }}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {filteredBrands.slice(0, 20).map(b => (
                  <label key={b.id} className="sr-checkbox">
                    <input type="checkbox" checked={selectedBrand === b.id} onChange={() => handleBrandChange(b.id)} style={{ accentColor: '#0f3340' }} />
                    <span>{b.name}</span>
                  </label>
                ))}
                {filteredBrands.length > 20 && <div style={{ fontSize: 11, color: '#1e6178', padding: '4px 0', cursor: 'pointer' }}>See more...</div>}
              </div>
            </div>

            {/* Price Range */}
            <div className="sr-filter-section">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" placeholder="Min" value={priceMin} onChange={e => { setPriceMin(e.target.value); resetPage(); }} style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 4, boxSizing: 'border-box' }} min={0} step="0.01" />
                <span style={{ color: '#a0aec0' }}>–</span>
                <input type="number" placeholder="Max" value={priceMax} onChange={e => { setPriceMax(e.target.value); resetPage(); }} style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 4, boxSizing: 'border-box' }} min={0} step="0.01" />
              </div>
            </div>

            {/* Customer Rating */}
            <div className="sr-filter-section">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Rating</h4>
              {[4, 3, 2, 1].map(r => (
                <label key={r} className="sr-checkbox">
                  <StarRating rating={r} />
                  <span style={{ fontSize: 12, color: '#5b6b74' }}>& Up</span>
                </label>
              ))}
            </div>

            {/* Availability */}
            <div className="sr-filter-section">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Availability</h4>
              <label className="sr-checkbox">
                <input type="checkbox" checked={inStockOnly} onChange={e => { setInStockOnly(e.target.checked); resetPage(); }} style={{ accentColor: '#0f3340' }} />
                <span>In Stock Only</span>
              </label>
              <label className="sr-checkbox" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={verifiedOnly} onChange={e => { setVerifiedOnly(e.target.checked); resetPage(); }} style={{ accentColor: '#0f3340' }} />
                <span style={{ color: '#065f46', fontWeight: 500 }}>Verified Sellers Only</span>
              </label>
            </div>

            {/* Clear filters */}
            {(selectedCategory || selectedBrand || priceMin || priceMax || verifiedOnly || inStockOnly) && (
              <button onClick={() => { setSelectedCategory(''); setSelectedBrand(''); setPriceMin(''); setPriceMax(''); setVerifiedOnly(false); setInStockOnly(false); resetPage(); }}
                style={{ width: '100%', padding: '8px 12px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', marginTop: 12 }}>
                Clear All Filters
              </button>
            )}
          </aside>

          {/* Mobile overlay backdrop */}
          {mobileFiltersOpen && <div onClick={() => setMobileFiltersOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} />}

          {/* ── Results Area ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {error && <ErrorBanner message={error} onRetry={doSearch} />}
            {cartError && (
              <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 8, fontSize: 13, color: '#9b2c2c' }}>
                {cartError}
              </div>
            )}

            {/* Skeleton loading */}
            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
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
                    {(selectedCategory || selectedBrand || priceMin || priceMax) && (
                      <button onClick={() => { setSelectedCategory(''); setSelectedBrand(''); setPriceMin(''); setPriceMax(''); setVerifiedOnly(false); setInStockOnly(false); }}
                        style={{ padding: '8px 20px', background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        Clear Filters
                      </button>
                    )}
                    <Link href="/stores" style={{ display: 'inline-block', padding: '8px 20px', background: '#fff', color: '#0f3340', border: '1px solid #d9e2e6', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
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
                    const imgSrc = productImageSrc(product.images);
                    const isVerified = product.store?.verificationStatus === 'VERIFIED';
                    return (
                      <div key={product.id} className="sr-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Link href={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                          <div style={{ height: 180, background: '#f7f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                            {imgSrc ? (
                              <img src={imgSrc} alt={product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                            ) : (
                              <span style={{ color: '#a0aec0', fontSize: 40 }}>📦</span>
                            )}
                            {isVerified && (
                              <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#0f3340', color: '#fff', letterSpacing: '0.5px' }}>
                                ✓ VERIFIED
                              </span>
                            )}
                            {product.condition && product.condition !== 'NEW' && (
                              <span style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                                {product.condition}
                              </span>
                            )}
                          </div>
                          <div style={{ padding: '12px 14px 8px' }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f3340', lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36 }}>
                              {product.title}
                            </div>
                            <div style={{ marginBottom: 6 }}>
                              {product.priceFromMinor != null ? (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                  <span style={{ fontSize: 11, color: '#5b6b74', fontWeight: 500 }}>{product.priceCurrency || 'SAR'}</span>
                                  <span style={{ fontSize: 18, fontWeight: 700, color: '#0f3340' }}>
                                    {(product.priceFromMinor / 100).toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>Price on request</span>
                              )}
                            </div>
                            {/* Stock status badge */}
                            {(product as any).stockStatus && (product as any).stockStatus !== 'UNKNOWN' && (
                              <div style={{ marginBottom: 6 }}>
                                {(product as any).stockStatus === 'IN_STOCK' && (
                                  <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: '#d1fae5', color: '#065f46' }}>In Stock</span>
                                )}
                                {(product as any).stockStatus === 'LOW_STOCK' && (
                                  <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>Low Stock</span>
                                )}
                                {(product as any).stockStatus === 'OUT_OF_STOCK' && (
                                  <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>Out of Stock</span>
                                )}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#5b6b74' }}>
                              <span>MOQ: {product.moq}</span>
                              {product.store && (
                                <>
                                  <span style={{ color: '#d9e2e6' }}>|</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{product.store.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </Link>
                        <div style={{ padding: '8px 14px 14px', marginTop: 'auto' }}>
                          <button
                            onClick={() => handleAddToCart(product)}
                            style={{
                              width: '100%',
                              padding: '8px 14px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#fff',
                              border: 'none',
                              borderRadius: 20,
                              cursor: 'pointer',
                              background: addedItems.has(product.id) ? '#065f46' : '#f59e0b',
                              transition: 'background 0.2s ease',
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
                    <span style={{ fontSize: 12, color: '#5b6b74', marginLeft: 12 }}>
                      Page {page} of {totalPages}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
