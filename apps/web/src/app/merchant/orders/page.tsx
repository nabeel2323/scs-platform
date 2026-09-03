'use client';

import { useState, useEffect } from 'react';
import { fetchOrders, acceptMerchantOrder, rejectMerchantOrder, transitionOrderStatus, SubOrder, OrderItem } from '../../../lib/buyer-api';
import { StatusBadge, formatMinor, formatDate, EmptyState, LoadingSpinner, ErrorBanner } from '../../../components/Shared';

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [transitionId, setTransitionId] = useState('');
  const [nextStatus, setNextStatus] = useState('');

  const load = async () => {
    try {
      const data = await fetchOrders();
      setOrders(data as SubOrder[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAccept = async (orderId: string) => {
    setError('');
    try {
      await acceptMerchantOrder(orderId);
      await load();
    } catch (err: any) { setError(err.message || 'Accept failed'); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setError('');
    try {
      await rejectMerchantOrder(rejectId, rejectReason);
      setRejectId('');
      setRejectReason('');
      await load();
    } catch (err: any) { setError(err.message || 'Reject failed'); }
  };

  const handleTransition = async () => {
    if (!nextStatus) return;
    setError('');
    try {
      await transitionOrderStatus(transitionId, nextStatus);
      setTransitionId('');
      setNextStatus('');
      await load();
    } catch (err: any) { setError(err.message || 'Transition failed'); }
  };

  if (loading) return <LoadingSpinner />;

  const pendingOrders = orders.filter(o => o.status === 'SUBMITTED');
  const activeOrders = orders.filter(o => !['SUBMITTED', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status));
  const completedOrders = orders.filter(o => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status));

  const getNextStatuses = (status: string): string[] => {
    const map: Record<string, string[]> = {
      ACCEPTED: ['CONFIRMED'],
      PARTIALLY_ACCEPTED: ['CONFIRMED'],
      CONFIRMED: ['PREPARING'],
      PREPARING: ['READY'],
      READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
      OUT_FOR_DELIVERY: ['DELIVERED'],
      DELIVERED: ['COMPLETED'],
    };
    return map[status] || [];
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 24 }}>Merchant Orders</h1>

      {error && <ErrorBanner message={error} />}

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#92400e', marginBottom: 12 }}>Pending Acceptance ({pendingOrders.length})</h2>
          {pendingOrders.map(order => (
            <div key={order.id} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>Order #{order.id.slice(0, 8)}</div>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>{formatDate(order.createdAt)} · {order.items?.length || 0} items · {formatMinor(order.totalMinor)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAccept(order.id)} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Accept</button>
                  <button onClick={() => setRejectId(order.id)} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>Reject</button>
                </div>
              </div>
              {rejectId === order.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Rejection reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleReject} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setRejectId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active orders */}
      {activeOrders.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Active Orders ({activeOrders.length})</h2>
          {activeOrders.map(order => {
            const nextStatuses = getNextStatuses(order.status);
            return (
              <div key={order.id} style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>Order #{order.id.slice(0, 8)}</div>
                    <div style={{ fontSize: 12, color: '#5b6b74' }}>{formatDate(order.createdAt)} · {formatMinor(order.totalMinor)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={order.status} />
                    {nextStatuses.length > 0 && (
                      <>
                        {nextStatuses.map(ns => (
                          <button key={ns} onClick={() => { setTransitionId(order.id); setNextStatus(ns); }} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                            → {ns.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completedOrders.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#5b6b74', marginBottom: 12 }}>Completed ({completedOrders.length})</h2>
          {completedOrders.map(order => (
            <div key={order.id} style={{ background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, color: '#5b6b74' }}>Order #{order.id.slice(0, 8)}</span>
                <span style={{ fontSize: 12, color: '#a0aec0', marginLeft: 8 }}>{formatDate(order.createdAt)}</span>
              </div>
              <StatusBadge status={order.status} />
            </div>
          ))}
        </div>
      )}

      {orders.length === 0 && <EmptyState title="No orders yet" description="Orders from buyers will appear here." />}
    </div>
  );
}
