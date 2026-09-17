'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { checkout, fetchCart, Cart, CartItem } from '../../lib/buyer-api';
import { formatMinor, ErrorBanner, LoadingSpinner, EmptyState } from '../../components/Shared';

export default function CheckoutPage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [fulfillment, setFulfillment] = useState('PLATFORM_DELIVERY');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);

  // A4-3: the buyer used to submit this form without ever seeing what was being
  // ordered — no items, no per-supplier totals, no currency. Load the same cart
  // the order will be created from and show it before the point of no return.
  useEffect(() => {
    fetchCart()
      .then(setCart)
      .catch(() => setCart(null))
      .finally(() => setCartLoading(false));
  }, []);

  const cartItems: CartItem[] = cart?.items || [];
  const grouped = new Map<string, CartItem[]>();
  for (const item of cartItems) {
    const list = grouped.get(item.storeId);
    if (list) list.push(item);
    else grouped.set(item.storeId, [item]);
  }
  // Label amounts with the supplier currency only when the whole cart agrees
  // (per-order currency snapshot is tracked separately as A2-4).
  const cartCurrencies = new Set(cartItems.map((i) => i.currency).filter(Boolean));
  const cartCurrency = cartCurrencies.size === 1 ? Array.from(cartCurrencies)[0] : undefined;

  const handleSubmit = async () => {
    if (!address.trim()) { setError('Delivery address is required'); return; }
    if (cartItems.length === 0) { setError('Your cart is empty'); return; }
    setSubmitting(true);
    setError('');
    try {
      const idempotencyKey = typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID 
        ? globalThis.crypto.randomUUID() 
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
      const result = await checkout({
        deliveryAddress: { street: address, city },
        notes: notes || undefined,
        idempotencyKey,
        fulfillmentMethod: fulfillment,
      });
      // Checkout returns the MASTER order; /orders/:id renders a per-supplier
      // sub-order. Deep-link the sub-order when the cart had a single supplier,
      // otherwise fall back to the list (which now shows every new sub-order).
      const subOrders = result?.subOrders || [];
      const onlySubOrder = subOrders.length === 1 ? subOrders[0] : undefined;
      router.push(onlySubOrder ? `/orders/${onlySubOrder.id}` : '/orders');
    } catch (err: any) {
      setError(err.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Checkout</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Complete your order</p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {cartLoading ? (
        <LoadingSpinner />
      ) : cartItems.length === 0 ? (
        <EmptyState
          title="Your cart is empty"
          description="Add items to your cart before placing an order."
          action={<Link href="/cart" style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Back to Cart</Link>}
        />
      ) : (
        <>
          {/* Order summary */}
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', margin: '0 0 12px' }}>
              {cartItems.length} item{cartItems.length === 1 ? '' : 's'} from {grouped.size} supplier{grouped.size === 1 ? '' : 's'}
            </h2>
            {Array.from(grouped.entries()).map(([storeId, items], idx) => {
              const groupTotal = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
              return (
                <div key={storeId} style={{ border: '1px solid #edf2f7', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 6 }}>
                    {items[0]?.storeName || `Supplier ${idx + 1} — ${storeId.slice(0, 8)}`}
                  </div>
                  {items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#5b6b74', padding: '2px 0' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {item.title || item.sku || 'Item'} × {item.quantity}
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>{formatMinor(item.lineTotalMinor, item.currency)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#0f3340', marginTop: 6, borderTop: '1px solid #edf2f7', paddingTop: 6 }}>
                    <span>Supplier subtotal</span>
                    <span>{formatMinor(groupTotal, items[0]?.currency)}</span>
                  </div>
                </div>
              );
            })}
            {cart?.promoCode && (
              <div style={{ fontSize: 12, color: '#065f46', margin: '4px 0 8px' }}>Promo applied: {cart.promoCode}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#0f3340' }}>
              <span>Cart total</span>
              <span>{formatMinor(cart?.totalMinor || 0, cartCurrency)}</span>
            </div>
            <p style={{ fontSize: 12, color: '#5b6b74', margin: '8px 0 0' }}>
              Each supplier confirms their own order, so delivery fees and VAT are added per supplier on confirmation — the final
              amount can be higher than the cart total.
            </p>
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 8, fontSize: 12, color: '#0f3340' }}>
              <strong>Payment:</strong> invoiced on delivery (pilot) — no online payment is taken at this step.
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Delivery Address *</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Fulfillment Method</label>
              <select value={fulfillment} onChange={e => setFulfillment(e.target.value)} style={inputStyle}>
                <option value="PLATFORM_DELIVERY">Platform Delivery</option>
                <option value="MERCHANT_DELIVERY">Merchant Delivery</option>
                <option value="PICKUP">Pickup</option>
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <button onClick={handleSubmit} disabled={submitting} style={{
              width: '100%', padding: '12px 0', fontSize: 16, fontWeight: 600,
              background: submitting ? '#5b6b74' : '#0f3340', color: '#fff',
              border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer',
            }}>
              {submitting ? 'Placing Order...' : `Place Order · ${formatMinor(cart?.totalMinor || 0, cartCurrency)}`}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link href="/cart" style={{ fontSize: 13, color: '#5b6b74', textDecoration: 'none' }}>← Edit cart</Link>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const };
