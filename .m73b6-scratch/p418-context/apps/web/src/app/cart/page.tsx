'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchCart, updateCartItem, removeCartItem, clearCart, applyPromoCode, validateCart, CartValidationReport, Cart, CartItem } from '../../lib/buyer-api';
import { formatMinor, ErrorBanner, LoadingSpinner } from '../../components/Shared';
import {
  PageHeader, Card, Button, EmptyState,
  colors, typeScale, radii, shadows,
} from '@scs/ui-kit';

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);

  const [validationReport, setValidationReport] = useState<CartValidationReport | null>(null);

  const loadCart = async () => {
    try {
      // PHASE 11: Validate offers and re-price stale items
      const report = await validateCart();
      setCart(report.cart as Cart);
      setValidationReport(report);
    } catch {
      // If validation fails, fall back to plain cart fetch
      try {
        const c = await fetchCart();
        setCart(c);
      } catch {
        setCart(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCart(); }, []);

  const handleUpdateQty = async (itemId: string, qty: number) => {
    if (qty < 1) return;
    await updateCartItem(itemId, qty);
    await loadCart();
  };

  const handleRemove = async (itemId: string) => {
    await removeCartItem(itemId);
    await loadCart();
  };

  const handleClear = async () => {
    await clearCart();
    await loadCart();
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setApplyingPromo(true);
    setError('');
    try {
      await applyPromoCode(promoCode.trim());
      await loadCart();
      setPromoCode('');
    } catch (err: any) {
      setError(err.message || 'Invalid promo code');
    } finally {
      setApplyingPromo(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  // Group items by store
  const grouped = new Map<string, CartItem[]>();
  if (cart?.items) {
    for (const item of cart.items) {
      const key = item.storeId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
  }

  const isEmpty = !cart || !cart.items || cart.items.length === 0;

  const cartCurrencies = new Set((cart?.items || []).map((i) => i.currency).filter(Boolean));
  const cartCurrency = cartCurrencies.size === 1 ? Array.from(cartCurrencies)[0] : undefined;
  const isMixedCurrency = cartCurrencies.size > 1;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="Cart"
        subtitle={cart?.items?.length ? `${cart.items.length} items in your cart` : 'Review your items before checkout'}
      />
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {/* PHASE 11: Cart validation warnings */}
      {validationReport && (validationReport.stale.length > 0 || validationReport.repriced.length > 0) && (
        <div style={{ padding: '12px 16px', marginBottom: 16, background: validationReport.stale.length > 0 ? '#fef2f2' : '#fffbeb', border: `1px solid ${validationReport.stale.length > 0 ? '#fecaca' : '#fde68a'}`, borderRadius: radii.sm, ...typeScale.body }}>
          {validationReport.repriced.length > 0 && (
            <p style={{ margin: '0 0 4px', color: '#92400e' }}>
              {validationReport.repriced.length} item(s) were re-priced due to seller changes.
            </p>
          )}
          {validationReport.stale.length > 0 && (
            <p style={{ margin: 0, color: '#991b1b' }}>
              {validationReport.stale.length} item(s) are no longer available for purchase. Please remove them.
            </p>
          )}
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          title="Your cart is empty"
          description="Browse products and add items to your cart"
          action={<Link href="/search" style={{ display: 'inline-block', padding: '8px 20px', background: colors.brand[700], color: '#fff', borderRadius: radii.sm, textDecoration: 'none', ...typeScale.button }}>Browse Products</Link>}
        />
      ) : (
        <>
          {/* Grouped by supplier */}
          {Array.from(grouped.entries()).map(([storeId, items], idx) => (
            <Card key={storeId} style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}`, ...typeScale.body, fontWeight: 600, color: colors.brand[700] }}>
                {items[0]?.storeSlug ? (
                  <Link href={`/stores/${items[0].storeSlug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    Supplier {idx + 1} — {items[0].storeName || items[0].storeSlug}
                  </Link>
                ) : (
                  <>Supplier {idx + 1} — {items[0]?.storeName || storeId.slice(0, 8)}</>
                )}
              </div>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${colors.borderLight}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...typeScale.body, fontWeight: 500, color: colors.brand[700] }}>{item.title || item.sku || 'Item'}</div>
                    <div style={{ ...typeScale.bodySm, color: colors.muted, marginTop: 2 }}>
                      {formatMinor(item.priceMinor, item.currency)} × {item.quantity}
                    </div>
                    {/* PHASE 14: seller + offer attribution per line */}
                    {(item.storeName || item.offer) && (
                      <div style={{ ...typeScale.caption, color: colors.muted, marginTop: 4 }}>
                        {item.storeName && <>Sold by <strong>{item.storeName}</strong></>}
                        {item.offer && (
                          <>
                            {item.storeName ? ' · ' : ''}
                            Offer {item.offer.status === 'ACTIVE' ? 'active' : item.offer.status.toLowerCase()}
                            {item.offer.leadTimeDays != null && ` · Lead ${item.offer.leadTimeDays}d`}
                            {item.offer.moq > 1 && ` · MOQ ${item.offer.moq}`}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => handleUpdateQty(item.id, item.quantity - 1)} style={qtyBtnStyle}>−</button>
                    <span style={{ ...typeScale.body, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                    <button onClick={() => handleUpdateQty(item.id, item.quantity + 1)} style={qtyBtnStyle}>+</button>
                    <span style={{ ...typeScale.body, fontWeight: 600, color: colors.brand[700], minWidth: 80, textAlign: 'right' }}>
                      {formatMinor(item.lineTotalMinor, item.currency)}
                    </span>
                    <button onClick={() => handleRemove(item.id)} style={removeBtnStyle}>✕</button>
                  </div>
                </div>
              ))}
            </Card>
          ))}

          {/* Promo code */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input type="text" placeholder="Promo code" value={promoCode} onChange={e => setPromoCode(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: typeScale.body.fontSize, fontFamily: 'inherit' }} />
            <Button onClick={handleApplyPromo} disabled={applyingPromo}>
              {applyingPromo ? 'Applying...' : 'Apply'}
            </Button>
          </div>
          {cart?.promoCode && <div style={{ ...typeScale.bodySm, color: colors.ok, marginBottom: 16 }}>Promo applied: {cart.promoCode}</div>}

          {/* Totals */}
          <Card style={{ marginBottom: 16 }}>
            {isMixedCurrency ? (
              <>
                {Array.from(grouped.entries()).map(([storeId, items]) => {
                  const storeTotal = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
                  const storeCurrency = items.find(i => i.currency)?.currency;
                  return (
                    <div key={storeId} style={{ display: 'flex', justifyContent: 'space-between', ...typeScale.body, fontWeight: 600, color: colors.brand[700], padding: '6px 0' }}>
                      <span>{items[0]?.storeName || `Supplier ${storeId.slice(0, 8)}`}</span>
                      <span>{formatMinor(storeTotal, storeCurrency)}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 8, paddingTop: 8, ...typeScale.bodySm, color: colors.muted }}>
                  Separate invoices per supplier — totals charged in each supplier&apos;s currency.
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: colors.brand[700] }}>
                <span>Total</span>
                <span>{formatMinor(cart?.totalMinor || 0, cartCurrency)}</span>
              </div>
            )}
          </Card>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <Button variant="danger" onClick={handleClear}>Clear Cart</Button>
            <Link href="/checkout" style={{ padding: '10px 32px', ...typeScale.body, fontWeight: 600, background: colors.brand[700], color: '#fff', borderRadius: radii.md, textDecoration: 'none', display: 'inline-block' }}>
              Proceed to Checkout
            </Link>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 28, height: 28, border: `1px solid ${colors.border}`, borderRadius: radii.sm, background: colors.surface, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: colors.err, cursor: 'pointer', fontSize: 14, padding: '4px 8px',
};
