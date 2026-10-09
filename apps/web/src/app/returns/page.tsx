'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchMyReturns, ReturnRequest } from '../../lib/buyer-api';
import { useAuth } from '../../components/AuthProvider';
import { StatusBadge, formatDate, LoadingSpinner, EmptyState } from '../../components/Shared';
import { PageHeader, colors, radii } from '@scs/ui-kit';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Pending Review',
  MERCHANT_APPROVED: 'Approved',
  BUYER_SHIPPED: 'Shipped Back',
  RECEIVED: 'Received',
  INSPECTED: 'Inspected',
  REFUND_PENDING: 'Refund Processing',
  REFUNDED: 'Refunded',
  MERCHANT_REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REJECTED_AFTER_INSPECTION: 'Rejected After Inspection',
  REFUND_FAILED: 'Refund Failed',
};

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b',
  MERCHANT_APPROVED: '#3b82f6',
  BUYER_SHIPPED: '#8b5cf6',
  RECEIVED: '#06b6d4',
  INSPECTED: '#6366f1',
  REFUND_PENDING: '#f97316',
  REFUNDED: '#22c55e',
  MERCHANT_REJECTED: '#ef4444',
  CANCELLED: '#6b7280',
  EXPIRED: '#6b7280',
  REJECTED_AFTER_INSPECTION: '#ef4444',
  REFUND_FAILED: '#ef4444',
};

export default function MyReturnsPage() {
  const { user, loading: authLoading } = useAuth();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchMyReturns(filter || undefined)
      .then(setReturns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, filter]);

  if (authLoading || loading) return <LoadingSpinner />;
  if (error) return <div style={{ padding: 24, color: '#ef4444' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader title="My Returns" subtitle="Track and manage your return requests" />

      <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['', 'REQUESTED', 'MERCHANT_APPROVED', 'REFUNDED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: radii.md,
              border: `1px solid ${filter === s ? colors.brand[700] : colors.border}`,
              background: filter === s ? colors.brand[700] : '#fff',
              color: filter === s ? '#fff' : colors.muted,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {s ? STATUS_LABELS[s] || s : 'All'}
          </button>
        ))}
      </div>

      {returns.length === 0 ? (
        <EmptyState title="No returns" description="You haven't created any return requests yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {returns.map((ret) => (
            <Link
              key={ret.id}
              href={`/returns/${ret.id}`}
              style={{
                display: 'block',
                padding: 16,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.lg,
                background: '#fff',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{ret.reason}</div>
                  <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                    Order: {ret.subOrderId.slice(0, 8)}… · {formatDate(ret.createdAt)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: radii.md,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      background: STATUS_COLORS[ret.status] || '#6b7280',
                    }}
                  >
                    {STATUS_LABELS[ret.status] || ret.status}
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                    {(ret.requestedRefundMinor / 100).toFixed(2)} SYP
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
