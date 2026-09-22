'use client';

import { useState, useEffect, useMemo } from 'react';
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

/**
 * Build the gallery image list for the product.
 *
 * Primary source is the resolved `product_media` rows (server signs storage
 * keys into `displayUrl`). `products.images` (JSONB URL strings) fills in any
 * full-URL entries not already covered, so legacy uploads still render.
 */
function galleryImages(product: ProductDetail): { src: string; alt: string }[] {
  const media = product.media ?? [];
  const out: { src: string; alt: string }[] = [];
  const seen = new Set<string>();
  for (const m of media) {
    if (m.mediaType !== 'IMAGE') continue;
    const src = m.displayUrl ?? m.thumbSrc;
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, alt: m.altText || product.title });
  }
  // Legacy images array: only absolute URLs are renderable client-side
  if (Array.isArray(product.images)) {
    for (const img of product.images) {
      if (typeof img !== 'string') continue;
      const abs = /^https?:\/\//i.test(img.trim()) ? img.trim() : undefined;
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      out.push({ src: abs, alt: product.title });
    }
  }
  // Last resort: the shared listing accessor (first entry, any shape)
  if (out.length === 0) {
    const fallback = productImageSrc(product.images);
    if (fallback) out.push({ src: fallback, alt: product.title });
  }
  return out;
}

// ── Amazon-style gallery ─────────────────────────────────────────

function ProductGallery({ images, title }: { images: { src: string; alt: string }[]; title: string }) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(false);

  const visible = images.filter(i => !failed.has(i.src));
  const current = visible[selected] ?? visible[0];

  if (!current) {
    return (
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 12, height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 72, opacity: 0.2 }} aria-label="No image">📦</span>
      </div>
    );
  }

  return (
    <div>
      {/* Main image — hover zoom (Amazon-style magnification) */}
      <div
        style={{
          background: '#fff', border: '1px solid #d9e2e6', borderRadius: 12, height: 460,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          position: 'relative', cursor: 'zoom-in',
        }}
        onMouseEnter={() => setZoom(true)}
        onMouseLeave={() => setZoom(false)}
      >
        <img
          key={current.src}
          src={current.src}
          alt={current.alt || title}
          loading="eager"
          onError={() => setFailed(prev => new Set(prev).add(current.src))}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            transform: zoom ? 'scale(1.6)' : 'scale(1)',
            transition: 'transform 0.25s ease',
          }}
        />
        {visible.length > 1 && (
          <>
            <button
              onClick={() => setSelected(s => Math.max(0, s - 1))}
              disabled={selected === 0}
              aria-label="Previous image"
              style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%', border: '1px solid #d9e2e6',
                background: 'rgba(255,255,255,0.92)', fontSize: 16, cursor: 'pointer', opacity: selected === 0 ? 0.4 : 1,
              }}
            >‹</button>
            <button
              onClick={() => setSelected(s => Math.min(visible.length - 1, s + 1))}
              disabled={selected === visible.length - 1}
              aria-label="Next image"
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%', border: '1px solid #d9e2e6',
                background: 'rgba(255,255,255,0.92)', fontSize: 16, cursor: 'pointer', opacity: selected === visible.length - 1 ? 0.4 : 1,
              }}
            >›</button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {visible.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {visible.map((img, i) => (
            <button
              key={img.src}
              onClick={() => setSelected(i)}
              aria-label={`View image ${i + 1} of ${visible.length}`}
              aria-current={i === selected}
              style={{
                width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
                border: i === selected ? '2px solid #0f3340' : '1px solid #d9e2e6',
                background: '#fff', cursor: 'pointer', padding: 2,
              }}
            >
              <img src={img.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {images.length > 0 && visible.length === 0 && (
        <div style={{ fontSize: 12, color: '#92400e', marginTop: 8 }}>Product images are temporarily unavailable.</div>
      )}
    </div>
  );
}

// ── Stock badge per variant ──────────────────────────────────────

function StockBadge({ stock }: { stock?: { totalAvailable: number } | null }) {
  const available = stock?.totalAvailable ?? 0;
  if (available > 10) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: '#067d62' }}>In Stock</span>;
  }
  if (available > 0) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: '#b12704' }}>Only {available} left</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#5b6b74' }}>Out of stock</span>;
}

// ── Page ─────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params['id'] as string;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  // Per-variant add feedback: one flag would light every row at once.
  const [addedId, setAddedId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    // Variants, pricing, media and stock arrive with the product in one request.
    fetchProduct(productId)
      .then(p => {
        setProduct(p);
        setQty(p.moq || 1);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  const images = useMemo(() => (product ? galleryImages(product) : []), [product]);

  const handleAdd = async (variantId: string, storeId: string) => {
    setAddError(null);
    try {
      await addToCart({ variantId, storeId, quantity: qty });
      setAddedId(variantId);
      setTimeout(() => setAddedId(null), 2000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add this item to your cart');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <EmptyState title="Product not found" />;

  const variants = product.variants ?? [];
  const activeVariants = variants.filter(v => v.isActive);
  const inactiveVariants = variants.filter(v => !v.isActive);
  const store = product.store ?? null;
  const cheapestPrice = activeVariants
    .map(v => v.pricing?.unitPriceMinor)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b)[0];
  const baseCurrency = activeVariants[0]?.pricing?.currency ?? store?.currency ?? 'SAR';

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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: 32, alignItems: 'start' }}>
        {/* Gallery */}
        <ProductGallery images={images} title={product.title} />

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

          {/* Amazon-style "from" price headline */}
          {cheapestPrice !== undefined && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#5b6b74' }}>Price from </span>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#0f3340' }}>
                {formatMinor(cheapestPrice, baseCurrency).replace(/ [A-Z]+$/, '')}
              </span>
              <span style={{ fontSize: 13, color: '#5b6b74', marginLeft: 4 }}>{baseCurrency}</span>
            </div>
          )}

          {/* Real stock status from warehouse inventory */}
          {product.isAvailable && (
            <div style={{ fontSize: 12, color: '#5b6b74', marginBottom: 16, padding: '8px 12px', background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 6 }}>
              {(() => {
                const totalStock = activeVariants.reduce((sum, v) => sum + ((v.stock?.totalAvailable ?? 0)), 0);
                const hasAnyStock = activeVariants.some(v => (v.stock?.totalAvailable ?? 0) > 0);
                if (hasAnyStock) {
                  return <><strong style={{ color: '#065f46' }}>In Stock:</strong> {totalStock} units available across {activeVariants.filter(v => (v.stock?.totalAvailable ?? 0) > 0).length} variant(s). Large orders may require lead time.</>;
                }
                return <><strong>Stock:</strong> Available from supplier warehouse. Contact supplier for exact stock levels and lead times on large orders.</>;
              })()}
            </div>
          )}
          {product.description && <p style={{ color: '#5b6b74', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{product.description}</p>}

          {/* Seller */}
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
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>
            Variants <span style={{ fontSize: 12, fontWeight: 400, color: '#5b6b74' }}>({activeVariants.length})</span>
          </h3>
          {activeVariants.length === 0 ? (
            <p style={{ color: '#a0aec0', fontSize: 13 }}>No variants available</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeVariants.map(v => {
                const currency = v.pricing?.currency ?? store?.currency ?? 'SAR';
                const unit = unitPriceFor(v, qty);
                const tiers = v.pricing?.tiers ?? [];
                const outOfStock = (v.stock?.totalAvailable ?? 0) <= 0;
                return (
                  <div key={v.id} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 8, opacity: outOfStock ? 0.75 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#0f3340' }}>
                          {v.title || v.sku} <span style={{ marginLeft: 8 }}><StockBadge stock={v.stock} /></span>
                        </div>
                        <div style={{ fontSize: 12, color: '#5b6b74', fontFamily: 'monospace' }}>
                          SKU: {v.sku} {v.barcode ? `| ${v.barcode}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                          type="number"
                          min={product.moq}
                          value={qty}
                          onChange={e => setQty(Math.max(product.moq, parseInt(e.target.value) || product.moq))}
                          aria-label={`Quantity for ${v.title || v.sku}`}
                          style={{ width: 60, padding: '4px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13, textAlign: 'center' }}
                        />
                        <button
                          onClick={() => handleAdd(v.id, product.storeId)}
                          disabled={outOfStock}
                          style={{
                            padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#fff',
                            background: addedId === v.id ? '#065f46' : outOfStock ? '#a0aec0' : '#f0c14b',
                            border: '1px solid ' + (addedId === v.id ? '#065f46' : outOfStock ? '#a0aec0' : '#a88734'),
                            borderRadius: 6, cursor: outOfStock ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {outOfStock ? 'Out of Stock' : addedId === v.id ? '✓ Added' : 'Add to Cart'}
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

          {/* Inactive variants shown greyed so buyers understand the listing fully */}
          {inactiveVariants.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#a0aec0' }}>
              {inactiveVariants.length} variant(s) currently inactive.
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
