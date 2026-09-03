'use client';

import { useState, useEffect } from 'react';
import { fetchAdminOrders, fetchAdminOrderDetail, AdminOrder, AdminOrderDetail } from '../../lib/api';

const STATUSES = ['', 'SUBMITTED', 'PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DISPUTED'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [storeIdFilter, setStoreIdFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const limit = 25;

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

  useEffect(() => { load(); }, [page, statusFilter]);

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

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Order Monitor</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>All platform orders — {total} total</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={filterStyle}>
          <option value="">All Statuses</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="text" placeholder="Filter by Store ID..." value={storeIdFilter} onChange={e => setStoreIdFilter(e.target.value)} style={{ ...filterStyle, flex: 1, minWidth: 200 }} />
        <button onClick={() => { setPage(0); load(); }} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Apply</button>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading orders...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No orders found.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
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
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>#{o.id.slice(0, 8)}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${statusColor(o.status)}18`, color: statusColor(o.status), fontWeight: 600 }}>
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
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', fontSize: 12, background: page === 0 ? '#edf2f7' : '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#a0aec0' : '#0f3340' }}>Previous</button>
          <span style={{ fontSize: 12, color: '#5b6b74', padding: '6px 8px' }}>Page {page + 1} of {Math.ceil(total / limit)}</span>
          <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', color: '#0f3340' }}>Next</button>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 220, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 200 }} onClick={() => setSelectedOrder(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
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
                <span style={{ fontWeight: 600, color: statusColor(h.status), minWidth: 130 }}>{h.status.replace(/_/g, ' ')}</span>
                <span style={{ color: '#5b6b74' }}>{h.actorType}</span>
                <span style={{ color: '#a0aec0', marginLeft: 'auto' }}>{new Date(h.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const filterStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
