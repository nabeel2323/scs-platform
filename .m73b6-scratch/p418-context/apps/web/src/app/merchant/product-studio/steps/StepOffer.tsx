'use client';

import { type StudioState } from '../../../../hooks/useProductStudio';
import { StepCard, Field } from './StepIdentity';
import { ProductVariant } from '../../../../lib/buyer-api';

interface StepOfferProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
  existingVariants?: ProductVariant[];
  stores?: Array<{ id: string; displayName: string; currency?: string }>;
}

export default function StepOffer({ state, setState, existingVariants = [], stores = [] }: StepOfferProps) {
  const selectedVariant = existingVariants.find(v => v.id === state.selectedExistingVariantId);
  const storeCurrency = stores.find(s => s.id === state.storeId)?.currency;

  return (
    <StepCard title="Merchant Offer" subtitle="Set your pricing, minimum order, and fulfillment details">
      <div style={{ padding: 12, background: '#e0f2fe', borderRadius: 6, fontSize: 13, color: '#16232b' }}>
        <strong>Note:</strong> Product specs describe WHAT you&apos;re selling. Offer info describes HOW YOU SELL IT — price, MOQ, lead time.
      </div>

      {/* Show selected variant context */}
      {selectedVariant && (
        <div style={{ padding: 10, background: '#fefce8', borderRadius: 6, fontSize: 12, color: '#713f12', border: '1px solid #fde68a' }}>
          Offer attached to variant: <strong style={{ fontFamily: 'monospace' }}>{selectedVariant.sku}</strong> — {selectedVariant.title || 'Untitled'}
        </div>
      )}
      {state.useExistingProductId && !selectedVariant && (
        <div style={{ padding: 10, background: '#fefce8', borderRadius: 6, fontSize: 12, color: '#713f12', border: '1px solid #fde68a' }}>
          Offer at product level (no specific variant selected).
        </div>
      )}

      {/* Store currency hint */}
      {storeCurrency && storeCurrency !== state.currency && (
        <div style={{ padding: 10, background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#991b1b', border: '1px solid #fecaca' }}>
          Your store currency is <strong>{storeCurrency}</strong>, but you&apos;re pricing in <strong>{state.currency}</strong>.
          Make sure this is intentional.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Currency">
          <select value={state.currency} onChange={e => setState(prev => ({ ...prev, currency: e.target.value }))}>
            <option value="SAR">SAR (Saudi Riyal)</option>
            <option value="USD">USD (US Dollar)</option>
            <option value="EUR">EUR (Euro)</option>
            <option value="AED">AED (UAE Dirham)</option>
            <option value="KWD">KWD (Kuwaiti Dinar)</option>
            <option value="BHD">BHD (Bahraini Dinar)</option>
            <option value="QAR">QAR (Qatari Riyal)</option>
            <option value="OMR">OMR (Omani Rial)</option>
          </select>
        </Field>
        <Field label="Base Price (minor units) *">
          <input
            type="number" min={0}
            value={state.basePriceMinor}
            onChange={e => setState(prev => ({ ...prev, basePriceMinor: Number(e.target.value) }))}
          />
          <span style={{ fontSize: 11, color: '#5b6b74' }}>
            Enter price in the smallest currency unit (e.g., halalas for SAR, cents for USD). 1 SAR = 100 halalas.
          </span>
        </Field>
        <Field label="Minimum Order Qty">
          <input
            type="number" min={1}
            value={state.moq}
            onChange={e => setState(prev => ({ ...prev, moq: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Lead Time (days)">
          <input
            type="number" min={0}
            value={state.leadTimeDays}
            onChange={e => setState(prev => ({ ...prev, leadTimeDays: Number(e.target.value) }))}
          />
          <span style={{ fontSize: 11, color: '#5b6b74' }}>Estimated days from order to delivery.</span>
        </Field>
      </div>

      <Field label="Warehouse (optional)">
        <input
          value={state.warehouseId}
          onChange={e => setState(prev => ({ ...prev, warehouseId: e.target.value }))}
          placeholder="Warehouse ID for fulfillment"
        />
      </Field>

      {/* Price preview */}
      {state.basePriceMinor > 0 && (
        <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Price Preview</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>
            {(state.basePriceMinor / 100).toFixed(2)} {state.currency}
          </div>
          <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 4 }}>
            MOQ: {state.moq} unit(s) · Lead time: {state.leadTimeDays} day(s)
            {selectedVariant && <> · Variant: {selectedVariant.sku}</>}
          </div>
        </div>
      )}
    </StepCard>
  );
}
