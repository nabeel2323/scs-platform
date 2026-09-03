'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchOrders, SubOrder } from '../../lib/buyer-api';
import { StatusBadge, formatMinor, formatDate, EmptyState, LoadingSpinner } from '../../components/Shared';

export default function OrdersPage() {
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchOrders(filter ? { status: filter } : undefined)
      .then(data => setOrders(data as SubOrder[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340' }}>My Orders</h1>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PREPARING">Preparing</option>
          <option value="READY">Ready</option>
          <option value="DELIVERED">Delivered</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Place your first order from a store." action={<Link href="/stores" style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Browse Stores</Link>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(order => (
            <Link key={order.id} href={`/orders/${order.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>
                    Order #{order.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>
                    {formatDate(order.createdAt)} · {order.items?.length || 0} items
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>{formatMinor(order.totalMinor)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
