'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkout } from '../../lib/buyer-api';
import { formatMinor, ErrorBanner } from '../../components/Shared';
import crypto from 'node:crypto';

export default function CheckoutPage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [fulfillment, setFulfillment] = useState('PLATFORM_DELIVERY');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!address.trim()) { setError('Delivery address is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
      const result = await checkout({
        deliveryAddress: { street: address, city },
        notes: notes || undefined,
        idempotencyKey,
        fulfillmentMethod: fulfillment,
      });
      router.push(`/orders`);
    } catch (err: any) {
      setError(err.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 24 }}>Checkout</h1>

      {error && <ErrorBanner message={error} />}

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
          {submitting ? 'Placing Order...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const };
