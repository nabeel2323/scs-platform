'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { checkout, fetchCart, Cart, CartItem, fetchShippingEstimate, ShippingEstimate, previewCheckout, CheckoutPreview } from '../../lib/buyer-api';
import { formatMinor, ErrorBanner, LoadingSpinner } from '../../components/Shared';
import {
  PageHeader, Card, Button, TextInput, Select, EmptyState,
  colors, typeScale, radii,
} from '@scs/ui-kit';

interface StoreSelection {
  storeId: string;
  storeName: string;
  fulfillmentMethod: string;
  shippingMethodId: string | null;
  estimate: ShippingEstimate | null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [storeSelections, setStoreSelections] = useState<Map<string, StoreSelection>>(new Map());
  const [estimatesLoading, setEstimatesLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH_ON_DELIVERY');
  const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

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
  const multiStore = grouped.size > 1;
  const storeCount = grouped.size;
  // Load shipping estimates for each store when cart loads or address changes
  useEffect(() => {
    if (cartItems.length === 0 || grouped.size === 0) return;
    setEstimatesLoading(true);

    const loadEstimates = async () => {
      const newSelections = new Map<string, StoreSelection>();
      for (const [storeId, items] of grouped) {
        const subtotal = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
        const storeName = items[0]?.storeName || `Supplier ${storeId.slice(0, 8)}`;
        try {
          const estimate = await fetchShippingEstimate(storeId, subtotal, city || undefined);
          const availableMethods = estimate.deliveryAvailable
            ? estimate.methods.filter(m => m.status !== 'UNAVAILABLE')
            : [];
          const defaultMethod = availableMethods[0];
          const isPickup = !defaultMethod;
          newSelections.set(storeId, {
            storeId,
            storeName,
            fulfillmentMethod: defaultMethod?.fulfillmentMethod || (isPickup ? 'PICKUP' : 'PLATFORM_DELIVERY'),
            shippingMethodId: defaultMethod?.methodId || null,
            estimate,
          });
        } catch {
          // No shipping estimate available — use defaults
          newSelections.set(storeId, {
            storeId,
            storeName,
            fulfillmentMethod: 'PICKUP',
            shippingMethodId: null,
            estimate: null,
          });
        }
      }
      setStoreSelections(newSelections);
      setEstimatesLoading(false);
    };

    loadEstimates();
  }, [cartItems.length, city]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSelection = (storeId: string, patch: Partial<StoreSelection>) => {
    setStoreSelections(prev => {
      const next = new Map(prev);
      const current = next.get(storeId);
      if (current) next.set(storeId, { ...current, ...patch });
      return next;
    });
  };

  // Ask the API to calculate the exact per-supplier financial breakdown,
  // including the configured VAT rate, promotion discount and authoritative fees.
  useEffect(() => {
    if (
      cartItems.length === 0 ||
      estimatesLoading ||
      storeSelections.size !== storeCount ||
      !address.trim() ||
      !city.trim()
    ) {
      setCheckoutPreview(null);
      setPreviewLoading(false);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    setPreviewError('');
    previewCheckout({
      deliveryAddress: { street: address.trim(), city: city.trim() },
      shippingSelections: [...storeSelections.values()].map(selection => ({
        storeId: selection.storeId,
        fulfillmentMethod: selection.fulfillmentMethod,
        shippingMethodId: selection.shippingMethodId || undefined,
      })),
    })
      .then(result => {
        if (active) setCheckoutPreview(result);
      })
      .catch((error: any) => {
        if (active) {
          setCheckoutPreview(null);
          setPreviewError(error.message || 'Could not calculate checkout totals');
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => { active = false; };
  }, [cartItems.length, estimatesLoading, storeSelections, storeCount, address, city]);

  const handleSubmit = async () => {
    if (!address.trim()) { setError('Delivery address is required'); return; }
    if (cartItems.length === 0) { setError('Your cart is empty'); return; }
    setSubmitting(true);
    setError('');
    try {
      const idempotencyKey = typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID 
        ? globalThis.crypto.randomUUID() 
        : Date.now().toString(36) + Math.random().toString(36).slice(2);

      // Build per-store shipping selections
      const shippingSelections = [...storeSelections.values()].map(sel => ({
        storeId: sel.storeId,
        fulfillmentMethod: sel.fulfillmentMethod,
        shippingMethodId: sel.shippingMethodId || undefined,
      }));

      const result = await checkout({
        deliveryAddress: { street: address, city },
        notes: notes || undefined,
        idempotencyKey,
        shippingSelections: multiStore || storeSelections.size > 0 ? shippingSelections : undefined,
        fulfillmentMethod: !multiStore ? storeSelections.values().next().value?.fulfillmentMethod || 'PLATFORM_DELIVERY' : undefined,
        paymentMethod,
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
      <PageHeader title="Checkout" subtitle="Complete your order" />
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
                const sel = storeSelections.get(storeId);
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
                      <span>Subtotal</span>
                      <span>{formatMinor(groupTotal, items[0]?.currency)}</span>
                    </div>

                    {/* Per-store shipping selection */}
                    {sel && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.borderLight}` }}>
                        <div style={{ ...typeScale.bodySm, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>Shipping</div>
                        {sel.estimate?.deliveryAvailable === false && (
                          <div style={{ ...typeScale.bodySm, color: colors.muted, marginBottom: 4 }}>
                            {sel.estimate ? 'Delivery is unavailable for this address.' : 'Delivery options could not be loaded.'} Pickup remains available.
                          </div>
                        )}
                        {(sel.estimate?.deliveryAvailable ? sel.estimate.methods.filter(m => m.status !== 'UNAVAILABLE') : []).map(m => (
                          <label key={m.methodId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', ...typeScale.bodySm }}>
                            <input type="radio" name={`shipping-${storeId}`} checked={sel.shippingMethodId === m.methodId}
                              onChange={() => updateSelection(storeId, { shippingMethodId: m.methodId, fulfillmentMethod: m.fulfillmentMethod })} />
                            <span>{m.name}</span>
                            <span style={{ marginLeft: 'auto', color: m.status === 'FREE' ? colors.ok : colors.muted }}>
                              {m.status === 'FREE' ? 'Free' : formatMinor(m.feeMinor, m.currency)}
                            </span>
                            {m.estimatedDaysMin != null && (
                              <span style={{ color: colors.muted, fontSize: typeScale.bodySm.fontSize }}>
                                ({m.estimatedDaysMin}–{m.estimatedDaysMax}d)
                              </span>
                            )}
                          </label>
                        ))}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', ...typeScale.bodySm }}>
                          <input type="radio" name={`shipping-${storeId}`} checked={sel.fulfillmentMethod === 'PICKUP'}
                            onChange={() => updateSelection(storeId, { fulfillmentMethod: 'PICKUP', shippingMethodId: null })} />
                          <span>Pickup</span>
                          <span style={{ marginLeft: 'auto', color: colors.ok }}>Free</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              {cart?.promoCode && (
                <div style={{ ...typeScale.bodySm, color: colors.ok, margin: '4px 0 8px' }}>Promo applied: {cart.promoCode}</div>
              )}
              <div style={{ marginTop: 12, padding: '12px', border: `1px solid ${colors.borderLight}`, borderRadius: radii.sm }}>
                <div style={{ ...typeScale.body, fontWeight: 700, color: colors.brand[700], marginBottom: 8 }}>
                  Tax-inclusive estimate
                </div>
                {previewLoading ? (
                  <div style={{ ...typeScale.bodySm, color: colors.muted }}>Calculating supplier totals, delivery and VAT…</div>
                ) : checkoutPreview ? (
                  <>
                    {checkoutPreview.stores.map(row => (
                      <div key={row.storeId} style={{ padding: '8px 0', borderTop: `1px solid ${colors.borderLight}` }}>
                        <div style={{ ...typeScale.body, fontWeight: 600, marginBottom: 4 }}>
                          {grouped.get(row.storeId)?.[0]?.storeName || 'Supplier'}
                        </div>
                        {[
                          ['Items', row.subtotalMinor],
                          ['Discount', -row.discountMinor],
                          ['Delivery', row.deliveryFeeMinor],
                          ['VAT', row.taxMinor],
                        ].map(([label, amount]) => (
                          <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', ...typeScale.bodySm, color: colors.muted }}>
                            <span>{label}</span>
                            <span>{formatMinor(Number(amount), row.currency || undefined)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', ...typeScale.body, fontWeight: 700, marginTop: 4 }}>
                          <span>Supplier total</span>
                          <span>{formatMinor(row.totalMinor, row.currency || undefined)}</span>
                        </div>
                      </div>
                    ))}
                    {checkoutPreview.hasUnpricedAmounts ? (
                      <div style={{ ...typeScale.bodySm, color: colors.muted }}>Some supplier totals have no confirmed currency.</div>
                    ) : Object.entries(checkoutPreview.totalsByCurrency).map(([currency, amount]) => (
                      <div key={currency} style={{ display: 'flex', justifyContent: 'space-between', ...typeScale.body, fontWeight: 700, marginTop: 8 }}>
                        <span>Total ({currency})</span>
                        <span>{formatMinor(amount, currency)}</span>
                      </div>
                    ))}
                    <p style={{ ...typeScale.bodySm, color: colors.muted, margin: '8px 0 0' }}>
                      VAT is estimated by the server using the current tax configuration. The server recalculates all amounts when you place the order.
                    </p>
                  </>
                ) : (
                  <div style={{ ...typeScale.bodySm, color: colors.muted }}>
                    {previewError || 'Enter your delivery address and choose shipping for each supplier to calculate VAT and final estimates.'}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', background: colors.bgSubtle, border: `1px solid ${colors.border}`, borderRadius: radii.sm }}>
                <div style={{ ...typeScale.label, fontWeight: 600, color: colors.brand[700], marginBottom: 8 }}>Payment Method</div>
                {[
                  { key: 'CASH_ON_DELIVERY', label: 'Cash on Delivery', desc: 'Pay when your order arrives' },
                  { key: 'BANK_TRANSFER', label: 'Bank Transfer', desc: 'Transfer to platform account, upload receipt' },
                  { key: 'VOUCHER', label: 'Voucher', desc: 'Use platform voucher (requires balance)' },
                  { key: 'DIGITAL', label: 'Digital Payment', desc: 'Coming soon — not yet available', disabled: true },
                ].map(opt => (
                  <label key={opt.key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
                    cursor: opt.disabled ? 'not-allowed' : 'pointer', opacity: opt.disabled ? 0.5 : 1,
                  }}>
                    <input type="radio" name="paymentMethod" value={opt.key} checked={paymentMethod === opt.key}
                      onChange={() => !opt.disabled && setPaymentMethod(opt.key)} disabled={!!opt.disabled}
                      style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ ...typeScale.body, fontWeight: 500, color: colors.brand[700] }}>{opt.label}</div>
                      <div style={{ ...typeScale.bodySm, color: colors.muted }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
                {paymentMethod === 'BANK_TRANSFER' && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#fffde7', borderRadius: radii.sm, ...typeScale.bodySm, color: '#6d4c00' }}>
                    After placing the order you will receive bank details and a reference number.
                    Upload your transfer receipt from the order page within 72 hours.
                  </div>
                )}
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
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', ...typeScale.label, color: colors.brand[700], marginBottom: 6 }}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." rows={3} style={{
                  width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: radii.sm,
                  fontSize: typeScale.body.fontSize, fontFamily: 'inherit', boxSizing: 'border-box' as const, resize: 'vertical',
                }} />
              </div>

              {estimatesLoading && (
                <div style={{ ...typeScale.bodySm, color: colors.muted, marginBottom: 12 }}>Loading shipping options...</div>
              )}

              <Button size="lg" onClick={handleSubmit} disabled={submitting || estimatesLoading || previewLoading || !checkoutPreview} style={{ width: '100%' }}>
                {submitting ? 'Placing Order...' : 'Place Order'}
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
