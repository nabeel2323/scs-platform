'use client';

/**
 * Order Detail Page — professional order detail view for Admin.
 *
 * Route: /orders/[id]
 * Shows order summary, items, financials, and status history.
 */
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { cancelAdminOrder, fetchAdminOrderDetail, type AdminOrderDetail } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminEntityLink,
  AdminCopyButton,
  AdminRelatedTable,
  AdminAuditTimeline,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  formatCurrency,
  type KVItem,
  type RelatedColumn,
  type TimelineEntry,
} from '../../../components/detail';

const CANCELLABLE_ORDER_STATUSES = [
  'PENDING_CONFIRMATION',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
  'PREPARING',
  'READY',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'OUT_FOR_DELIVERY',
];
const CANCELLATION_REASONS = [
  'CUSTOMER_REQUEST',
  'DUPLICATE_ORDER',
  'MERCHANT_UNABLE_TO_FULFILL',
  'OUT_OF_STOCK',
  'PRICE_ERROR',
  'ADDRESS_PROBLEM',
  'PAYMENT_PROBLEM',
  'CARRIER_PROBLEM',
  'SYSTEM_ERROR',
  'ADMINISTRATIVE',
  'OTHER',
];

function OrderDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['admin:orders:read']);
  const { hasAccess: canCancelOrder } = useRequirePerms(['orders:cancel']);
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [cancelReason, setCancelReason] = useState('ADMINISTRATIVE');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    fetchAdminOrderDetail(id)
      .then((data) => {
        setOrder(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load order');
        setLoading(false);
      });
  }, [id, ready, hasAccess]);

  const handleCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || !canCancelOrder) return;
    if (cancelReason === 'OTHER' && !cancelNotes.trim()) {
      setActionError('Add explanatory notes when the reason is Other.');
      return;
    }
    if (
      !window.confirm(
        `Cancel order ${id.slice(0, 12)}? This will release stock and synchronize its shipment.`,
      )
    )
      return;

    setCancelLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      await cancelAdminOrder(id, { reason: cancelReason, notes: cancelNotes.trim() || undefined });
      setOrder(await fetchAdminOrderDetail(id));
      setActionSuccess('Order cancelled successfully.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setCancelLoading(false);
    }
  };

  if (!ready) return <AdminLoadingSkeleton kvRows={8} />;
  if (!hasAccess)
    return (
      <div style={{ padding: 32, color: '#991b1b' }}>
        Access denied. Required: admin:orders:read
      </div>
    );
  if (loading) return <AdminLoadingSkeleton kvRows={8} />;
  if (error) return <AdminErrorState title="Unable to load order" message={error} />;
  if (!order) return null;

  const currency = order.currency;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'items', label: `Items (${order.items.length})` },
    { key: 'financials', label: 'Financials' },
    { key: 'history', label: `Status History (${order.history.length})` },
  ];

  const overviewItems: KVItem[] = [
    {
      key: 'orderId',
      label: 'Order ID',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
          <AdminCopyButton value={id} label="" />
        </span>
      ),
    },
    { key: 'status', label: 'Status', value: <AdminStatusBadge status={order.status} /> },
    {
      key: 'buyerId',
      label: 'Buyer',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.buyerId}</span>
          <AdminCopyButton value={order.buyerId} label="" />
        </span>
      ),
    },
    {
      key: 'storeId',
      label: 'Store',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.storeId}</span>
          <AdminCopyButton value={order.storeId} label="" />
        </span>
      ),
    },
    { key: 'fulfillmentMethod', label: 'Fulfillment', value: order.fulfillmentMethod || '—' },
    { key: 'totalMinor', label: 'Total', value: formatCurrency(order.totalMinor, currency) },
    {
      key: 'masterOrderId',
      label: 'Master Order',
      value: order.masterOrderId ? (
        <AdminEntityLink
          type="order"
          id={order.masterOrderId}
          name={order.masterOrderId.slice(0, 12) + '…'}
          showIcon
        />
      ) : (
        'None (standalone)'
      ),
    },
    { key: 'createdAt', label: 'Created', value: formatDate(order.createdAt) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(order.updatedAt) },
  ];

  const financialItems: KVItem[] = [
    {
      key: 'subtotalMinor',
      label: 'Subtotal',
      value: formatCurrency(order.subtotalMinor, currency),
    },
    {
      key: 'deliveryFeeMinor',
      label: 'Delivery Fee',
      value: formatCurrency(order.deliveryFeeMinor, currency),
    },
    {
      key: 'totalMinor',
      label: 'Total',
      value: <strong>{formatCurrency(order.totalMinor, currency)}</strong>,
    },
    { key: 'currency', label: 'Currency', value: currency },
  ];

  // Items table columns
  const itemColumns: RelatedColumn[] = [
    {
      key: 'productId',
      label: 'Product',
      render: (_val, row) => {
        const pid = String(row['productId'] || '');
        return pid ? (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{pid.slice(0, 12)}…</span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'variantId',
      label: 'Variant',
      render: (_val, row) => {
        const vid = row['variantId'];
        return vid ? (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(vid).slice(0, 12)}…</span>
        ) : (
          '—'
        );
      },
    },
    { key: 'quantity', label: 'Qty', render: (_val, row) => String(row['quantity'] ?? '—') },
    {
      key: 'unitPriceMinor',
      label: 'Unit Price',
      render: (_val, row) => formatCurrency(row['unitPriceMinor'] as number, currency),
    },
    {
      key: 'totalPriceMinor',
      label: 'Line Total',
      render: (_val, row) => (
        <strong>{formatCurrency(row['totalPriceMinor'] as number, currency)}</strong>
      ),
    },
  ];

  // Status history timeline
  const timelineEntries: TimelineEntry[] = order.history.map((h) => ({
    id: h.id,
    timestamp: h.createdAt,
    actor: h.changedBy || h.actorType || 'System',
    action: `${h.fromStatus || '—'} → ${h.toStatus}`,
    detail: h.reason || undefined,
  }));

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Orders', href: '/orders' }]}
        backLabel="Back to Orders"
        backHref="/orders"
        title={`Order #${id.slice(0, 12)}`}
        subtitle={
          <>
            <span>{formatCurrency(order.totalMinor, currency)}</span>
            <span style={{ color: '#d9e2e6' }}> · </span>
            <span>{formatDate(order.createdAt)}</span>
          </>
        }
        status={order.status}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {actionSuccess && (
          <p role="status" style={{ color: '#166534', margin: 0 }}>
            {actionSuccess}
          </p>
        )}
        {actionError && (
          <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
            {actionError}
          </p>
        )}
        {canCancelOrder && CANCELLABLE_ORDER_STATUSES.includes(order.status) && (
          <AdminDetailSection title="Order actions">
            <form onSubmit={handleCancel} style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Cancellation reason
                <select
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  disabled={cancelLoading}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: '#fff',
                  }}
                >
                  {CANCELLATION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Notes {cancelReason === 'OTHER' ? '(required)' : '(optional)'}
                <textarea
                  value={cancelNotes}
                  onChange={(event) => setCancelNotes(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  required={cancelReason === 'OTHER'}
                  disabled={cancelLoading}
                  placeholder="Add context for the order audit history"
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    resize: 'vertical',
                  }}
                />
              </label>
              <div>
                <button
                  type="submit"
                  disabled={cancelLoading || (cancelReason === 'OTHER' && !cancelNotes.trim())}
                  style={{
                    padding: '9px 16px',
                    border: 0,
                    borderRadius: 6,
                    background: '#b91c1c',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: cancelLoading ? 'wait' : 'pointer',
                    opacity: cancelLoading ? 0.65 : 1,
                  }}
                >
                  {cancelLoading ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </form>
          </AdminDetailSection>
        )}
        {activeTab === 'overview' && (
          <AdminDetailSection title="Order Summary">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'items' && (
          <AdminDetailSection title={`Order Items (${order.items.length})`}>
            {order.items.length > 0 ? (
              <AdminRelatedTable
                columns={itemColumns}
                data={order.items as unknown as Record<string, unknown>[]}
              />
            ) : (
              <AdminEmptyState title="No items" description="This order has no line items." />
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'financials' && (
          <AdminDetailSection title="Financial Summary">
            <AdminKeyValueGrid items={financialItems} />
            {/* Delivery address */}
            {order.deliveryAddress && Object.keys(order.deliveryAddress).length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  background: '#f7f9fa',
                  borderRadius: 8,
                  border: '1px solid #e5ecf0',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f3340', marginBottom: 6 }}>
                  Delivery Address
                </div>
                <div style={{ fontSize: 13, color: '#5b6b74', lineHeight: 1.6 }}>
                  {Object.entries(order.deliveryAddress)
                    .filter(([, v]) => v != null && v !== '')
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(', ')}
                </div>
              </div>
            )}
            {order.notes && (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  background: '#fffbeb',
                  borderRadius: 8,
                  border: '1px solid #fde68a',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                  Order Notes
                </div>
                <div style={{ fontSize: 13, color: '#78350f' }}>{order.notes}</div>
              </div>
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'history' && (
          <AdminDetailSection title="Status History">
            {timelineEntries.length > 0 ? (
              <AdminAuditTimeline entries={timelineEntries} />
            ) : (
              <AdminEmptyState
                title="No history"
                description="This order has no status change history."
              />
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return (
    <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}>
      <OrderDetailContent id={id} />
    </Suspense>
  );
}
