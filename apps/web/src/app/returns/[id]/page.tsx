'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchReturn, cancelReturn, markReturnShipped,
  ReturnRequest, ReturnRequestEvent,
} from '../../../lib/buyer-api';
import { useAuth } from '../../../components/AuthProvider';
import { formatDate, LoadingSpinner } from '../../../components/Shared';
import { PageHeader, Breadcrumb, colors, radii } from '@scs/ui-kit';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Pending Review', MERCHANT_APPROVED: 'Approved', BUYER_SHIPPED: 'Shipped Back',
  RECEIVED: 'Received', INSPECTED: 'Inspected', REFUND_PENDING: 'Refund Processing',
  REFUNDED: 'Refunded', MERCHANT_REJECTED: 'Rejected', CANCELLED: 'Cancelled',
  EXPIRED: 'Expired', REJECTED_AFTER_INSPECTION: 'Rejected After Inspection', REFUND_FAILED: 'Refund Failed',
};

const EVENT_LABELS: Record<string, string> = {
  REQUESTED: 'Return requested', MERCHANT_APPROVED: 'Merchant approved',
  MERCHANT_REJECTED: 'Merchant rejected', BUYER_SHIPPED: 'Buyer shipped back',
  RECEIVED: 'Merchant received', INSPECTED: 'Inspection completed',
  REFUND_PENDING: 'Refund processing', REFUNDED: 'Refund completed',
  CANCELLED: 'Return cancelled', EXPIRED: 'Return expired',
  REJECTED_AFTER_INSPECTION: 'Rejected after inspection', REFUND_FAILED: 'Refund failed',
};

export default function ReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const returnId = params['id'] as string;
  const [ret, setRet] = useState<ReturnRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchReturn(returnId)
      .then(setRet)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, returnId]);

  const handleCancel = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await cancelReturn(returnId);
      setRet(updated);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleShipped = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await markReturnShipped(returnId, tracking || undefined);
      setRet(updated);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || loading) return <LoadingSpinner />;
  if (error) return <div style={{ padding: 24, color: '#ef4444' }}>{error}</div>;
  if (!ret) return null;

  const canCancel = ['REQUESTED', 'MERCHANT_APPROVED'].includes(ret.status);
  const canShip = ret.status === 'MERCHANT_APPROVED';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'My Returns', href: '/returns' },
        { label: `Return ${returnId.slice(0, 8)}…` },
      ]} />

      <PageHeader
        title={`Return: ${STATUS_LABELS[ret.status] || ret.status}`}
        subtitle={`Requested ${formatDate(ret.createdAt)}`}
      />

      {/* Status & Amount */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24,
      }}>
        <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <div style={{ fontSize: 12, color: colors.muted }}>Status</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {STATUS_LABELS[ret.status] || ret.status}
          </div>
        </div>
        <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <div style={{ fontSize: 12, color: colors.muted }}>Requested Refund</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {(Number(ret.requestedRefundMinor) / 100).toFixed(2)} SYP
          </div>
          {ret.actualRefundMinor && (
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              Actual: {(Number(ret.actualRefundMinor) / 100).toFixed(2)} SYP
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 14 }}>
          <span style={{ color: colors.muted }}>Reason</span><span>{ret.reason}</span>
          {ret.description && <><span style={{ color: colors.muted }}>Description</span><span>{ret.description}</span></>}
          <span style={{ color: colors.muted }}>Order</span>
          <Link href={`/orders/${ret.subOrderId}`} style={{ color: colors.brand[700] }}>
            {ret.subOrderId.slice(0, 8)}…
          </Link>
          {ret.shippingTrackingNumber && (
            <><span style={{ color: colors.muted }}>Tracking</span><span>{ret.shippingTrackingNumber}</span></>
          )}
          {ret.inspectionCondition && (
            <><span style={{ color: colors.muted }}>Condition</span><span>{ret.inspectionCondition}</span></>
          )}
          {ret.inspectionNotes && (
            <><span style={{ color: colors.muted }}>Inspection Notes</span><span>{ret.inspectionNotes}</span></>
          )}
          {ret.merchantNotes && (
            <><span style={{ color: colors.muted }}>Merchant Notes</span><span>{ret.merchantNotes}</span></>
          )}
        </div>
      </div>

      {/* Items */}
      {ret.items.length > 0 && (
        <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Items</h3>
          {ret.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span>Item {item.orderItemId.slice(0, 8)}…</span>
              <span>Qty: {item.quantity}{item.condition ? ` (${item.condition})` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {(canCancel || canShip) && (
        <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Actions</h3>
          {actionError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{actionError}</div>}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              style={{
                padding: '8px 20px', borderRadius: radii.md, border: 'none',
                background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 14,
              }}
            >
              {actionLoading ? 'Processing…' : 'Cancel Return'}
            </button>
          )}
          {canShip && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Tracking number (optional)"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: radii.md,
                  border: `1px solid ${colors.border}`, fontSize: 14, flex: 1,
                }}
              />
              <button
                onClick={handleShipped}
                disabled={actionLoading}
                style={{
                  padding: '8px 20px', borderRadius: radii.md, border: 'none',
                  background: colors.brand[700], color: '#fff', cursor: 'pointer', fontSize: 14,
                }}
              >
                {actionLoading ? 'Processing…' : 'Mark as Shipped'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Event Timeline */}
      {ret.events.length > 0 && (
        <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Event History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ret.events.map((ev: ReturnRequestEvent) => (
              <div key={ev.id} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ color: colors.muted, minWidth: 140 }}>{formatDate(ev.createdAt)}</span>
                <span style={{ fontWeight: 600 }}>{EVENT_LABELS[ev.eventType] || ev.eventType}</span>
                <span style={{ color: colors.muted }}>{ev.actorType}</span>
                {ev.notes && <span style={{ color: colors.muted }}>{ev.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
