'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { searchProducts, fetchCategories, fetchBrands, addToCart, Product, Category } from '../../lib/buyer-api';
import { formatMinor, EmptyState, LoadingSpinner, ErrorBanner } from '../../components/Shared';

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
      setResults(res.products || []);
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
    try {
      await addToCart({ variantId: product.id, storeId: product.storeId, quantity: 1 });
      setAddedItems(prev => new Set(prev).add(product.id));
      setTimeout(() => setAddedItems(prev => { const n = new Set(prev); n.delete(product.id); return n; }), 2000);
    } catch {
      // silently fail
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
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
                  {product.images && (product.images as any[]).length > 0 ? (
                    <img src={(product.images as any[])[0]?.url || ''} alt={product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#a0aec0', fontSize: 32 }}>📦</span>
                  )}
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74', marginBottom: 8 }}>
                    MOQ: {product.moq}
                  </div>
                </div>
              </Link>
              <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => handleAddToCart(product)}
                  style={{
                    ...addBtnStyle,
                    background: addedItems.has(product.id) ? '#065f46' : '#0f3340',
                  }}
                >
                  {addedItems.has(product.id) ? '✓ Added' : '+ Cart'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
