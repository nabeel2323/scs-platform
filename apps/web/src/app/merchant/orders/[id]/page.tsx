'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchOrder,
  fetchOrderHistory,
  acceptMerchantOrder,
  rejectMerchantOrder,
  transitionOrderStatus,
  fetchMerchantCustomersCached,
  OrderItem,
  StatusHistoryEntry,
} from '../../../../lib/buyer-api';
import { useAuth } from '../../../../components/AuthProvider';
import { StatusBadge, formatMinor, formatDate, LoadingSpinner, EmptyState } from '../../../../components/Shared';
import { OrderTimeline } from '../../../../components/OrderTimeline';

interface OrderDetail {
  id: string;
  masterOrderId?: string;
  status: string;
  storeId: string;
  buyerId: string;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  currency?: string;
  currencyFromSnapshot?: boolean;
  storeName?: string;
  storeSlug?: string;
  fulfillmentMethod: string;
  createdAt: string;
  items: OrderItem[];
  financialBreakdown: {
    productsMinor: number;
    discountMinor: number;
    deliveryFeeMinor: number;
    taxMinor: number;
    commissionMinor: number;
    merchantNetMinor: number;
  } | null;
}

// Mirrors the backend FSM matrix (orders.service TRANSITIONS).
const NEXT_STATUS_MAP: Record<string, string[]> = {
  ACCEPTED: ['PREPARING'],
  PARTIALLY_ACCEPTED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
};

const MERCHANT_CANCELLABLE = ['PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY'];

export default function MerchantOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const orderId = params['id'] as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Buyer identity resolved from the org customers directory (cached); the
  // order payload itself only carries buyerId.
  const [buyer, setBuyer] = useState<{ name: string | null; phone: string | null } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/auth/login?redirect=/merchant/orders/${orderId}`);
      return;
    }
  }, [user, authLoading, router, orderId]);

  const load = () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    Promise.all([
      fetchOrder(orderId).then(setOrder as any),
      fetchOrderHistory(orderId).then(setHistory),
    ])
      .catch((err: any) => setLoadError(err.message || 'Could not load this order'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user || authLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user, authLoading]);

  // Resolve the buyer's name/phone once the order (and its buyerId) is known.
  // Best-effort: a directory failure leaves the ID chip as the label.
  useEffect(() => {
    const buyerId = order?.buyerId;
    if (!buyerId) return;
    let cancelled = false;
    fetchMerchantCustomersCached()
      .then((list) => {
        if (cancelled) return;
        const b = list.find((c) => c.buyerId === buyerId);
        if (b) setBuyer({ name: b.buyerName, phone: b.buyerPhone });
      })
      .catch(() => { /* degrade to the ID chip */ });
    return () => { cancelled = true; };
  }, [order?.buyerId]);

  const reload = async () => {
    try {
      const updated = await fetchOrder(orderId);
      setOrder(updated as any);
      const h = await fetchOrderHistory(orderId);
      setHistory(h);
    } catch { /* ignore — the user can retry */ }
  };

  const handleAccept = async () => {
    setBusy(true);
    setActionError('');
    try {
      await acceptMerchantOrder(orderId);
      await reload();
    } catch (err: any) { setActionError(err.message || 'Accept failed'); }
    finally { setBusy(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      await rejectMerchantOrder(orderId, rejectReason);
      setRejectOpen(false);
      setRejectReason('');
      await reload();
    } catch (err: any) { setActionError(err.message || 'Reject failed'); }
    finally { setBusy(false); }
  };

  const handleTransition = async (status: string) => {
    setBusy(true);
    setActionError('');
    try {
      await transitionOrderStatus(orderId, status);
      await reload();
    } catch (err: any) { setActionError(err.message || 'Transition failed'); }
    finally { setBusy(false); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      await transitionOrderStatus(orderId, 'CANCELLED', cancelReason);
      setCancelOpen(false);
      setCancelReason('');
      await reload();
    } catch (err: any) { setActionError(err.message || 'Cancel failed'); }
    finally { setBusy(false); }
  };

  if (authLoading || !user) return <LoadingSpinner />;
  if (loading) return <LoadingSpinner />;
  if (!order) {
    return (
      <EmptyState
        title={loadError ? 'Order unavailable' : 'Order not found'}
        description={loadError || undefined}
        action={loadError ? (
          <button onClick={load} style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Try Again</button>
        ) : (
          <Link href="/merchant/orders" style={{ display: 'inline-block', padding: '8px 20px', background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Back to Orders</Link>
        )}
      />
    );
  }

  const money = (minor: number) => formatMinor(minor, order.currency);
  const nextStatuses = NEXT_STATUS_MAP[order.status] || [];
  const canCancel = MERCHANT_CANCELLABLE.includes(order.status);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              <Link href="/merchant/orders" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>&larr; All Orders</Link>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Order #{order.id.slice(0, 8)}</h1>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {formatDate(order.createdAt)} &middot; {order.fulfillmentMethod.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>
              Buyer: {buyer?.name
                ? <span style={{ fontWeight: 600 }}>{buyer.name}</span>
                : <code style={{ fontSize: 12, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{order.buyerId.slice(0, 8)}</code>}
              {buyer?.phone && <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{buyer.phone}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <StatusBadge status={order.status} />
            <div style={{ fontSize: 18, fontWeight: 700 }}>{money(order.totalMinor)}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px 48px' }}>
        {actionError && (
          <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
            {actionError}
          </div>
        )}

        {/* Merchant Actions */}
        {(nextStatuses.length > 0 || canCancel || ['SUBMITTED', 'PENDING_CONFIRMATION'].includes(order.status)) && (
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Actions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['SUBMITTED', 'PENDING_CONFIRMATION'].includes(order.status) && (
                <>
                  <button onClick={handleAccept} disabled={busy} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Processing…' : 'Accept Order'}
                  </button>
                  <button onClick={() => { setRejectOpen(true); setCancelOpen(false); }} disabled={busy} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>
                    Reject Order
                  </button>
                </>
              )}
              {nextStatuses.map(ns => (
                <button key={ns} onClick={() => handleTransition(ns)} disabled={busy} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                  → {ns.replace(/_/g, ' ')}
                </button>
              ))}
              {canCancel && !['SUBMITTED', 'PENDING_CONFIRMATION'].includes(order.status) && (
                <button onClick={() => { setCancelOpen(true); setRejectOpen(false); }} disabled={busy} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>
                  Cancel Order
                </button>
              )}
            </div>

            {rejectOpen && (
              <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>Rejection reason</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Why are you rejecting this order?" value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleReject} disabled={busy} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm Reject</button>
                  <button onClick={() => setRejectOpen(false)} style={{ padding: '8px 16px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            )}

            {cancelOpen && (
              <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>Cancellation reason</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Why are you cancelling this order?" value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleCancel} disabled={busy} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm Cancel</button>
                  <button onClick={() => setCancelOpen(false)} style={{ padding: '8px 16px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          {/* Left column — Items + Financial */}
          <div>
            {/* Items */}
            <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #d9e2e6', fontSize: 14, fontWeight: 600, color: '#0f3340' }}>
                Items ({order.items.length})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f4f6' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase' }}>Product</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase' }}>Qty</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase' }}>Confirmed</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase' }}>Unit Price</th>
                    <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase' }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f0f4f6' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340' }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#5b6b74' }}>SKU: {item.sku}</div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, color: '#0f3340' }}>{item.quantity}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 14, color: item.qtyConfirmed != null ? '#065f46' : '#94a3b8' }}>
                        {item.qtyConfirmed != null ? item.qtyConfirmed : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, color: '#0f3340' }}>{money(item.unitPriceMinor)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#0f3340' }}>{money(item.lineTotalMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Breakdown */}
            {order.financialBreakdown && (
              <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Financial Breakdown</div>
                {[
                  ['Products', order.financialBreakdown.productsMinor],
                  ['Discount', -order.financialBreakdown.discountMinor],
                  ['Delivery', order.financialBreakdown.deliveryFeeMinor],
                  ['Tax', order.financialBreakdown.taxMinor],
                ].filter(([, v]) => v !== 0).map(([label, val]) => (
                  <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5b6b74', marginBottom: 4 }}>
                    <span>{label}</span>
                    <span>{money(val as number)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#0f3340', borderTop: '1px solid #d9e2e6', paddingTop: 8, marginTop: 8 }}>
                  <span>Order Total</span>
                  <span>{money(order.totalMinor)}</span>
                </div>
                {/* Merchant-specific financials */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #d9e2e6' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 6, textTransform: 'uppercase' }}>Your Revenue</div>
                  {[
                    ['Platform Commission', -order.financialBreakdown.commissionMinor],
                    ['Net Revenue', order.financialBreakdown.merchantNetMinor],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: label === 'Net Revenue' ? '#065f46' : '#5b6b74', fontWeight: label === 'Net Revenue' ? 600 : 400, marginBottom: 2 }}>
                      <span>{label}</span>
                      <span>{money(val as number)}</span>
                    </div>
                  ))}
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
    </div>
  );
}
