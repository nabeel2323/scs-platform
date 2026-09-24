'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchOrder,
  fetchOrderHistory,
  cancelOrder,
  reorder,
  ReorderResult,
  StatusHistoryEntry,
  OrderItem,
} from '../../../lib/buyer-api';
import { useAuth } from '../../../components/AuthProvider';
import { onOrderStatus, watchOrder } from '../../../lib/realtime';
import { StatusBadge, formatMinor, formatDate, LoadingSpinner, EmptyState } from '../../../components/Shared';
import { OrderTimeline } from '../../../components/OrderTimeline';
import { PageHeader, Breadcrumb, colors, radii } from '@scs/ui-kit';

interface OrderDetail {
  id: string;
  // A4-7: this page shows a sub-order; reorder is addressed by the master order.
  masterOrderId?: string;
  status: string;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  // A2-4: every *_Minor above (and every line item) is expressed in this
  // currency, so it is resolved once for the whole page instead of per amount.
  currency?: string;
  /** False when the code was inferred from the seller, not snapshotted. */
  currencyFromSnapshot?: boolean;
  storeId?: string;
  // A4-6: who shipped this order, named rather than identified by hex.
  storeName?: string;
  storeSlug?: string;
  fulfillmentMethod: string;
  createdAt: string;
  items: OrderItem[];
  financialBreakdown: any;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const orderId = params['id'] as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [reordering, setReordering] = useState(false);
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null);
  const [reorderError, setReorderError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/auth/login?redirect=/orders/${orderId}`);
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
      // A4-6: a swallowed rejection rendered as "Order not found", which sends
      // the buyer to file a support ticket for an order that does exist.
      .catch((err: any) => setLoadError(err.message || 'Could not load this order'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user || authLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user, authLoading]);

  // Live order-status push (WEB-B6): join this order's room and update the badge
  // + timeline in place, replacing manual refresh / polling.
  useEffect(() => {
    if (!orderId || !user) return;
    const unwatch = watchOrder(orderId);
    const off = onOrderStatus((evt) => {
      setOrder((prev) => (prev ? ({ ...prev, status: evt.status } as OrderDetail) : prev));
      fetchOrderHistory(orderId).then(setHistory).catch(() => {});
    }, orderId);
    return () => {
      off();
      unwatch();
    };
  }, [orderId, user]);

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setCancelError('');
    try {
      await cancelOrder(orderId, cancelReason);
      const updated = await fetchOrder(orderId);
      setOrder(updated as any);
      setShowCancel(false);
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel order');
    }
  };

  const handleReorder = async () => {
    if (!order) return;
    setReordering(true);
    setReorderResult(null);
    setReorderError('');
    try {
      // The endpoint keys off the master order — this page is a sub-order, and
      // posting its own id used to 404 before the server learned to resolve it.
      const result = await reorder(order.masterOrderId || orderId);
      setReorderResult(result);
    } catch (err: any) {
      setReorderError(err.message || 'Failed to reorder');
    } finally {
      setReordering(false);
    }
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
        ) : undefined}
      />
    );
  }

  // Currency comes from the sub-order snapshot; a legacy order with no snapshot
  // is labelled as inferred instead of silently shown in the platform default.
  const money = (minor: number) => formatMinor(minor, order.currency);
  const currencyCaveat =
    order.currency === undefined
      ? 'The API reported no currency for this order, so amounts are shown in the platform default.'
      : order.currencyFromSnapshot === false
        ? `Currency was inferred from ${order.storeName || 'the seller'}'s current setting — this order predates currency being recorded on it.`
        : '';

  // Matches the backend cancellable list in orders.service.cancelOrder. Fresh
  // orders sit in PENDING_CONFIRMATION during the merchant's 15-minute review
  // window — the most natural cancel moment; the legacy CONFIRMED status no
  // longer exists in the FSM.
  const canCancel = ['SUBMITTED', 'PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY', 'PAYMENT_PENDING'].includes(order.status);
  const canReorder = ['DELIVERED', 'COMPLETED'].includes(order.status);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title={`Order #${order.id.slice(0, 8)}`}
        subtitle={`${formatDate(order.createdAt)} · ${order.fulfillmentMethod}`}
        breadcrumbs={<Breadcrumb items={[{ label: 'Orders', href: '/orders' }, { label: `#${order.id.slice(0, 8)}` }]} />}
        actions={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <StatusBadge status={order.status} />
            {order.storeName && (
              order.storeSlug
                ? <Link href={`/stores/${order.storeSlug}`} style={{ fontSize: 13, color: '#fff', textDecoration: 'underline' }}>Sold by {order.storeName}</Link>
                : <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Sold by {order.storeName}</span>
            )}
          </div>
        }
      />
      <div style={{ padding: '20px 24px 48px' }}>

      {/* A4-5: post-checkout success feedback — the outbox emits
          order.pending_confirmation after ~15s, but the buyer UI never told
          the story. Show an SLA banner while the order is in the merchant's
          review window so the buyer knows what to expect. */}
      {(order.status === 'SUBMITTED' || order.status === 'PENDING_CONFIRMATION') && (
        <div
          style={{
            background: colors.okBg,
            border: `1px solid ${colors.okBorder}`,
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>✓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.ok }}>
              Order placed successfully
            </div>
            <div style={{ fontSize: 13, color: colors.ok, marginTop: 2 }}>
              {order.storeName || 'The merchant'} will review your order and confirm within 15 minutes.
              You can cancel anytime before confirmation.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Left column */}
        <div>
          {/* Items */}
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, fontSize: 14, fontWeight: 600, color: colors.brand[700] }}>Items</div>
            {order.items.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f6', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, color: colors.brand[700] }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: colors.muted }}>SKU: {item.sku} · Qty: {item.quantity}{item.qtyConfirmed != null ? ` (Confirmed: ${item.qtyConfirmed})` : ''}</div>
                  {(item as any).offer && (
                    <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      Offer status: {(item as any).offer.status}
                      {(item as any).offer.leadTimeDays != null && ` · Lead: ${(item as any).offer.leadTimeDays}d`}
                      {(item as any).offer.moq > 1 && ` · MOQ: ${(item as any).offer.moq}`}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.brand[700] }}>{money(item.lineTotalMinor)}</div>
              </div>
            ))}
          </div>

          {/* Financial breakdown */}
          {order.financialBreakdown && (
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.brand[700], marginBottom: 12 }}>Financial Breakdown</div>
              {[
                ['Subtotal', order.subtotalMinor],
                ['Discount', -order.discountMinor],
                ['Delivery', order.deliveryFeeMinor],
                ['Tax', order.taxMinor],
              ].filter(([, v]) => v !== 0).map(([label, val]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                  <span>{label}</span>
                  <span>{money(val as number)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: colors.brand[700], borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 8 }}>
                <span>Total</span>
                <span>{money(order.totalMinor)}</span>
              </div>
              {currencyCaveat && (
                // Say so rather than let a SAR-looking number pass for a record.
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>
                  {currencyCaveat}
                </div>
              )}
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
              <button onClick={handleReorder} disabled={reordering} style={{ padding: '8px 16px', fontSize: 13, background: colors.brand[700], color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: reordering ? 0.6 : 1 }}>
                {reordering ? 'Reordering…' : 'Reorder'}
              </button>
            )}
          </div>
          {/* A4-7: reorder is per-line — some items may no longer be purchasable,
              so say what happened instead of dropping the buyer on an empty cart. */}
          {reorderError && (
            <div role="alert" style={{ background: colors.errBg, border: `1px solid ${colors.errBorder}`, borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: colors.err }}>
              {reorderError}
            </div>
          )}
          {reorderResult && (
            <div style={{ background: reorderResult.added.length > 0 ? '#ecfdf5' : '#fffbeb', border: `1px solid ${reorderResult.added.length > 0 ? '#6ee7b7' : '#fcd34d'}`, borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#0f3340' }}>
              {reorderResult.added.length > 0
                ? `${reorderResult.added.length} item(s) added to your cart`
                : 'Nothing could be re-added from this order'}
              {reorderResult.skipped.length > 0 && (
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
                  Unavailable: {reorderResult.skipped.map(s => `${s.title} — ${s.reason}`).join(' · ')}
                </div>
              )}
              <Link href="/cart" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 600, color: '#0f3340', textDecoration: 'underline' }}>
                Review cart
              </Link>
            </div>
          )}
          {showCancel && (
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.err, marginBottom: 8 }}>Reason for cancellation</div>
              {cancelError && <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{cancelError}</div>}
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} style={{ width: '100%', padding: 8, border: `1px solid ${colors.border}`, borderRadius: 4, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCancel} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: colors.err, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm Cancel</button>
                <button onClick={() => setShowCancel(false)} style={{ padding: '6px 16px', fontSize: 12, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, cursor: 'pointer' }}>Back</button>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Timeline */}
        <div>
          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.brand[700], marginBottom: 12 }}>Order Timeline</div>
            <OrderTimeline history={history} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
