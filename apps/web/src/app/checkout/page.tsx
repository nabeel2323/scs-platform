'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { checkout, fetchCart, Cart, CartItem } from '../../lib/buyer-api';
import { formatMinor, ErrorBanner, LoadingSpinner } from '../../components/Shared';
import {
  PageHeader, Card, Button, TextInput, Select, EmptyState,
  colors, typeScale, radii,
} from '@scs/ui-kit';

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
      <PageHeader
        title="Checkout"
        subtitle="Complete your order"
      />
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {cartLoading ? (
        <LoadingSpinner />
      ) : cartItems.length === 0 ? (
        <EmptyState
          title="Your cart is empty"
          description="Add items to your cart before placing an order."
          action={<Link href="/cart" style={{ display: 'inline-block', padding: '8px 20px', background: colors.brand[700], color: '#fff', borderRadius: radii.sm, textDecoration: 'none', ...typeScale.button }}>Back to Cart</Link>}
        />
      ) : (
        <>
          {/* Order summary */}
          <Card style={{ marginBottom: 20 }}>
            <h2 style={{ ...typeScale.h3, color: colors.brand[700], margin: '0 0 12px' }}>
              {cartItems.length} item{cartItems.length === 1 ? '' : 's'} from {grouped.size} supplier{grouped.size === 1 ? '' : 's'}
            </h2>
            {Array.from(grouped.entries()).map(([storeId, items], idx) => {
              const groupTotal = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
              return (
                <div key={storeId} style={{ border: `1px solid ${colors.borderLight}`, borderRadius: radii.sm, padding: '10px 12px', marginBottom: 10 }}>
                  <div style={{ ...typeScale.body, fontWeight: 600, color: colors.brand[700], marginBottom: 6 }}>
                    {items[0]?.storeName || `Supplier ${idx + 1} — ${storeId.slice(0, 8)}`}
                  </div>
                  {items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, ...typeScale.body, color: colors.muted, padding: '2px 0' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {item.title || item.sku || 'Item'} × {item.quantity}
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>{formatMinor(item.lineTotalMinor, item.currency)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...typeScale.body, fontWeight: 600, color: colors.brand[700], marginTop: 6, borderTop: `1px solid ${colors.borderLight}`, paddingTop: 6 }}>
                    <span>Supplier subtotal</span>
                    <span>{formatMinor(groupTotal, items[0]?.currency)}</span>
                  </div>
                </div>
              );
            })}
            {cart?.promoCode && (
              <div style={{ ...typeScale.bodySm, color: colors.ok, margin: '4px 0 8px' }}>Promo applied: {cart.promoCode}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: colors.brand[700] }}>
              <span>Cart total</span>
              <span>{formatMinor(cart?.totalMinor || 0, cartCurrency)}</span>
            </div>
            <p style={{ ...typeScale.bodySm, color: colors.muted, margin: '8px 0 0' }}>
              Each supplier confirms their own order, so delivery fees and VAT are added per supplier on confirmation — the final
              amount can be higher than the cart total.
            </p>
            <div style={{ marginTop: 12, padding: '10px 12px', background: colors.bgSubtle, border: `1px solid ${colors.border}`, borderRadius: radii.sm, ...typeScale.bodySm, color: colors.brand[700] }}>
              <strong>Payment:</strong> invoiced on delivery (pilot) — no online payment is taken at this step.
            </div>
          </Card>

          <Card>
            <TextInput
              label="Delivery Address *"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Street address"
              style={{ marginBottom: 16 }}
            />
            <TextInput
              label="City"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="City"
              style={{ marginBottom: 16 }}
            />
            <Select
              label="Fulfillment Method"
              value={fulfillment}
              onChange={e => setFulfillment(e.target.value)}
              options={[
                { value: 'PLATFORM_DELIVERY', label: 'Platform Delivery' },
                { value: 'MERCHANT_DELIVERY', label: 'Merchant Delivery' },
                { value: 'PICKUP', label: 'Pickup' },
              ]}
              style={{ marginBottom: 16 }}
            />
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', ...typeScale.label, color: colors.brand[700], marginBottom: 6 }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." rows={3} style={{
                width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: radii.sm,
                fontSize: typeScale.body.fontSize, fontFamily: 'inherit', boxSizing: 'border-box' as const, resize: 'vertical',
              }} />
            </div>

            <Button size="lg" onClick={handleSubmit} disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Placing Order...' : `Place Order · ${formatMinor(cart?.totalMinor || 0, cartCurrency)}`}
            </Button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link href="/cart" style={{ ...typeScale.bodySm, color: colors.muted, textDecoration: 'none' }}>← Edit cart</Link>
            </div>
          </Card>
        </>
      )}
      </div>
    </div>
  );
}
