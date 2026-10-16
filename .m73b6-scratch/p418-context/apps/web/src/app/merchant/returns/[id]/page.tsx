'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  fetchReturn, approveReturn, rejectReturn, receiveReturn,
  inspectReturn, rejectReturnAfterInspection,
  ReturnRequest, ReturnRequestEvent,
} from '../../../../lib/buyer-api';
import { useAuth } from '../../../../components/AuthProvider';
import { formatDate, LoadingSpinner } from '../../../../components/Shared';
import { PageHeader, Breadcrumb, colors, radii } from '@scs/ui-kit';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Pending Review', MERCHANT_APPROVED: 'Approved', BUYER_SHIPPED: 'Shipped Back',
  RECEIVED: 'Received', INSPECTED: 'Inspected', REFUND_PENDING: 'Refund Processing',
  REFUNDED: 'Refunded', MERCHANT_REJECTED: 'Rejected', CANCELLED: 'Cancelled',
  EXPIRED: 'Expired', REJECTED_AFTER_INSPECTION: 'Rejected After Inspection', REFUND_FAILED: 'Refund Failed',
};

const CONDITIONS = ['GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE'];

export default function MerchantReturnDetailPage() {
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const returnId = params['id'] as string;
  const [ret, setRet] = useState<ReturnRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [inspectCondition, setInspectCondition] = useState('GOOD');
  const [inspectNotes, setInspectNotes] = useState('');

  const load = () => {
    setLoading(true);
    fetchReturn(returnId)
      .then(setRet)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (user) load(); }, [user, returnId]);

  const doAction = async (fn: () => Promise<ReturnRequest>) => {
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await fn();
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

  const canApprove = ret.status === 'REQUESTED';
  const canReceive = ret.status === 'BUYER_SHIPPED';
  const canInspect = ret.status === 'RECEIVED';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <Breadcrumb items={[
        { label: 'Returns', href: '/merchant/returns' },
        { label: `Return ${returnId.slice(0, 8)}…` },
      ]} />

      <PageHeader
        title={`Return: ${STATUS_LABELS[ret.status] || ret.status}`}
        subtitle={`Order ${ret.subOrderId.slice(0, 8)}… · ${formatDate(ret.createdAt)}`}
      />

      {/* Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <div style={{ fontSize: 11, color: colors.muted }}>Status</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{STATUS_LABELS[ret.status] || ret.status}</div>
        </div>
        <div style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <div style={{ fontSize: 11, color: colors.muted }}>Refund Amount</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
            {(Number(ret.requestedRefundMinor) / 100).toFixed(2)} SYP
          </div>
        </div>
        <div style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <div style={{ fontSize: 11, color: colors.muted }}>Reason</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{ret.reason}</div>
        </div>
      </div>

      {/* Description */}
      {ret.description && (
        <div style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.lg, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Description</div>
          <div style={{ fontSize: 14 }}>{ret.description}</div>
        </div>
      )}

      {/* Items */}
      <div style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.lg, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Return Items</h3>
        {ret.items.map((item: any) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: `1px solid ${colors.border}` }}>
            <span>Item {item.orderItemId.slice(0, 8)}…</span>
            <span>Qty: {item.quantity}{item.condition ? ` — ${item.condition}` : ''}</span>
          </div>
        ))}
      </div>

      {/* Merchant Actions */}
      {(canApprove || canReceive || canInspect) && (
        <div style={{ padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.lg, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Actions</h3>
          {actionError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{actionError}</div>}

          {canApprove && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                onClick={() => doAction(() => approveReturn(returnId))}
                disabled={actionLoading}
                style={{ padding: '8px 16px', borderRadius: radii.md, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                {actionLoading ? 'Processing…' : 'Approve Return'}
              </button>
              <input
                type="text"
                placeholder="Rejection reason (required for reject)"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: radii.md, border: `1px solid ${colors.border}`, fontSize: 13, flex: 1, minWidth: 200 }}
              />
              <button
                onClick={() => {
                  if (!rejectNotes.trim()) { setActionError('Rejection reason is required'); return; }
                  doAction(() => rejectReturn(returnId, rejectNotes));
                }}
                disabled={actionLoading}
                style={{ padding: '8px 16px', borderRadius: radii.md, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                {actionLoading ? 'Processing…' : 'Reject Return'}
              </button>
            </div>
          )}

          {canReceive && (
            <button
              onClick={() => doAction(() => receiveReturn(returnId))}
              disabled={actionLoading}
              style={{ padding: '8px 16px', borderRadius: radii.md, border: 'none', background: colors.brand[700], color: '#fff', cursor: 'pointer', fontSize: 13, marginBottom: 12 }}
            >
              {actionLoading ? 'Processing…' : 'Confirm Receipt'}
            </button>
          )}

          {canInspect && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={inspectCondition}
                onChange={(e) => setInspectCondition(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: radii.md, border: `1px solid ${colors.border}`, fontSize: 13 }}
              >
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                placeholder="Inspection notes (optional)"
                value={inspectNotes}
                onChange={(e) => setInspectNotes(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: radii.md, border: `1px solid ${colors.border}`, fontSize: 13, flex: 1, minWidth: 180 }}
              />
              <button
                onClick={() => doAction(() => inspectReturn(returnId, inspectCondition, inspectNotes || undefined))}
                disabled={actionLoading}
                style={{ padding: '8px 16px', borderRadius: radii.md, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                {actionLoading ? 'Processing…' : 'Inspect (Pass)'}
              </button>
              <button
                onClick={() => doAction(() => rejectReturnAfterInspection(returnId, inspectNotes || undefined))}
                disabled={actionLoading}
                style={{ padding: '8px 16px', borderRadius: radii.md, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                {actionLoading ? 'Processing…' : 'Reject After Inspection'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Event Timeline */}
      {ret.events.length > 0 && (
        <div style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: radii.lg }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Event History</h3>
          {ret.events.map((ev: ReturnRequestEvent) => (
            <div key={ev.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ color: colors.muted, minWidth: 130 }}>{formatDate(ev.createdAt)}</span>
              <span style={{ fontWeight: 600 }}>{ev.eventType}</span>
              <span style={{ color: colors.muted }}>{ev.actorType}</span>
              {ev.notes && <span style={{ color: colors.muted, fontStyle: 'italic' }}>{ev.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
