'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { searchProducts, fetchCategories, fetchBrands, fetchProductVariants, addToCart, Product, Category } from '../../lib/buyer-api';
import { formatMinor, EmptyState, LoadingSpinner, ErrorBanner, productImageSrc } from '../../components/Shared';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  // A5-2: a failed add used to be swallowed, so "+ Cart" looked broken.
  const [cartError, setCartError] = useState('');

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    fetchBrands().then(setBrands).catch(() => {});
  }, []);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await searchProducts({
        q: query || undefined,
        categoryId: selectedCategory || undefined,
        brandId: selectedBrand || undefined,
        limit: 40,
      });
      setResults(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, selectedCategory, selectedBrand]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  const handleAddToCart = async (product: Product) => {
    setCartError('');
    try {
      // The listing shows products, but the cart references a variant — resolve
      // the product's default (first active) variant before adding. A fallback
      // to an inactive variant was removed: `addItem` rejects inactive ones, so
      // it could only ever turn a clear message into a server error.
      const variants = await fetchProductVariants(product.id);
      const variant = variants.find(v => v.isActive);
      if (!variant) {
        setCartError(`"${product.title}" has no orderable variant yet.`);
        return;
      }
      // Buy at the product's MOQ: adding below it is rejected at checkout, so a
      // quantity the listing itself declares invalid only defers the failure.
      await addToCart({ variantId: variant.id, storeId: product.storeId, quantity: product.moq || 1 });
      setAddedItems(prev => new Set(prev).add(product.id));
      setTimeout(() => setAddedItems(prev => { const n = new Set(prev); n.delete(product.id); return n; }), 2000);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : `Could not add "${product.title}" to your cart.`);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Search Products</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Browse the wholesale catalog</p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search products by name, SKU, or barcode..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={searchInputStyle}
        />
        <button onClick={doSearch} style={searchBtnStyle}>Search</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.productCount})</option>
          ))}
        </select>

        <select
          value={selectedBrand}
          onChange={e => setSelectedBrand(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Brands</option>
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {total > 0 && (
          <span style={{ fontSize: 13, color: '#5b6b74', alignSelf: 'center' }}>
            {total} result{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {categories.slice(0, 10).map(c => (
          <button
            key={c.id}
            onClick={() => { setSelectedCategory(selectedCategory === c.id ? '' : c.id); setQuery(''); }}
            style={{
              ...chipStyle,
              background: selectedCategory === c.id ? '#0f3340' : '#fff',
              color: selectedCategory === c.id ? '#fff' : '#5b6b74',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={doSearch} />}
      {cartError && (
        <div role="alert" style={{ marginBottom: 16, padding: 14, background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 8 }}>
          <span style={{ color: '#9b2c2c', fontWeight: 600, fontSize: 13 }}>{cartError}</span>
        </div>
      )}
      {loading && <LoadingSpinner />}

      {/* Results grid */}
      {!loading && results.length === 0 && !error && (
        <EmptyState
          title="No products found"
          description={query ? `No results for "${query}"` : 'Try browsing categories or stores'}
          action={<Link href="/stores" style={linkBtnStyle}>Browse Stores</Link>}
        />
      )}

      {!loading && results.length > 0 && (
        <div style={gridStyle}>
          {results.map(product => (
            <div key={product.id} style={cardStyle}>
              <Link href={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={imgPlaceholderStyle}>
                  {productImageSrc(product.images) ? (
                    <img src={productImageSrc(product.images)} alt={product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#a0aec0', fontSize: 32 }}>📦</span>
                  )}
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.title}
                  </div>
                  {/* A5-2: price is what makes two listings comparable at all. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    {product.priceFromMinor != null ? (
                      <>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#0f3340' }}>
                          {formatMinor(product.priceFromMinor, product.priceCurrency ?? undefined)}
                        </span>
                        <span style={{ fontSize: 11, color: '#5b6b74' }}>from</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: '#92400e' }}>Price on request</span>
                    )}
                    {product.store?.verificationStatus === 'VERIFIED' && (
                      <span style={{ marginLeft: 'auto', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#d1fae5', color: '#065f46' }}>
                        VERIFIED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>
                    MOQ: {product.moq}
                  </div>
                </div>
              </Link>
              <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => handleAddToCart(product)}
                  style={{
                    ...addBtnStyle,
                    background: addedItems.has(product.id) ? '#065f46' : '#0f3340',
                  }}
                >
                  {addedItems.has(product.id) ? '✓ Added' : '+ Cart'}
                </button>
                {/* Its own link — nesting an anchor inside the product link above
                    would be invalid markup. */}
                {product.store && (
                  <Link href={`/stores/${product.store.slug || product.store.id}`} style={{ fontSize: 12, color: '#1e6178', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                    by {product.store.name} →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  fontSize: 15,
  border: '1px solid #d9e2e6',
  borderRadius: 8,
  outline: 'none',
};

const searchBtnStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  background: '#0f3340',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  border: '1px solid #d9e2e6',
  borderRadius: 6,
  background: '#fff',
  color: '#5b6b74',
};

const chipStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid #d9e2e6',
  borderRadius: 20,
  cursor: 'pointer',
  background: '#fff',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 10,
  overflow: 'hidden',
};

const imgPlaceholderStyle: React.CSSProperties = {
  height: 160,
  background: '#f0f4f6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const addBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 20px',
  background: '#0f3340',
  color: '#fff',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};
