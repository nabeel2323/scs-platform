'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { fetchProduct, fetchProductVariants, addToCart, Product, ProductVariant } from '../../../lib/buyer-api';
import { formatMinor, LoadingSpinner, EmptyState } from '../../../components/Shared';
import Link from 'next/link';

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params['id'] as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchProduct(productId).then(setProduct),
      fetchProductVariants(productId).then(setVariants),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [productId]);

  const handleAdd = async (variantId: string, storeId: string) => {
    try {
      await addToCart({ variantId, storeId, quantity: qty });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch { /* ignore */ }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <EmptyState title="Product not found" />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* Image */}
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 12, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {product.images && (product.images as any[]).length > 0
            ? <img src={(product.images as any[])[0]?.url || ''} alt={product.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 64, opacity: 0.2 }}>📦</span>}
        </div>

        {/* Details */}
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f3340', marginBottom: 8 }}>{product.title}</h1>
          {product.titleAr && <div style={{ fontSize: 18, color: '#5b6b74', marginBottom: 8, direction: 'rtl' }}>{product.titleAr}</div>}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: product.isAvailable ? '#d1fae5' : '#fee2e2', color: product.isAvailable ? '#065f46' : '#991b1b' }}>
              {product.isAvailable ? 'Available' : 'Unavailable'}
            </span>
            <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#4a5568' }}>
              MOQ: {product.moq}
            </span>
          </div>
          {product.description && <p style={{ color: '#5b6b74', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{product.description}</p>}

          {/* Variants */}
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Variants</h3>
          {variants.length === 0 ? (
            <p style={{ color: '#a0aec0', fontSize: 13 }}>No variants available</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {variants.filter(v => v.isActive).map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f3340' }}>{v.title || v.sku}</div>
                    <div style={{ fontSize: 12, color: '#5b6b74' }}>SKU: {v.sku} {v.barcode ? `| ${v.barcode}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="number" min={product.moq} value={qty} onChange={e => setQty(Math.max(product.moq, parseInt(e.target.value) || product.moq))} style={{ width: 60, padding: '4px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13, textAlign: 'center' }} />
                    <button onClick={() => handleAdd(v.id, product.storeId)} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#fff', background: added ? '#065f46' : '#0f3340', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                      {added ? '✓ Added' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <Link href="/cart" style={{ display: 'inline-block', padding: '10px 24px', background: '#0f3340', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Go to Cart
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
