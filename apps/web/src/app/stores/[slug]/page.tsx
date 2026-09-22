'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchPublicStore,
  fetchStoreProducts,
  fetchProductVariants,
  addToCart,
  fetchSavedSuppliers,
  saveSupplier,
  removeSavedSupplier,
  fetchTrust,
  Product,
  TrustSnapshot,
} from '../../../lib/buyer-api';
import { formatMinor, LoadingSpinner, EmptyState, ErrorBanner, ProductCardImage } from '../../../components/Shared';

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
  const [trust, setTrust] = useState<TrustSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Loads and failed adds used to end in `catch { /* ignore */ }`, so a broken
  // fetch was indistinguishable from a store that has nothing to sell.
  const [loadError, setLoadError] = useState('');
  const [cartError, setCartError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        // First fetch the store to get its ID
        const storeData = (await fetchPublicStore(slugOrId)) as StoreDetail;
        setStore(storeData);

        // Then fetch products using the store ID. ACTIVE only: this endpoint is
        // shared with the merchant's own catalog screen (which must still see
        // its drafts), so a buyer-facing caller has to ask for the published
        // set — otherwise every DRAFT/REJECTED listing lands on a public page.
        if (storeData?.id) {
          const productsData = await fetchStoreProducts(storeData.id, {
            limit: 50,
            status: 'ACTIVE',
          });
          setProducts(productsData.items as Product[]);
          // Reflect whether this supplier is already saved by the retailer (§21.3).
          try {
            const saved = await fetchSavedSuppliers();
            setIsSaved(saved.some((s) => s.storeId === storeData.id));
          } catch {
            /* not authenticated or no saves yet */
          }
          // A5-5: fetch the store's trust snapshot (rating, review count, badges).
          // The endpoint returns 404 when no reviews exist yet, which fetchTrust
          // maps to null so the UI can render "No reviews yet" instead of crashing.
          try {
            const trustData = await fetchTrust('STORE', storeData.id);
            setTrust(trustData);
          } catch {
            /* trust unavailable — render without rating */
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load this store');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slugOrId]);

  const handleAddToCart = async (product: Product) => {
    setCartError('');
    try {
      // The listing shows products, but the cart references a variant — resolve
      // the product's default (first active) variant before adding.
      const variants = await fetchProductVariants(product.id);
      const variant = variants.find((v) => v.isActive);
      if (!variant) {
        setCartError(`"${product.title}" has no purchasable variant right now.`);
        return;
      }
      // At the MOQ, not 1: the card advertises the minimum and the cart accepts
      // the line either way, so adding 1 only moved the rejection to checkout.
      await addToCart({
        variantId: variant.id,
        storeId: product.storeId,
        quantity: product.moq || 1,
      });
      setAddedItems((prev) => new Set(prev).add(product.id));
      setTimeout(
        () =>
          setAddedItems((prev) => {
            const n = new Set(prev);
            n.delete(product.id);
            return n;
          }),
        2000,
      );
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Could not add that item to the cart');
    }
  };

  const handleToggleSave = async () => {
    if (!store || saving) return;
    setSaving(true);
    try {
      if (isSaved) {
        await removeSavedSupplier(store.id);
        setIsSaved(false);
      } else {
        await saveSupplier(store.id);
        setIsSaved(true);
      }
    } catch {
      /* ignore (e.g. unauthenticated) */
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!store)
    return loadError ? (
      <ErrorBanner message={`This store could not be loaded: ${loadError}`} />
    ) : (
      <EmptyState title="Store not found" />
    );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>{store.displayName}</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          {store.verificationStatus}{store.description ? ` · ${store.description.slice(0, 80)}` : ''}
        </p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>
      {/* Store header */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #d9e2e6',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              flexShrink: 0,
            }}
          >
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt=""
                style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }}
              />
            ) : (
              '🏪'
            )}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>
              {store.displayName}
            </h1>
            {store.description && (
              <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 8 }}>{store.description}</p>
            )}
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: store.verificationStatus === 'VERIFIED' ? '#d1fae5' : '#fef3c7',
                color: store.verificationStatus === 'VERIFIED' ? '#065f46' : '#92400e',
              }}
            >
              {store.verificationStatus}
            </span>
            {/* A5-5: show the store's rating and review count next to the verification badge. */}
            {trust && trust.totalReviews > 0 && (
              <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: '#f59e0b' }}>★</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>
                  {Number(trust.avgRating).toFixed(1)}
                </span>
                <span style={{ fontSize: 12, color: '#5b6b74' }}>
                  ({trust.totalReviews} {trust.totalReviews === 1 ? 'review' : 'reviews'})
                </span>
                {trust.badges.length > 0 && trust.badges[0] && (
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      background: '#dbeafe',
                      color: '#1e40af',
                      marginLeft: 4,
                    }}
                  >
                    {trust.badges[0].replace('_', ' ')}
                  </span>
                )}
              </span>
            )}
            {(!trust || trust.totalReviews === 0) && (
              <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>
                No reviews yet
              </span>
            )}
          </div>
          <button
            onClick={handleToggleSave}
            disabled={saving}
            style={{
              marginLeft: 'auto',
              alignSelf: 'flex-start',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              cursor: saving ? 'default' : 'pointer',
              border: `1px solid ${isSaved ? '#f59e0b' : '#d9e2e6'}`,
              background: isSaved ? '#fffbeb' : '#fff',
              color: isSaved ? '#92400e' : '#0f3340',
            }}
          >
            {isSaved ? '★ Saved' : '☆ Save Supplier'}
          </button>
        </div>
      </div>

      {/* Products */}
      {loadError && <ErrorBanner message={loadError} />}
      {cartError && <ErrorBanner message={cartError} />}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 16 }}>
        Products
      </h2>
      {products.length === 0 ? (
        <EmptyState title="No products yet" description="This store hasn't listed products yet." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              style={{
                background: '#fff',
                border: '1px solid #d9e2e6',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <Link
                href={`/products/${product.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    height: 140,
                    background: '#f0f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ProductCardImage
                    product={product}
                    alt={product.title}
                    imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    placeholderStyle={{ fontSize: 32, opacity: 0.3 }}
                    placeholder="\u{1F4E6}"
                  />
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#0f3340',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {product.title}
                  </div>
                  {/* The same product is priced in search now, so the grid has to
                      agree with it or the two listings contradict each other. */}
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f3340', marginTop: 6 }}>
                    {product.priceFromMinor != null ? (
                      <>
                        {formatMinor(product.priceFromMinor, product.priceCurrency ?? undefined)}
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#5b6b74' }}>
                          {' '}from
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#92400e' }}>
                        Price on request
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74', marginTop: 4 }}>
                    MOQ: {product.moq}
                  </div>
                </div>
              </Link>
              <div style={{ padding: '0 16px 12px' }}>
                <button
                  onClick={() => handleAddToCart(product)}
                  style={{
                    width: '100%',
                    padding: '6px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
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
    </div>
  );
}
