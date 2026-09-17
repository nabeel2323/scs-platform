'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchCart, updateCartItem, removeCartItem, clearCart, applyPromoCode, Cart, CartItem } from '../../lib/buyer-api';
import { formatMinor, EmptyState, LoadingSpinner, ErrorBanner } from '../../components/Shared';

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);

  const loadCart = async () => {
    try {
      const c = await fetchCart();
      setCart(c);
    } catch {
      setCart(null);
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

  // A5-3: cart lines now carry the supplier currency. §9 policy: show per-supplier
  // subtotals in their own currency. When every supplier shares one currency, a
  // single grand total is honest; when mixed, show each supplier's subtotal
  // separately so the buyer never sees a total they cannot actually pay.
  const cartCurrencies = new Set((cart?.items || []).map((i) => i.currency).filter(Boolean));
  const cartCurrency = cartCurrencies.size === 1 ? Array.from(cartCurrencies)[0] : undefined;
  const isMixedCurrency = cartCurrencies.size > 1;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Cart</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          {cart?.items?.length ? `${cart.items.length} items in your cart` : 'Review your items before checkout'}
        </p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {isEmpty ? (
        <EmptyState
          title="Your cart is empty"
          description="Browse products and add items to your cart"
          action={<Link href="/search" style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Browse Products</Link>}
        />
      ) : (
        <>
          {/* Grouped by supplier */}
          {Array.from(grouped.entries()).map(([storeId, items], idx) => (
            <div key={storeId} style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: '#f7f9fa', borderBottom: '1px solid #d9e2e6', fontSize: 13, fontWeight: 600, color: '#0f3340' }}>
                {items[0]?.storeSlug ? (
                  <Link href={`/stores/${items[0].storeSlug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    Supplier {idx + 1} — {items[0].storeName || items[0].storeSlug}
                  </Link>
                ) : (
                  <>Supplier {idx + 1} — {items[0]?.storeName || storeId.slice(0, 8)}</>
                )}
              </div>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f0f4f6' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f3340' }}>{item.title || item.sku || 'Item'}</div>
                    <div style={{ fontSize: 12, color: '#5b6b74', marginTop: 2 }}>
                      {formatMinor(item.priceMinor, item.currency)} × {item.quantity}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => handleUpdateQty(item.id, item.quantity - 1)} style={qtyBtnStyle}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                    <button onClick={() => handleUpdateQty(item.id, item.quantity + 1)} style={qtyBtnStyle}>+</button>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', minWidth: 80, textAlign: 'right' }}>
                      {formatMinor(item.lineTotalMinor, item.currency)}
                    </span>
                    <button onClick={() => handleRemove(item.id)} style={removeBtnStyle}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Promo code */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input type="text" placeholder="Promo code" value={promoCode} onChange={e => setPromoCode(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13 }} />
            <button onClick={handleApplyPromo} disabled={applyingPromo} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {applyingPromo ? 'Applying...' : 'Apply'}
            </button>
          </div>
          {cart?.promoCode && <div style={{ fontSize: 12, color: '#065f46', marginBottom: 16 }}>Promo applied: {cart.promoCode}</div>}

          {/* §9 policy: per-supplier totals. When every supplier shares one
               currency, show a single grand total. When mixed, show each
               supplier's subtotal in its own currency — the buyer pays each
               supplier separately, so a single combined total would be an
               amount nobody can actually pay. */}
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            {isMixedCurrency ? (
              <>
                {Array.from(grouped.entries()).map(([storeId, items]) => {
                  const storeTotal = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
                  const storeCurrency = items.find(i => i.currency)?.currency;
                  return (
                    <div key={storeId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#0f3340', padding: '6px 0' }}>
                      <span>{items[0]?.storeName || `Supplier ${storeId.slice(0, 8)}`}</span>
                      <span>{formatMinor(storeTotal, storeCurrency)}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid #d9e2e6', marginTop: 8, paddingTop: 8, fontSize: 12, color: '#5b6b74' }}>
                  Separate invoices per supplier — totals charged in each supplier's currency.
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#0f3340' }}>
                <span>Total</span>
                <span>{formatMinor(cart?.totalMinor || 0, cartCurrency)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <button onClick={handleClear} style={{ padding: '10px 20px', fontSize: 13, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer' }}>
              Clear Cart
            </button>
            <Link href="/checkout" style={{ padding: '10px 32px', fontSize: 14, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}>
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
  width: 28, height: 28, border: '1px solid #d9e2e6', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 14, padding: '4px 8px',
};
