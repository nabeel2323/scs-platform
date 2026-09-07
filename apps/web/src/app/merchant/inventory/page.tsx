'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchStoreWarehouses, fetchWarehouseInventory, adjustStock,
  WarehouseSummary, InventoryItem,
} from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';

export default function MerchantInventoryPage() {
  const [noStore, setNoStore] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [selectedWh, setSelectedWh] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Adjust form (per row)
  const [adjustId, setAdjustId] = useState('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const loadInventory = useCallback(async (warehouseId: string) => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      setItems(await fetchWarehouseInventory(warehouseId));
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = stores[0];
        if (!s) { setNoStore(true); setLoading(false); return; }
        const whs = await fetchStoreWarehouses(s.id);
        setWarehouses(whs);
        const first = whs[0];
        if (first) {
          setSelectedWh(first.id);
          await loadInventory(first.id);
        } else {
          setLoading(false);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to resolve store');
        setLoading(false);
      }
    })();
  }, [loadInventory]);

  const onWarehouseChange = async (whId: string) => {
    setSelectedWh(whId);
    setItems([]);
    await loadInventory(whId);
  };

  const openAdjust = (item: InventoryItem) => {
    setAdjustId(item.id);
    setAdjustQty('');
    setAdjustReason('');
  };

  const handleAdjust = async () => {
    const qty = Number(adjustQty);
    if (!adjustId || !adjustQty.trim() || Number.isNaN(qty) || qty === 0) {
      setError('Enter a non-zero quantity delta (e.g. 10 or -5)');
      return;
    }
    setAdjusting(true);
    setError('');
    try {
      await adjustStock({ inventoryItemId: adjustId, quantity: qty, reason: adjustReason.trim() || undefined });
      setAdjustId('');
      await loadInventory(selectedWh);
    } catch (err: any) {
      setError(err.message || 'Adjust failed');
    } finally {
      setAdjusting(false);
    }
  };

  const isLowStock = (item: InventoryItem) => item.qtyOnHand <= item.reorderPoint;

  if (noStore) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Inventory</h1>
        <EmptyState title="No store yet" description="Onboard a store to manage inventory."
          action={<Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <Link href="/merchant" style={backLink}>← Merchant Dashboard</Link>
      <h1 style={{ ...h1, marginTop: 8 }}>Inventory</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 20 }}>
        Stock levels{selectedWh ? ` — ${items.length} items` : ''}
        {items.filter(isLowStock).length > 0 && (
          <span style={{ color: '#991b1b', fontWeight: 600 }}> ({items.filter(isLowStock).length} low stock)</span>
        )}
      </p>

      {error && <ErrorBanner message={error} />}

      {warehouses.length === 0 ? (
        <EmptyState
          title="No warehouses"
          description="Add a warehouse in your Store Profile to start tracking inventory."
          action={<Link href="/merchant/store" style={primaryLink}>Go to Store Profile</Link>}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
            <select value={selectedWh} onChange={e => onWarehouseChange(e.target.value)} style={select}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={() => loadInventory(selectedWh)} style={primaryBtn}>Refresh</button>
          </div>

          {loading ? <LoadingSpinner /> : items.length === 0 ? (
            <EmptyState title="No inventory items" description="This warehouse has no tracked stock yet." />
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>Variant</th>
                    <th style={th}>On Hand</th>
                    <th style={th}>Reserved</th>
                    <th style={th}>Available</th>
                    <th style={th}>Reorder Point</th>
                    <th style={th}>Status</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const available = item.qtyOnHand - item.qtyReserved;
                    const low = isLowStock(item);
                    return (
                      <tr key={item.id} style={{ ...tbodyRow, background: low ? '#fef2f2' : 'transparent' }}>
                        <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.variantId.slice(0, 8)}</span></td>
                        <td style={td}>{item.qtyOnHand}</td>
                        <td style={td}>{item.qtyReserved}</td>
                        <td style={td}><strong>{available}</strong></td>
                        <td style={td}>{item.reorderPoint}</td>
                        <td style={td}>
                          {low
                            ? <span style={{ ...pill, background: '#fef2f2', color: '#991b1b' }}>LOW STOCK</span>
                            : <span style={{ ...pill, background: '#d1fae5', color: '#065f46' }}>OK</span>}
                        </td>
                        <td style={td}>
                          <button onClick={() => openAdjust(item)} style={editBtn}>Adjust</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Adjust dialog */}
      {adjustId && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Adjust Stock</h3>
            <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>
              Enter a quantity delta. Positive adds stock, negative removes it (e.g. <code>10</code> or <code>-5</code>).
            </p>
            <label style={label}>Quantity delta *
              <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="e.g. 10 or -5" style={input} autoFocus />
            </label>
            <label style={label}>Reason
              <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Stock count correction" style={input} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleAdjust} disabled={adjusting || !adjustQty.trim()} style={primaryBtn}>{adjusting ? 'Applying…' : 'Apply'}</button>
              <button onClick={() => setAdjustId('')} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const backLink: React.CSSProperties = { fontSize: 13, color: '#5b6b74', textDecoration: 'none' };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const select: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 220 };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: '#f0f4f7', borderBottom: '1px solid #d9e2e6' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #eef2f5' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const td: React.CSSProperties = { padding: '10px 14px', color: '#1f2937' };
const pill: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const dialog: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 10 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937' };
