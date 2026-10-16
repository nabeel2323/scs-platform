'use client';

import { useState, useCallback } from 'react';

/**
 * QuantityStepper — ± buttons, direct entry, inline tier hint, MOQ floor guard.
 *
 * Props:
 *   value: current quantity
 *   onChange: callback when quantity changes
 *   minQty: MOQ floor (minimum order quantity)
 *   tierHint: optional tier pricing hint e.g. "≥50: 12.00 SAR"
 */
export function QuantityStepper({
  value,
  onChange,
  minQty = 1,
  tierHint,
}: {
  value: number;
  onChange: (qty: number) => void;
  minQty?: number;
  tierHint?: string;
}) {
  const [inputValue, setInputValue] = useState(String(value));

  const clamp = useCallback((v: number) => Math.max(minQty, v), [minQty]);

  const handleDecrement = () => {
    const next = clamp(value - 1);
    onChange(next);
    setInputValue(String(next));
  };

  const handleIncrement = () => {
    const next = value + 1;
    onChange(next);
    setInputValue(String(next));
  };

  const handleBlur = () => {
    const parsed = parseInt(inputValue, 10);
    const next = clamp(isNaN(parsed) ? minQty : parsed);
    onChange(next);
    setInputValue(String(next));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #d9e2e6', borderRadius: 6, overflow: 'hidden' }}>
        <button
          onClick={handleDecrement}
          disabled={value <= minQty}
          style={{
            width: 32, height: 32, border: 'none', background: value <= minQty ? '#f7f9fa' : '#fff',
            color: value <= minQty ? '#d9e2e6' : '#0f3340', fontSize: 16, fontWeight: 700, cursor: value <= minQty ? 'default' : 'pointer',
          }}
        >
          −
        </button>
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: 48, height: 32, textAlign: 'center', border: 'none', borderLeft: '1px solid #d9e2e6',
            borderRight: '1px solid #d9e2e6', fontSize: 14, fontWeight: 600, outline: 'none',
          }}
        />
        <button
          onClick={handleIncrement}
          style={{
            width: 32, height: 32, border: 'none', background: '#fff',
            color: '#0f3340', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>
      {tierHint && (
        <span style={{ fontSize: 11, color: '#047857', fontStyle: 'italic' }}>{tierHint}</span>
      )}
    </div>
  );
}

/**
 * TierLadder — visual quantity-price ladder widget.
 *
 * Props:
 *   tiers: array of { minQty, unitPriceMinor }
 *   currentQty: currently selected quantity (highlight the matching tier)
 *   currency: currency code for display
 */
export function TierLadder({
  tiers,
  currentQty = 0,
  currency = 'SAR',
}: {
  tiers: { minQty: number; unitPriceMinor: number }[];
  currentQty?: number;
  currency?: string;
}) {
  if (!tiers || tiers.length === 0) return null;

  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);

  const activeIdx = sorted.reduce((acc, tier, i) =>
    currentQty >= tier.minQty ? i : acc, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #d9e2e6', borderRadius: 8, overflow: 'hidden', fontSize: 13 }}>
      <div style={{ padding: '6px 12px', background: '#f7f9fa', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        Quantity Tiers
      </div>
      {sorted.map((tier, i) => {
        const isActive = i === activeIdx;
        const price = (tier.unitPriceMinor / 100).toFixed(2);
        return (
          <div
            key={tier.minQty}
            style={{
              display: 'flex', justifyContent: 'space-between', padding: '6px 12px',
              background: isActive ? '#f0f9ff' : 'transparent',
              borderLeft: isActive ? '3px solid #38bdf8' : '3px solid transparent',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <span style={{ color: '#374151' }}>≥ {tier.minQty}</span>
            <span style={{ color: isActive ? '#0f3340' : '#5b6b74' }}>{price} {currency}</span>
          </div>
        );
      })}
    </div>
  );
}
