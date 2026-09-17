'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchStorePriceLists, fetchPriceListTiers, PriceList, PriceTier } from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';
import { TierLadder } from '../../../components/QuantityStepper';

export default function MerchantPricingPage() {
  const [storeId, setStoreId] = useState('');
  const [noStore, setNoStore] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [selectedList, setSelectedList] = useState('');
  const [error, setError] = useState('');

  const loadTiers = useCallback(async (listId: string) => {
    if (!listId) { setTiers([]); return; }
    setTiersLoading(true);
    try {
      setTiers(await fetchPriceListTiers(listId));
    } catch (err: any) {
      setError(err.message || 'Failed to load tiers');
    } finally {
      setTiersLoading(false);
    }
  }, []);

  const loadLists = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const lists = await fetchStorePriceLists(sid);
      setPriceLists(lists);
      const first = lists[0];
      if (first) {
        setSelectedList(first.id);
        await loadTiers(first.id);
      } else {
        setSelectedList('');
        setTiers([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load price lists');
    } finally {
      setLoading(false);
    }
  }, [loadTiers]);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (!s) { setNoStore(true); setLoading(false); return; }
        setStoreId(s.id);
        await loadLists(s.id);
      } catch (err: any) {
        setError(err.message || 'Failed to resolve store');
        setLoading(false);
      }
    })();
  }, [loadLists]);

  const fmt = (n: number) => (n / 100).toFixed(2);

  // Group tiers by variantId for the TierLadder preview
  const tiersByVariant = tiers.reduce((acc, t) => {
    const key = t.variantId;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push({ minQty: t.minQty, unitPriceMinor: t.unitPriceMinor });
    return acc;
  }, {} as Record<string, { minQty: number; unitPriceMinor: number }[]>);

  if (noStore) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Pricing</h1>
        <EmptyState title="No store yet" description="Onboard a store to manage pricing."
          action={<Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>} />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header Banner */}
        <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Pricing</h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Price lists and volume tiers (read-only)</p>
            </div>
            <button onClick={() => storeId && loadLists(storeId)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
          </div>
        </div>
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <select value={selectedList} onChange={e => { setSelectedList(e.target.value); loadTiers(e.target.value); }} style={select} disabled={priceLists.length === 0}>
          {priceLists.length === 0 && <option value="">No price lists</option>}
          {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name} ({pl.currency})</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : priceLists.length === 0 ? (
        <EmptyState title="No price lists" description="Price lists created for your store will appear here." />
      ) : tiersLoading ? <LoadingSpinner /> : tiers.length === 0 ? (
        <EmptyState title="No price tiers" description="This price list has no tiers yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr style={theadRow}>
                  <th style={th}>Variant</th>
                  <th style={th}>Min Qty</th>
                  <th style={th}>Max Qty</th>
                  <th style={th}>Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map(t => (
                  <tr key={t.id} className="tbl-row" style={tbodyRow}>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.variantId.slice(0, 8)}</span></td>
                    <td style={td}>≥ {t.minQty}</td>
                    <td style={td}>{t.maxQty ?? '—'}</td>
                    <td style={td}><strong>{fmt(t.unitPriceMinor)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
      </div>
    </>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const backLink: React.CSSProperties = { fontSize: 13, color: '#5b6b74', textDecoration: 'none' };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const select: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 220 };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
