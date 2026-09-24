'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  fetchProduct,
  addToCart,
  ProductDetail,
  ProductVariant,
  fetchProductOffers,
  Offer,
  fetchProductOffersRanked,
  RankedProductOffer,
} from '../../../lib/buyer-api';
import { formatMinor, LoadingSpinner, EmptyState, productImageSrc } from '../../../components/Shared';
import Link from 'next/link';
import {
  PageHeader, BreadcrumbDark,
  colors, typeScale, radii, shadows, transitions,
} from '@scs/ui-kit';
import { useCompareList } from '../../../hooks/useProductComparison';
import { VariantSelector } from './components/VariantSelector';
import { OfferComparisonTable } from './components/OfferComparisonTable';
import { useOfferComparison } from '../../../hooks/useOfferComparison';
import { analytics } from '../../../lib/analytics';
import type { Metadata } from 'next';

// ── PHASE COS-14: Dynamic SEO metadata ──────────────────────────

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const apiBase = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
    const res = await fetch(`${apiBase}/v1/products/${params.id}`, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return { title: 'Product Not Found' };
    const p = await res.json();
    const desc = p.description
      ? (p.description.length > 155 ? p.description.slice(0, 152) + '…' : p.description)
      : 'B2B marketplace product listing';
    const imgUrl = Array.isArray(p.media) && p.media.length > 0
      ? (p.media[0].displayUrl || p.media[0].thumbSrc || '')
      : '';
    return {
      title: `${p.title} | Smart Commerce Platform`,
      description: desc,
      openGraph: {
        title: p.title,
        description: desc,
        type: 'website',
        ...(imgUrl ? { images: [{ url: imgUrl, alt: p.title }] } : {}),
      },
    };
  } catch {
    return { title: 'Product | Smart Commerce Platform' };
  }
}

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
 * Variant-scoped rows (variantId set) carry a label so buyers can tell which
 * variant a photo shows.
 */
function galleryImages(product: ProductDetail): { src: string; alt: string; variantLabel?: string }[] {
  const media = product.media ?? [];
  const variantById = new Map((product.variants ?? []).map(v => [v.id, v]));
  const out: { src: string; alt: string; variantLabel?: string }[] = [];
  const seen = new Set<string>();
  for (const m of media) {
    if (m.mediaType !== 'IMAGE') continue;
    const src = m.displayUrl ?? m.thumbSrc;
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const v = m.variantId ? variantById.get(m.variantId) : undefined;
    const variantLabel = v ? `Variant: ${v.title || v.sku}` : undefined;
    out.push({
      src,
      alt: variantLabel ? `${variantLabel} — ${m.altText || product.title}` : (m.altText || product.title),
      variantLabel,
    });
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

// ── Amazon-style gallery with mouse-follow zoom, thumbnail hover, counter ──

function ProductGallery({ images, title }: { images: { src: string; alt: string; variantLabel?: string }[]; title: string }) {
  const [selected, setSelected] = useState(0);
  const [hoveredThumb, setHoveredThumb] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const mainRef = useRef<HTMLDivElement>(null);

  const visible = images.filter(i => !failed.has(i.src));
  const current = visible[selected] ?? visible[0];
  const total = visible.length;

  // Clamp selection when images fail to load
  useEffect(() => {
    if (selected >= total) setSelected(Math.max(0, total - 1));
  }, [total, selected]);

  const goTo = useCallback((idx: number) => {
    setSelected(Math.max(0, Math.min(total - 1, idx)));
  }, [total]);

  // Keyboard navigation: left/right arrows when gallery is focused
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { goTo(selected - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { goTo(selected + 1); e.preventDefault(); }
  }, [selected, goTo]);

  // Mouse-follow zoom: track cursor position relative to the main image container
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({ x, y });
  }, []);

  if (!current) {
    return (
      <div className="pd-gallery-placeholder">
        <span style={{ fontSize: 72, opacity: 0.2 }} aria-label="No image">📦</span>
      </div>
    );
  }

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} role="region" aria-label="Product image gallery" style={{ outline: 'none' }}>
      <div className="pd-gallery-layout">
      {/* Main image — mouse-follow zoom (Amazon-style magnification) */}
      <div
        ref={mainRef}
        className="pd-gallery-main"
        onMouseEnter={() => setZoom(true)}
        onMouseLeave={() => setZoom(false)}
        onMouseMove={handleMouseMove}
      >
        <img
          key={current.src}
          src={current.src}
          alt={current.alt || title}
          loading="eager"
          onError={() => setFailed(prev => new Set(prev).add(current.src))}
          draggable={false}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            transform: zoom ? 'scale(1.8)' : 'scale(1)',
            transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
            transition: zoom ? 'none' : `transform ${transitions.slow}`,
            userSelect: 'none',
          }}
        />
        {/* Image counter badge */}
        {total > 1 && (
          <span style={{
            position: 'absolute', bottom: 12, right: 12, padding: '3px 10px',
            borderRadius: 10, fontSize: 11, fontWeight: 600,
            background: 'rgba(0,0,0,0.6)', color: '#fff',
          }}>{selected + 1} / {total}</span>
        )}
        {current.variantLabel && (
          <span style={{
            position: 'absolute', bottom: 12, left: 12, padding: '3px 10px',
            borderRadius: 10, fontSize: 11, fontWeight: 600,
            background: 'rgba(15,51,64,0.85)', color: '#fff',
          }}>{current.variantLabel}</span>
        )}
        {total > 1 && (
          <>
            <button
              onClick={() => goTo(selected - 1)}
              disabled={selected === 0}
              aria-label="Previous image"
              style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%', border: `1px solid ${colors.border}`,
                background: 'rgba(255,255,255,0.92)', fontSize: 18, cursor: 'pointer',
                opacity: selected === 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: shadows.sm,
              }}
            >‹</button>
            <button
              onClick={() => goTo(selected + 1)}
              disabled={selected === total - 1}
              aria-label="Next image"
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%', border: `1px solid ${colors.border}`,
                background: 'rgba(255,255,255,0.92)', fontSize: 18, cursor: 'pointer',
                opacity: selected === total - 1 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: shadows.sm,
              }}
            >›</button>
          </>
        )}
      </div>

      {/* Thumbnail strip — hover previews + click to select */}
      {total > 1 && (
        <div className="pd-gallery-thumbs">
          {visible.map((img, i) => {
            const isSelected = i === selected;
            const isHovered = i === hoveredThumb;
            return (
              <button
                key={img.src}
                onClick={() => goTo(i)}
                onMouseEnter={() => setHoveredThumb(i)}
                onMouseLeave={() => setHoveredThumb(null)}
                aria-label={`View image ${i + 1} of ${total}`}
                aria-current={isSelected}
                style={{
                  width: 60, height: 60, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
                  border: isSelected ? `2px solid ${colors.brand[700]}` : isHovered ? `2px solid ${colors.brand[500]}` : `1px solid ${colors.border}`,
                  background: colors.surface, cursor: 'pointer', padding: 2,
                  transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
                  boxShadow: isSelected ? `0 0 0 1px ${colors.brand[700]}` : isHovered ? `0 0 0 1px ${colors.brand[500]}` : 'none',
                }}
              >
                <img
                  src={img.src}
                  alt=""
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    opacity: isSelected ? 1 : isHovered ? 0.9 : 0.75,
                    transition: `opacity ${transitions.fast}`,
                  }}
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}
      </div>
      {images.length > 0 && visible.length === 0 && (
        <div style={{ ...typeScale.bodySm, color: colors.warn, marginTop: 8 }}>Product images are temporarily unavailable.</div>
      )}
    </div>
  );
}

// ── Stock badge per variant ──────────────────────────────────────

function StockBadge({ stock }: { stock?: { totalAvailable: number } | null }) {
  const available = stock?.totalAvailable ?? 0;
  if (available > 10) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: colors.ok }}>In Stock</span>;
  }
  if (available > 0) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: colors.err }}>Only {available} left</span>;
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted }}>Out of stock</span>;
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
  const [productOffers, setProductOffers] = useState<Offer[]>([]);
  // PHASE 22: `offerId -> ranked row` map so the "Other Sellers" list can badge
  // the top-ranked seller and hint units sold without re-sorting. Kept separate
  // from `productOffers` so a failure of the analytics endpoint degrades to the
  // pre-Phase-22 rendering rather than hiding the whole section.
  const [rankedByOffer, setRankedByOffer] = useState<Map<string, RankedProductOffer>>(new Map());
  // PHASE 7: dynamic variant selector — the VariantSelector reports whether
  // the product's type has VARIANT-scope dimensions; if not, we fall back to
  // the flat variant list.
  const [hasVariantDims, setHasVariantDims] = useState<boolean | null>(null);
  const handleHasDimensions = useCallback((has: boolean) => setHasVariantDims(has), []);

  // PHASE 8: offer comparison table — merges base offers + ranked analytics
  // into a sortable comparison view replacing the old flat "Other Sellers" list.
  const rankedArray = useMemo(() => Array.from(rankedByOffer.values()), [rankedByOffer]);
  const {
    rows: offerRows, currentSellerRow, competingCount,
    sortKey: offerSortKey, sortDir: offerSortDir, toggleSort: toggleOfferSort,
  } = useOfferComparison(productOffers, rankedArray, product?.storeId ?? null);

  // PHASE COS-14: fire product_viewed + offer_viewed analytics
  useEffect(() => {
    if (product) {
      analytics.productViewed(product.id, product.storeId, product.title);
    }
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (productOffers.length > 0 && product) {
      analytics.offerViewed(product.id, productOffers.length);
    }
  }, [productOffers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Variants, pricing, media and stock arrive with the product in one request.
    fetchProduct(productId)
      .then(p => {
        setProduct(p);
        setQty(p.moq || 1);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
    fetchProductOffers(productId).then(setProductOffers).catch(() => {});
    fetchProductOffersRanked(productId)
      .then(list => setRankedByOffer(new Map(list.map(r => [r.offerId, r]))))
      .catch(() => { /* ranked overlay is best-effort */ });
  }, [productId]);

  const images = useMemo(() => (product ? galleryImages(product) : []), [product]);

  const handleAdd = useCallback(
    async (variantId: string, storeId: string, offerId?: string) => {
      setAddError(null);
      try {
        await addToCart({ variantId, storeId, quantity: qty, ...(offerId ? { offerId } : {}) });
        // PHASE 13: distinguish per-offer added state so two "Added ✓" badges
        // don't light up simultaneously when the same variant is offered by
        // multiple sellers.
        setAddedId(offerId ?? variantId);
        setTimeout(() => setAddedId(null), 2000);
        // PHASE COS-14: track offer selection
        if (offerId) analytics.offerSelected(offerId, productId, storeId);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Could not add this item to your cart');
      }
    },
    [qty, productId],
  );

  const variants = useMemo(
    () => product?.variants ?? [],
    [product],
  );

  // PHASE 8: offer add-to-cart resolves the variant for product-scoped offers.
  // This hook must execute on every render, before any early return.
  const handleOfferAddToCart = useCallback(
    (offerId: string, variantId: string | null, storeId: string) => {
      const targetVariantId = variantId ?? variants.find(v => v.isActive)?.id;
      if (targetVariantId) {
        void handleAdd(targetVariantId, storeId, offerId);
      }
    },
    [variants, handleAdd],
  );

  if (loading) return <LoadingSpinner />;
  if (!product) return <EmptyState title="Product not found" />;

  const activeVariants = variants.filter(v => v.isActive);
  const inactiveVariants = variants.filter(v => !v.isActive);
  const store = product.store ?? null;
  const cheapestPrice = activeVariants
    .map(v => v.pricing?.unitPriceMinor)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b)[0];
  const baseCurrency = activeVariants[0]?.pricing?.currency ?? store?.currency ?? 'SAR';

  // PHASE COS-14: JSON-LD structured data for search engines
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description || product.title,
    sku: activeVariants[0]?.sku || product.id,
    ...(store ? { seller: { '@type': 'Organization', name: store.name } } : {}),
    ...(cheapestPrice !== undefined ? {
      offers: {
        '@type': 'Offer',
        price: (cheapestPrice / 100).toFixed(2),
        priceCurrency: baseCurrency,
        availability: product.isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: typeof window !== 'undefined' ? `${window.location.origin}/products/${product.id}` : undefined,
      },
    } : {}),
  };

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <style>{`
      .pd-gallery-placeholder {
        background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: ${radii.lg}; height: 460px;
        display: flex; align-items: center; justify-content: center;
      }
      .pd-gallery-main {
        background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: ${radii.lg}; height: 460px;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
        position: relative; cursor: zoom-in;
      }
      .pd-gallery-layout { display: block; }
      .pd-gallery-thumbs {
        display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; padding-bottom: 4px;
      }
      @media (max-width: 768px) {
        .pd-detail-grid { grid-template-columns: 1fr !important; }
        .pd-gallery-main { height: 320px; }
        .pd-gallery-placeholder { height: 320px; }
        /* Amazon mobile pattern: vertical scrolling thumbnail rail beside the main image */
        .pd-gallery-layout { display: flex; flex-direction: row-reverse; align-items: flex-start; gap: 8px; }
        .pd-gallery-layout .pd-gallery-main { flex: 1; min-width: 0; }
        .pd-gallery-thumbs {
          flex-direction: column; flex-wrap: nowrap; gap: 6px; margin-top: 0;
          overflow-x: visible; overflow-y: auto; max-height: 320px; width: 62px; flex-shrink: 0; padding-right: 2px;
        }
        /* PHASE 8: offer comparison — swap table for cards on mobile */
        .oct-desktop { display: none !important; }
        .oct-mobile { display: block !important; }
      }
    `}</style>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Banner */}
      <PageHeader
        title={product.title}
        subtitle={`${product.isAvailable ? 'Available' : 'Unavailable'} · MOQ: ${product.moq}`}
        breadcrumbs={
          <BreadcrumbDark items={[
            { label: 'Home', href: '/' },
            { label: 'Search', href: '/search' },
            { label: product.title },
          ]} />
        }
      />
      <div style={{ padding: '20px 24px 48px' }}>
      <div className="pd-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: 32, alignItems: 'start' }}>
        {/* Gallery */}
        <ProductGallery images={images} title={product.title} />

        {/* Details */}
        <div>
          {product.titleAr && <div style={{ ...typeScale.h2, color: colors.muted, marginBottom: 8, direction: 'rtl' }}>{product.titleAr}</div>}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ padding: '2px 10px', borderRadius: radii.sm, ...typeScale.caption, fontWeight: 600, background: product.isAvailable ? colors.okBg : colors.errBg, color: product.isAvailable ? colors.ok : colors.err }}>
              {product.isAvailable ? 'Available' : 'Unavailable'}
            </span>
            <span style={{ padding: '2px 10px', borderRadius: radii.sm, ...typeScale.caption, fontWeight: 600, background: colors.bgSubtle, color: colors.muted }}>
              MOQ: {product.moq}
            </span>
            <CompareButton productId={productId} />
          </div>

          {/* Amazon-style "from" price headline */}
          {cheapestPrice !== undefined && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: colors.muted }}>Price from </span>
              <span style={{ fontSize: 28, fontWeight: 700, color: colors.brand[700] }}>
                {formatMinor(cheapestPrice, baseCurrency).replace(/ [A-Z]+$/, '')}
              </span>
              <span style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>{baseCurrency}</span>
            </div>
          )}

          {/* Real stock status from warehouse inventory */}
          {product.isAvailable && (
            <div style={{ ...typeScale.bodySm, color: colors.muted, marginBottom: 16, padding: '8px 12px', background: colors.bgSubtle, border: `1px solid ${colors.border}`, borderRadius: radii.sm }}>
              {(() => {
                const totalStock = activeVariants.reduce((sum, v) => sum + ((v.stock?.totalAvailable ?? 0)), 0);
                const hasAnyStock = activeVariants.some(v => (v.stock?.totalAvailable ?? 0) > 0);
                if (hasAnyStock) {
                  return <><strong style={{ color: colors.ok }}>In Stock:</strong> {totalStock} units available across {activeVariants.filter(v => (v.stock?.totalAvailable ?? 0) > 0).length} variant(s). Large orders may require lead time.</>;
                }
                return <><strong>Stock:</strong> Available from supplier warehouse. Contact supplier for exact stock levels and lead times on large orders.</>;
              })()}
            </div>
          )}
          {product.description && <p style={{ ...typeScale.body, color: colors.muted, lineHeight: 1.6, marginBottom: 24 }}>{product.description}</p>}

          {/* Specifications (PHASE 5e: structured attribute values) */}
          {product.attributeValues && product.attributeValues.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ ...typeScale.h2, color: colors.brand[700], marginBottom: 8 }}>Specifications</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  {product.attributeValues.map(av => (
                    <tr key={av.code} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '6px 12px', fontWeight: 500, color: colors.muted, width: '40%' }}>{av.label}</td>
                      <td style={{ padding: '6px 12px' }}>{av.value != null ? String(av.value) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Seller */}
          <div style={{ marginBottom: 24, padding: '12px 14px', background: colors.bgSubtle, border: `1px solid ${colors.border}`, borderRadius: radii.md }}>
            {store ? (
              <>
                <div style={{ ...typeScale.caption, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sold by</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <Link href={`/stores/${store.slug || store.id}`} style={{ ...typeScale.body, fontWeight: 600, color: colors.brand[700], textDecoration: 'none' }}>
                    {store.name}
                  </Link>
                  <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 700, background: store.verificationStatus === 'VERIFIED' ? colors.okBg : colors.warnBg, color: store.verificationStatus === 'VERIFIED' ? colors.ok : colors.warn }}>
                    {store.verificationStatus}
                  </span>
                  {/* A suspended store still resolves, but the buyer must see why
                      an order may not proceed. */}
                  {store.status !== 'ACTIVE' && (
                    <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 10, fontWeight: 700, background: colors.errBg, color: colors.err }}>
                      Store {store.status}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ ...typeScale.bodySm, color: colors.warn }}>Seller information is unavailable for this listing.</div>
            )}
          </div>

          {/* Variants — PHASE 7: dynamic selector when product type has dimensions */}
          <h3 style={{ ...typeScale.h2, color: colors.brand[700], marginBottom: 12 }}>
            Variants <span style={{ ...typeScale.bodySm, fontWeight: 400, color: colors.muted }}>({activeVariants.length})</span>
          </h3>

          {product.productTypeId && (
            <VariantSelector
              productId={productId}
              moq={product.moq}
              currency={baseCurrency}
              onAddToCart={(variantId, q) => handleAdd(variantId, product.storeId)}
              addedFeedback={addedId !== null}
              onHasDimensions={handleHasDimensions}
            />
          )}

          {/* Flat variant list — shown when no product type or type has no variant dimensions */}
          {(!product.productTypeId || hasVariantDims === false) && (
            <>
              {activeVariants.length === 0 ? (
                <p style={{ color: colors.disabled, ...typeScale.bodySm }}>No variants available</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeVariants.map(v => {
                    const currency = v.pricing?.currency ?? store?.currency ?? 'SAR';
                    const unit = unitPriceFor(v, qty);
                    const tiers = v.pricing?.tiers ?? [];
                    const outOfStock = (v.stock?.totalAvailable ?? 0) <= 0;
                    return (
                      <div key={v.id} style={{ padding: '12px 16px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md, opacity: outOfStock ? 0.75 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ ...typeScale.body, fontWeight: 500, color: colors.brand[700] }}>
                              {v.title || v.sku} <span style={{ marginLeft: 8 }}><StockBadge stock={v.stock} /></span>
                            </div>
                            <div style={{ ...typeScale.bodySm, color: colors.muted, fontFamily: 'monospace' }}>
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
                              style={{ width: 60, padding: '4px 8px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 13, textAlign: 'center' }}
                            />
                            <button
                              onClick={() => handleAdd(v.id, product.storeId)}
                              disabled={outOfStock}
                              style={{
                                padding: '6px 16px', ...typeScale.button, color: '#fff',
                                background: addedId === v.id ? colors.ok : outOfStock ? colors.disabled : colors.amber,
                                border: '1px solid ' + (addedId === v.id ? colors.ok : outOfStock ? colors.disabled : '#a88734'),
                                borderRadius: radii.sm, cursor: outOfStock ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {outOfStock ? 'Out of Stock' : addedId === v.id ? '✓ Added' : 'Add to Cart'}
                            </button>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          {unit !== undefined ? (
                            <>
                              <span style={{ fontSize: 15, fontWeight: 700, color: colors.brand[700] }}>
                                {formatMinor(unit, currency)} <span style={{ fontSize: 11, fontWeight: 400, color: colors.muted }}>/ {v.unit || 'unit'}</span>
                              </span>
                              <span style={{ ...typeScale.caption, color: colors.muted }}>at qty {qty}</span>
                            </>
                          ) : (
                            <span style={{ ...typeScale.bodySm, color: colors.warn }}>No active price for this item — the cart will reject it until the seller publishes one</span>
                          )}
                          {tiers.length > 1 && (
                            <span style={{ ...typeScale.caption, color: colors.muted }}>
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
                <div style={{ marginTop: 12, ...typeScale.bodySm, color: colors.disabled }}>
                  {inactiveVariants.length} variant(s) currently inactive.
                </div>
              )}
            </>
          )}

          {addError && (
            <div role="alert" style={{ marginTop: 16, padding: 14, background: colors.errBg, border: `1px solid ${colors.err}`, borderRadius: radii.md }}>
              <span style={{ color: colors.err, fontSize: typeScale.body.fontSize, fontWeight: 600, lineHeight: typeScale.body.lineHeight }}>{addError}</span>
            </div>
          )}

          {/* PHASE 8: Offer comparison table — replaces flat "Other Sellers" list */}
          <OfferComparisonTable
            rows={offerRows}
            competingCount={competingCount}
            sortKey={offerSortKey}
            sortDir={offerSortDir}
            toggleSort={toggleOfferSort}
            onAddToCart={handleOfferAddToCart}
            addedKey={addedId}
            currentSellerRow={currentSellerRow}
          />

          <div style={{ marginTop: 24 }}>
            <Link href="/cart" style={{ display: 'inline-block', padding: '10px 24px', background: colors.brand[700], color: '#fff', borderRadius: radii.md, textDecoration: 'none', ...typeScale.button }}>
              Go to Cart
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
    </>
  );
}

/* ── PHASE COS-13: Add to Compare button ────────────────────── */
function CompareButton({ productId }: { productId: string }) {
  const { ids, add, remove, isFull } = useCompareList();
  const inList = ids.includes(productId);

  return (
    <button
      onClick={() => inList ? remove(productId) : add(productId)}
      disabled={!inList && isFull}
      style={{
        padding: '2px 10px', borderRadius: radii.sm, ...typeScale.caption, fontWeight: 600,
        background: inList ? colors.brand[700] : colors.bgSubtle,
        color: inList ? '#fff' : colors.muted,
        border: `1px solid ${inList ? colors.brand[700] : colors.border}`,
        cursor: !inList && isFull ? 'not-allowed' : 'pointer',
        opacity: !inList && isFull ? 0.5 : 1,
      }}
      title={inList ? 'Remove from comparison' : isFull ? 'Comparison list full (max 4)' : 'Add to comparison'}
    >
      {inList ? '✓ Comparing' : isFull ? 'Compare Full' : '+ Compare'}
    </button>
  );
}
