'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchOrders, SubOrder } from '../../lib/buyer-api';
import { StatusBadge, formatMinor, formatDate, EmptyState, LoadingSpinner, ErrorBanner } from '../../components/Shared';

export default function OrdersPage() {
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetchOrders(filter ? { status: filter } : undefined)
      .then(data => { setError(''); setOrders(data as SubOrder[]); })
      // A4-6: a failed fetch used to be swallowed, leaving an empty list that
      // reads exactly like "you have never ordered".
      .catch((err: any) => setError(err.message || 'Could not load your orders'))
      .finally(() => setLoading(false));
  }, [filter, reload]);

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>My Orders</h1>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            {/* Canonical order statuses per orders.service TRANSITIONS; DRAFT is internal-only */}
            <option value="">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="PENDING_CONFIRMATION">Pending Confirmation</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="PARTIALLY_ACCEPTED">Partially Accepted</option>
            <option value="REJECTED">Rejected</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="PICKED_UP">Picked Up</option>
            <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
            <option value="DELIVERED">Delivered</option>
            <option value="COMPLETED">Completed</option>
            <option value="PAYMENT_PENDING">Payment Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="DISPUTED">Disputed</option>
          </select>
        </div>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {error && orders.length > 0 && <ErrorBanner message={`${error} — showing the last loaded list`} />}

      {orders.length === 0 ? (
        // Saying "no orders yet" while the request failed would send the buyer
        // off to browse instead of to retry.
        <EmptyState
          title={error ? 'Orders unavailable' : 'No orders yet'}
          description={error || 'Place your first order from a store.'}
          action={error ? (
            <button onClick={() => setReload(r => r + 1)} style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Try Again</button>
          ) : (
            <Link href="/stores" style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Browse Stores</Link>
          )}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(order => (
            <Link key={order.id} href={`/orders/${order.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>
                    Order #{order.id.slice(0, 8)}
                  </div>
                  {/* A4-6: which supplier this sub-order belongs to, named. */}
                  <div style={{ fontSize: 12, color: '#5b6b74', marginBottom: 2 }}>
                    {order.storeName ? `Sold by ${order.storeName}` : 'Seller unavailable'}
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>
                    {formatDate(order.createdAt)} · {order.itemCount ?? 0} {order.itemCount === 1 ? 'item' : 'items'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>{formatMinor(order.totalMinor, order.currency)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
