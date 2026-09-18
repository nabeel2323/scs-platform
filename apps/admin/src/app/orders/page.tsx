'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchAdminOrders, fetchAdminOrderDetail, AdminOrder, AdminOrderDetail } from '../../lib/api';
import TablePagination from '../../components/TablePagination';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

const STATUSES = ['', 'SUBMITTED', 'PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DISPUTED'];

export default function AdminOrdersPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:orders:read']);

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [storeIdFilter, setStoreIdFilter] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearchDebounced(v); setPage(0); }, 300);
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchAdminOrders({
        status: statusFilter || undefined,
        storeId: storeIdFilter || undefined,
        limit,
        offset: page * limit,
      });
      setOrders(result.data);
      setTotal(result.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, statusFilter, limit, searchDebounced]);

  const filteredData = orders.filter(o => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return o.id.toLowerCase().includes(q) || o.status.toLowerCase().includes(q) || o.storeId.toLowerCase().includes(q) || (o.fulfillmentMethod && o.fulfillmentMethod.toLowerCase().includes(q));
  });

  const handleViewDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await fetchAdminOrderDetail(id);
      setSelectedOrder(detail);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  };

  const statusColor = (s: string): string => {
    const map: Record<string, string> = {
      SUBMITTED: '#92400e', PENDING_CONFIRMATION: '#1e40af', ACCEPTED: '#065f46', PARTIALLY_ACCEPTED: '#92400e',
      PREPARING: '#7c3aed', READY: '#047857', ASSIGNED: '#1e40af', PICKED_UP: '#7c3aed',
      OUT_FOR_DELIVERY: '#1e40af', DELIVERED: '#065f46', COMPLETED: '#065f46',
      CANCELLED: '#991b1b', REJECTED: '#991b1b', DISPUTED: '#991b1b',
    };
    return map[s] || '#5b6b74';
  };

  const fmt = (n: number) => (n / 100).toFixed(2);

  if (!hasAccess) return <AccessDenied requiredPerms={['admin:orders:read']} missingPerms={missingPerms} />;

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
        .tbl-last td { border-bottom: none !important; }
      `}</style>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Order Monitor</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>All platform orders — {searchDebounced ? `${filteredData.length} matches` : `${total} total`}</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Status</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={filterStyle}>
              <option value="">All Statuses</option>
              {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Store ID</label>
            <input type="text" placeholder="UUID or prefix..." value={storeIdFilter} onChange={e => setStoreIdFilter(e.target.value)} style={{ ...filterStyle, width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <button onClick={() => { setPage(0); load(); }} style={btnPrimary}>Apply</button>
        </div>

        {/* Search & Pagination Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0', fontSize: 14, pointerEvents: 'none' }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search by order ID, status..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', boxSizing: 'border-box' as const, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b74' }}>
            <span>Rows:</span>
            <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 12, background: '#fff', cursor: 'pointer' }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Orders Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No orders found.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                  <th style={thStyle}>Order ID</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Store</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Fulfillment</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(o => (
                  <tr key={o.id} className="tbl-row" style={{ borderBottom: '1px solid #edf2f7' }}>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>#{o.id.slice(0, 8)}</span></td>
                    <td style={tdStyle}>
                      <span style={pill(statusColor(o.status))}>
                        {o.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.storeId.slice(0, 8)}</span></td>
                    <td style={tdStyle}>{fmt(o.totalMinor)} {o.currency}</td>
                    <td style={tdStyle}>{o.fulfillmentMethod?.replace(/_/g, ' ') || '—'}</td>
                    <td style={tdStyle}>{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <button onClick={() => handleViewDetail(o.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <TablePagination page={page} total={searchDebounced ? filteredData.length : total} limit={limit} onPageChange={setPage} onLimitChange={l => { setLimit(l); setPage(0); }} />

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div style={{ position: 'fixed', top: 0, left: 220, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 200 }} onClick={() => setSelectedOrder(null)}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f3340', margin: 0 }}>Order #{selectedOrder.id.slice(0, 8)}</h2>
                <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#5b6b74' }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div><span style={{ fontSize: 11, color: '#5b6b74' }}>Status</span><br /><span style={{ fontSize: 13, fontWeight: 600, color: statusColor(selectedOrder.status) }}>{selectedOrder.status.replace(/_/g, ' ')}</span></div>
                <div><span style={{ fontSize: 11, color: '#5b6b74' }}>Total</span><br /><span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(selectedOrder.totalMinor)} {selectedOrder.currency}</span></div>
                <div><span style={{ fontSize: 11, color: '#5b6b74' }}>Buyer</span><br /><span style={{ fontSize: 11, fontFamily: 'monospace' }}>{selectedOrder.buyerId.slice(0, 8)}</span></div>
                <div><span style={{ fontSize: 11, color: '#5b6b74' }}>Created</span><br /><span style={{ fontSize: 12 }}>{new Date(selectedOrder.createdAt).toLocaleString()}</span></div>
              </div>

              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Items ({selectedOrder.items.length})</h3>
              <div style={{ marginBottom: 20 }}>
                {selectedOrder.items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf2f7', fontSize: 12 }}>
                    <span>Qty {item.quantity} × {fmt(item.unitPriceMinor)}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(item.totalPriceMinor)} {selectedOrder.currency}</span>
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Status History</h3>
              {selectedOrder.history.map(h => (
                <div key={h.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #edf2f7', fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: statusColor(h.toStatus), minWidth: 230 }}>
                    {h.fromStatus ? `${h.fromStatus.replace(/_/g, ' ')} → ` : ''}{h.toStatus.replace(/_/g, ' ')}
                  </span>
                  <span style={{ color: '#5b6b74' }}>{h.actorType}</span>
                  <span style={{ color: '#a0aec0', marginLeft: 'auto' }}>{new Date(h.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const filterStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const tdStyle: React.CSSProperties = { padding: '14px 18px', fontSize: 13, color: '#1e2d35' };
const pill = (color: string): React.CSSProperties => ({ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color, fontWeight: 600 });
const pageBtn = (disabled: boolean): React.CSSProperties => ({ padding: '6px 14px', fontSize: 12, background: disabled ? '#edf2f7' : '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', color: disabled ? '#a0aec0' : '#0f3340' });
