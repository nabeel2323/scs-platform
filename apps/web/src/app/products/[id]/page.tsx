'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  fetchProduct,
  addToCart,
  ProductDetail,
  ProductVariant,
} from '../../../lib/buyer-api';
import { formatMinor, LoadingSpinner, EmptyState, productImageSrc } from '../../../components/Shared';
import Link from 'next/link';

/**
 * Mirror of the API's `priceForQty` rule (tiers are minQty <= qty < maxQty, upper
 * bound exclusive, deepest matching tier wins) so the page can re-price as the
 * quantity changes without another round-trip. The cart still owns authority: it
 * re-resolves and snapshots the price on every add.
 */
function unitPriceFor(variant: ProductVariant, qty: number): number | undefined {
  const pricing = variant.pricing;
  if (!pricing) return undefined;
  let best: number | undefined;
  let bestMinQty = -1;
  for (const tier of pricing.tiers ?? []) {
    if (tier.minQty > qty) continue;
    if (tier.maxQty !== null && tier.maxQty !== undefined && qty >= tier.maxQty) continue;
    if (tier.minQty > bestMinQty) {
      bestMinQty = tier.minQty;
      best = tier.unitPriceMinor;
    }
  }
  return best ?? pricing.unitPriceMinor;
}

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params['id'] as string;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  // A5-1: the add handler used to swallow every error, so a rejected variant or a
  // price/MOQ change was indistinguishable from a dead button.
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    // Variants and pricing now arrive with the product, so the second request
    // (and the race between the two) is gone.
    fetchProduct(productId)
      .then(p => {
        setProduct(p);
        // The default quantity has to satisfy the MOQ itself, otherwise the
        // first add is rejected for a value the page pre-filled.
        setQty(p.moq || 1);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleAdd = async (variantId: string, storeId: string) => {
    setAddError(null);
    try {
      await addToCart({ variantId, storeId, quantity: qty });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add this item to your cart');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <EmptyState title="Product not found" />;

  const variants = product.variants ?? [];
  const store = product.store ?? null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>{product.title}</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          {product.isAvailable ? 'Available' : 'Unavailable'} · MOQ: {product.moq}
        </p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* Image */}
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 12, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {productImageSrc(product.images)
            ? <img src={productImageSrc(product.images)} alt={product.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 64, opacity: 0.2 }}>📦</span>}
        </div>

        {/* Details */}
        <div>
          {product.titleAr && <div style={{ fontSize: 18, color: '#5b6b74', marginBottom: 8, direction: 'rtl' }}>{product.titleAr}</div>}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: product.isAvailable ? '#d1fae5' : '#fee2e2', color: product.isAvailable ? '#065f46' : '#991b1b' }}>
              {product.isAvailable ? 'Available' : 'Unavailable'}
            </span>
            <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#4a5568' }}>
              MOQ: {product.moq}
            </span>
          </div>
          {/* A5-6: warehouse-level stock isn't exposed yet (acceptable for pilot).
              Show a note so wholesale buyers know to enquire about lead times. */}
          {product.isAvailable && (
            <div style={{ fontSize: 12, color: '#5b6b74', marginBottom: 16, padding: '8px 12px', background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 6 }}>
              <strong>Stock:</strong> Available from supplier warehouse. Contact supplier for exact stock levels and lead times on large orders.
            </div>
          )}
          {product.description && <p style={{ color: '#5b6b74', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{product.description}</p>}

          {/* Seller — A5-1: the listing used to say nothing about who was selling */}
          <div style={{ marginBottom: 24, padding: '12px 14px', background: '#f7fafa', border: '1px solid #d9e2e6', borderRadius: 8 }}>
            {store ? (
              <>
                <div style={{ fontSize: 11, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sold by</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <Link href={`/stores/${store.slug || store.id}`} style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', textDecoration: 'none' }}>
                    {store.name}
                  </Link>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: store.verificationStatus === 'VERIFIED' ? '#d1fae5' : '#fef3c7', color: store.verificationStatus === 'VERIFIED' ? '#065f46' : '#92400e' }}>
                    {store.verificationStatus}
                  </span>
                  {/* A suspended store still resolves, but the buyer must see why
                      an order may not proceed. */}
                  {store.status !== 'ACTIVE' && (
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#991b1b' }}>
                      Store {store.status}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#92400e' }}>Seller information is unavailable for this listing.</div>
            )}
          </div>

          {/* Variants */}
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Variants</h3>
          {variants.filter(v => v.isActive).length === 0 ? (
            <p style={{ color: '#a0aec0', fontSize: 13 }}>No variants available</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {variants.filter(v => v.isActive).map(v => {
                const currency = v.pricing?.currency ?? store?.currency;
                const unit = unitPriceFor(v, qty);
                const tiers = v.pricing?.tiers ?? [];
                return (
                  <div key={v.id} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
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
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      {unit !== undefined ? (
                        <>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f3340' }}>
                            {formatMinor(unit, currency)} <span style={{ fontSize: 11, fontWeight: 400, color: '#5b6b74' }}>/ {v.unit || 'unit'}</span>
                          </span>
                          <span style={{ fontSize: 11, color: '#5b6b74' }}>at qty {qty}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: '#92400e' }}>No active price for this item — the cart will reject it until the seller publishes one</span>
                      )}
                      {tiers.length > 1 && (
                        <span style={{ fontSize: 11, color: '#5b6b74' }}>
                          · volume: {tiers.map(t => `${t.minQty}+ ${formatMinor(t.unitPriceMinor, currency)}`).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {addError && (
            <div role="alert" style={{ marginTop: 16, padding: 14, background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 8 }}>
              <span style={{ color: '#9b2c2c', fontWeight: 600, fontSize: 13 }}>{addError}</span>
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
    </div>
  );
}
