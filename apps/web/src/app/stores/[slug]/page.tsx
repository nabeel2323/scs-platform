'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchPublicStore, fetchStoreProducts, addToCart, Product } from '../../../lib/buyer-api';
import { formatMinor, LoadingSpinner, EmptyState } from '../../../components/Shared';

interface StoreDetail {
  id: string;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  verificationStatus: string;
  address: Record<string, unknown>;
}

export default function StoreDetailPage() {
  const params = useParams();
  const slugOrId = params['slug'] as string;
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetchPublicStore(slugOrId).then(setStore as any),
      fetchStoreProducts(slugOrId, { limit: 50 }).then(d => setProducts(d as Product[])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [slugOrId]);

  const handleAddToCart = async (product: Product) => {
    try {
      await addToCart({ variantId: product.id, storeId: product.storeId, quantity: 1 });
      setAddedItems(prev => new Set(prev).add(product.id));
      setTimeout(() => setAddedItems(prev => { const n = new Set(prev); n.delete(product.id); return n; }), 2000);
    } catch { /* ignore */ }
  };

  if (loading) return <LoadingSpinner />;
  if (!store) return <EmptyState title="Store not found" />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      {/* Store header */}
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 12, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>
            {store.logoUrl ? <img src={store.logoUrl} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} /> : '🏪'}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>{store.displayName}</h1>
            {store.description && <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 8 }}>{store.description}</p>}
            <span style={{
              padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: store.verificationStatus === 'VERIFIED' ? '#d1fae5' : '#fef3c7',
              color: store.verificationStatus === 'VERIFIED' ? '#065f46' : '#92400e',
            }}>
              {store.verificationStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Products */}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 16 }}>Products</h2>
      {products.length === 0 ? (
        <EmptyState title="No products yet" description="This store hasn't listed products yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {products.map(product => (
            <div key={product.id} style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
              <Link href={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ height: 140, background: '#f0f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {product.images && (product.images as any[]).length > 0
                    ? <img src={(product.images as any[])[0]?.url || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32, opacity: 0.3 }}>📦</span>}
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74', marginTop: 4 }}>MOQ: {product.moq}</div>
                </div>
              </Link>
              <div style={{ padding: '0 16px 12px' }}>
                <button
                  onClick={() => handleAddToCart(product)}
                  style={{
                    width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 600,
                    color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: addedItems.has(product.id) ? '#065f46' : '#0f3340',
                  }}
                >
                  {addedItems.has(product.id) ? '✓ Added to Cart' : 'Add to Cart'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
