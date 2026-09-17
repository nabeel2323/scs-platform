'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchOrders, acceptMerchantOrder, rejectMerchantOrder, transitionOrderStatus, SubOrder, OrderItem } from '../../../lib/buyer-api';
import { fetchMyStores, Store } from '../../../lib/api';
import { pickStore, rememberStoreId } from '../../../lib/merchant-store';
import { StatusBadge, formatMinor, formatDate, EmptyState, LoadingSpinner, ErrorBanner } from '../../../components/Shared';

// Merchant cancellation is a transition to CANCELLED via merchant:orders:write —
// the backend FSM allows it from PENDING_CONFIRMATION through READY
// (orders.service TRANSITIONS). Merchants do not hold orders:cancel, so the
// dedicated /orders/:id/cancel endpoint is not available to them.
const MERCHANT_CANCELLABLE = ['PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY'];
const isCancellable = (status: string) => MERCHANT_CANCELLABLE.includes(status);

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [noStore, setNoStore] = useState(false);
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [cancelId, setCancelId] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const load = async (sid: string) => {
    try {
      const data = await fetchOrders({ storeId: sid });
      setOrders(data as SubOrder[]);
      setError('');
    } catch (err: any) {
      // An empty queue and an unreadable queue are different answers to a
      // merchant about to stop watching the screen.
      setError(err.message || 'Could not load orders for this store');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchMyStores();
        setStores(list);
        const s = pickStore(list);
        if (!s) { setNoStore(true); setLoading(false); return; }
        setStoreId(s.id);
        setStoreName(s.displayName);
        await load(s.id);
      } catch { setLoading(false); }
    })();
  }, []);

  // A2-1: a merchant can own several stores per organization, and
  // GET /v1/stores is already scoped to the active org, so the switcher can only
  // reach stores this caller actually manages. The choice is remembered so the
  // other merchant pages (catalog, inventory, pricing) open on the same store.
  const handleSwitchStore = async (sid: string) => {
    const next = stores.find((s) => s.id === sid);
    if (!next || sid === storeId) return;
    rememberStoreId(sid);
    setStoreId(sid);
    setStoreName(next.displayName);
    setRejectId('');
    setCancelId('');
    setLoading(true);
    await load(sid);
  };

  const handleAccept = async (orderId: string) => {
    setError('');
    try {
      await acceptMerchantOrder(orderId);
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Accept failed'); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setError('');
    try {
      await rejectMerchantOrder(rejectId, rejectReason);
      setRejectId('');
      setRejectReason('');
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Reject failed'); }
  };

  const handleTransition = async (orderId: string, status: string) => {
    setError('');
    try {
      await transitionOrderStatus(orderId, status);
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Transition failed'); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setError('');
    try {
      await transitionOrderStatus(cancelId, 'CANCELLED', cancelReason);
      setCancelId('');
      setCancelReason('');
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Cancel failed'); }
  };

  if (loading) return <LoadingSpinner />;

  // SUBMITTED auto-advances to PENDING_CONFIRMATION seconds after checkout, so
  // both statuses mean "waiting for the merchant to respond".
  const pendingOrders = orders.filter(o => ['SUBMITTED', 'PENDING_CONFIRMATION'].includes(o.status));
  const activeOrders = orders.filter(o => !['SUBMITTED', 'PENDING_CONFIRMATION', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status));
  const completedOrders = orders.filter(o => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status));

  // Mirrors the backend FSM matrix (orders.service TRANSITIONS); the legacy
  // CONFIRMED status no longer exists. CANCELLED renders through the dedicated
  // Cancel button (with reason prompt) instead of a bare transition button.
  const getNextStatuses = (status: string): string[] => {
    const map: Record<string, string[]> = {
      ACCEPTED: ['PREPARING'],
      PARTIALLY_ACCEPTED: ['PREPARING'],
      PREPARING: ['READY'],
      READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
      OUT_FOR_DELIVERY: ['DELIVERED'],
      DELIVERED: ['COMPLETED'],
    };
    return map[status] || [];
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Merchant Orders</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          {storeName ? `Incoming orders for ${storeName}` : 'Manage incoming orders'}
        </p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {stores.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <label htmlFor="store-switcher" style={{ fontSize: 13, color: '#5b6b74' }}>
            Store
          </label>
          <select
            id="store-switcher"
            value={storeId}
            onChange={(e) => handleSwitchStore(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#0f3340' }}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} · {s.verificationStatus}
              </option>
            ))}
          </select>
        </div>
      )}

      {noStore && (
        <EmptyState
          title="No store yet"
          description="Complete onboarding to create your store and start receiving orders."
          action={<Link href="/merchant/onboard" style={{ display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' }}>Onboard a Store</Link>}
        />
      )}

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#92400e', marginBottom: 12 }}>Pending Acceptance ({pendingOrders.length})</h2>
          {pendingOrders.map(order => (
            <div key={order.id} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>Order #{order.id.slice(0, 8)}</div>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>{formatDate(order.createdAt)} · {order.itemCount ?? 0} {order.itemCount === 1 ? 'item' : 'items'} · {formatMinor(order.totalMinor, order.currency)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAccept(order.id)} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Accept</button>
                  <button onClick={() => { setRejectId(order.id); setRejectReason(''); setCancelId(''); }} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>Reject</button>
                  {isCancellable(order.status) && (
                    <button onClick={() => { setCancelId(order.id); setCancelReason(''); setRejectId(''); }} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                  )}
                </div>
              </div>
              {rejectId === order.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Rejection reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleReject} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setRejectId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                </div>
              )}
              {cancelId === order.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Cancellation reason..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleCancel} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setCancelId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
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
                    <div style={{ fontSize: 12, color: '#5b6b74' }}>{formatDate(order.createdAt)} · {formatMinor(order.totalMinor, order.currency)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={order.status} />
                    {nextStatuses.filter(ns => ns !== 'CANCELLED').map(ns => (
                      <button key={ns} onClick={() => handleTransition(order.id, ns)} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        → {ns.replace(/_/g, ' ')}
                      </button>
                    ))}
                    {isCancellable(order.status) && (
                      <button onClick={() => { setCancelId(order.id); setCancelReason(''); }} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                    )}
                  </div>
                </div>
                {cancelId === order.id && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Cancellation reason..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                    <button onClick={handleCancel} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                    <button onClick={() => setCancelId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                  </div>
                )}
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

      {!noStore && orders.length === 0 && <EmptyState title="No orders yet" description="Orders from buyers will appear here." />}
      </div>
    </div>
  );
}
