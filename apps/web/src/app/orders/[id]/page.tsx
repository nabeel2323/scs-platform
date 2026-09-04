'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { fetchOrder, fetchOrderHistory, cancelOrder, reorder, StatusHistoryEntry, OrderItem } from '../../../lib/buyer-api';
import { StatusBadge, formatMinor, formatDate, LoadingSpinner, EmptyState } from '../../../components/Shared';
import { OrderTimeline } from '../../../components/OrderTimeline';

interface OrderDetail {
  id: string;
  status: string;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  fulfillmentMethod: string;
  createdAt: string;
  items: OrderItem[];
  financialBreakdown: any;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params['id'] as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchOrder(orderId).then(setOrder as any),
      fetchOrderHistory(orderId).then(setHistory),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [orderId]);

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    await cancelOrder(orderId, cancelReason);
    const updated = await fetchOrder(orderId);
    setOrder(updated as any);
    setShowCancel(false);
  };

  const handleReorder = async () => {
    try {
      await reorder(orderId);
      window.location.href = '/cart';
    } catch (err: any) {
      alert(err.message || 'Failed to reorder');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!order) return <EmptyState title="Order not found" />;

  const canCancel = ['SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status);
  const canReorder = ['DELIVERED', 'COMPLETED'].includes(order.status);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Order #{order.id.slice(0, 8)}</h1>
          <div style={{ fontSize: 13, color: '#5b6b74' }}>{formatDate(order.createdAt)} · {order.fulfillmentMethod}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Left column */}
        <div>
          {/* Items */}
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #d9e2e6', fontSize: 14, fontWeight: 600, color: '#0f3340' }}>Items</div>
            {order.items.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f6', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#0f3340' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>SKU: {item.sku} · Qty: {item.quantity}{item.qtyConfirmed != null ? ` (Confirmed: ${item.qtyConfirmed})` : ''}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>{formatMinor(item.lineTotalMinor)}</div>
              </div>
            ))}
          </div>

          {/* Financial breakdown */}
          {order.financialBreakdown && (
            <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Financial Breakdown</div>
              {[
                ['Subtotal', order.subtotalMinor],
                ['Discount', -order.discountMinor],
                ['Delivery', order.deliveryFeeMinor],
                ['Tax', order.taxMinor],
              ].filter(([, v]) => v !== 0).map(([label, val]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5b6b74', marginBottom: 4 }}>
                  <span>{label}</span>
                  <span>{formatMinor(val as number)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#0f3340', borderTop: '1px solid #d9e2e6', paddingTop: 8, marginTop: 8 }}>
                <span>Total</span>
                <span>{formatMinor(order.totalMinor)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canCancel && !showCancel && (
              <button onClick={() => setShowCancel(true)} style={{ padding: '8px 16px', fontSize: 13, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>
                Cancel Order
              </button>
            )}
            {canReorder && (
              <button onClick={handleReorder} style={{ padding: '8px 16px', fontSize: 13, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                Reorder
              </button>
            )}
          </div>
          {showCancel && (
            <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>Reason for cancellation</div>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} style={{ width: '100%', padding: 8, border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCancel} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm Cancel</button>
                <button onClick={() => setShowCancel(false)} style={{ padding: '6px 16px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Back</button>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Timeline */}
        <div>
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Order Timeline</div>
            <OrderTimeline history={history} />
          </div>
        </div>
      </div>
    </div>
  );
}
