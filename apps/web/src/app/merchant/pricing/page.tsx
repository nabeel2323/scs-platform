'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '../../../lib/auth';
import { TierLadder } from '../../../components/QuantityStepper';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

interface PriceList {
  id: string;
  storeId: string;
  name: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

interface PriceTier {
  id: string;
  priceListId: string;
  variantId: string;
  minQty: number;
  unitPriceMinor: number;
}

export default function MerchantPricingPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/v1/price-lists`);
      if (res.ok) {
        const lists = await res.json();
        setPriceLists(lists);
        if (lists.length > 0 && !selectedList) setSelectedList(lists[0].id);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const loadTiers = async (listId: string) => {
    try {
      const res = await authFetch(`${API_URL}/price-lists/${listId}/tiers`);
      if (res.ok) setTiers(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedList) loadTiers(selectedList); }, [selectedList]);

  const fmt = (n: number) => (n / 100).toFixed(2);

  // Group tiers by variantId for TierLadder preview
  const tiersByVariant = tiers.reduce((acc, t) => {
    const key = t.variantId;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push({ minQty: t.minQty, unitPriceMinor: t.unitPriceMinor });
    return acc;
  }, {} as Record<string, { minQty: number; unitPriceMinor: number }[]>);

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Pricing Editor</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>Manage price lists and tier pricing</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select value={selectedList || ''} onChange={e => setSelectedList(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 200 }}>
          {priceLists.map(pl => (
            <option key={pl.id} value={pl.id}>{pl.name} ({pl.currency})</option>
          ))}
        </select>
        <button onClick={load} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading...</div>
      ) : tiers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No price tiers found for this list.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          {/* Price tiers table */}
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                  <th style={thStyle}>Variant</th>
                  <th style={thStyle}>Min Qty</th>
                  <th style={thStyle}>Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.variantId.slice(0, 8)}</span></td>
                    <td style={tdStyle}>≥ {t.minQty}</td>
                    <td style={tdStyle}><strong>{fmt(t.unitPriceMinor)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TierLadder preview */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Tier Preview</h3>
            {Object.entries(tiersByVariant).slice(0, 3).map(([variantId, variantTiers]) => (
              <div key={variantId} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#5b6b74', marginBottom: 4, fontFamily: 'monospace' }}>Variant #{variantId.slice(0, 8)}</div>
                <TierLadder tiers={variantTiers} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
