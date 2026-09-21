'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchStoreWarehouses, fetchWarehouseInventory, adjustStock,
  fetchInventoryMovements, StockMovement,
  WarehouseSummary, InventoryItem,
} from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
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

  // Movement history
  const [historyItemId, setHistoryItemId] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
        const s = pickStore(stores);
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

  const openHistory = async (item: InventoryItem) => {
    setHistoryItemId(item.id);
    setLoadingHistory(true);
    try {
      setMovements(await fetchInventoryMovements(item.id));
    } catch {
      setMovements([]);
    } finally {
      setLoadingHistory(false);
    }
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
          <Link href="/merchant" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>&larr; Back to Dashboard</Link>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 0', letterSpacing: '-0.3px' }}>Inventory</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
            Stock levels{selectedWh ? ` — ${items.length} items` : ''}
            {items.filter(isLowStock).length > 0 && (
              <span style={{ color: '#fca5a5', fontWeight: 600 }}> ({items.filter(isLowStock).length} low stock)</span>
            )}
          </p>
        </div>
        <div style={{ padding: '20px 24px 48px' }}>

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
                      <tr key={item.id} className="tbl-row" style={{ ...tbodyRow, background: low ? '#fef2f2' : undefined }}>
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
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openAdjust(item)} style={editBtn}>Adjust</button>
                            <button onClick={() => openHistory(item)} style={historyBtn}>History</button>
                          </div>
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

      {/* Movement history dialog */}
      {historyItemId && (
        <div style={overlay}>
          <div style={{ ...dialog, maxWidth: 600 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Stock Movement History</h3>
            {loadingHistory ? <LoadingSpinner /> : movements.length === 0 ? (
              <p style={{ fontSize: 13, color: '#5b6b74' }}>No movements recorded yet.</p>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5b6b74' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5b6b74' }}>Type</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#5b6b74' }}>Qty</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5b6b74' }}>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 12px', color: '#1e2d35' }}>{new Date(m.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            background: m.movementType === 'ADJUSTMENT' ? '#dbeafe' : m.movementType === 'RESERVATION' ? '#fef3c7' : '#e2e8f0',
                            color: m.movementType === 'ADJUSTMENT' ? '#1e40af' : m.movementType === 'RESERVATION' ? '#92400e' : '#475569',
                          }}>{m.movementType}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: m.quantity > 0 ? '#065f46' : '#991b1b' }}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5b6b74', fontSize: 11, fontFamily: 'monospace' }}>
                          {m.referenceType ? `${m.referenceType}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setHistoryItemId('')} style={ghostBtn}>Close</button>
            </div>
          </div>
        </div>
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
      </div>
    </>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const backLink: React.CSSProperties = { fontSize: 13, color: '#5b6b74', textDecoration: 'none' };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const select: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 220 };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' };
const historyBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const pill: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const dialog: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 10 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937' };
