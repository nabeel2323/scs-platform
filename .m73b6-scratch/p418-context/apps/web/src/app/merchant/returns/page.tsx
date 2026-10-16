'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchMerchantReturns, ReturnRequest } from '../../../lib/buyer-api';
import { useAuth } from '../../../components/AuthProvider';
import { formatDate, LoadingSpinner, EmptyState } from '../../../components/Shared';
import { PageHeader, colors, radii } from '@scs/ui-kit';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Pending Review', MERCHANT_APPROVED: 'Approved', BUYER_SHIPPED: 'Shipped Back',
  RECEIVED: 'Received', INSPECTED: 'Inspected', REFUND_PENDING: 'Refund Processing',
  REFUNDED: 'Refunded', MERCHANT_REJECTED: 'Rejected', CANCELLED: 'Cancelled',
  EXPIRED: 'Expired', REJECTED_AFTER_INSPECTION: 'Rejected After Inspection', REFUND_FAILED: 'Refund Failed',
};

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b', MERCHANT_APPROVED: '#3b82f6', BUYER_SHIPPED: '#8b5cf6',
  RECEIVED: '#06b6d4', INSPECTED: '#6366f1', REFUND_PENDING: '#f97316',
  REFUNDED: '#22c55e', MERCHANT_REJECTED: '#ef4444', CANCELLED: '#6b7280',
  EXPIRED: '#6b7280', REJECTED_AFTER_INSPECTION: '#ef4444', REFUND_FAILED: '#ef4444',
};

export default function MerchantReturnsPage() {
  const { user, loading: authLoading } = useAuth();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeId, setStoreId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Auto-load with first available store
  useEffect(() => {
    if (!user) return;
    // The merchant's store ID would come from their profile; for now use a text input
    if (storeId) {
      fetchMerchantReturns(storeId, statusFilter || undefined)
        .then(setReturns)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [user, storeId, statusFilter]);

  if (authLoading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader title="Return Requests" subtitle="Manage buyer return requests for your store" />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Store ID"
          value={storeId}
          onChange={(e) => { setStoreId(e.target.value); setLoading(true); }}
          style={{
            padding: '8px 12px', borderRadius: radii.md,
            border: `1px solid ${colors.border}`, fontSize: 14, width: 280,
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setLoading(true); }}
          style={{
            padding: '8px 12px', borderRadius: radii.md,
            border: `1px solid ${colors.border}`, fontSize: 14,
          }}
        >
          <option value="">All Statuses</option>
          <option value="REQUESTED">Pending Review</option>
          <option value="MERCHANT_APPROVED">Approved</option>
          <option value="BUYER_SHIPPED">Shipped Back</option>
          <option value="RECEIVED">Received</option>
          <option value="INSPECTED">Inspected</option>
          <option value="REFUND_PENDING">Refund Processing</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 16 }}>{error}</div>}

      {!storeId ? (
        <EmptyState title="Enter Store ID" description="Enter your store ID above to view return requests." />
      ) : loading ? (
        <LoadingSpinner />
      ) : returns.length === 0 ? (
        <EmptyState title="No returns" description="No return requests match your filters." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {returns.map((ret) => (
            <Link
              key={ret.id}
              href={`/merchant/returns/${ret.id}`}
              style={{
                display: 'block', padding: 14,
                border: `1px solid ${colors.border}`, borderRadius: radii.lg,
                background: '#fff', textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {ret.reason} — {ret.subOrderId.slice(0, 8)}…
                  </div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {formatDate(ret.createdAt)} · {ret.items.length} item(s)
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 8px', borderRadius: radii.md,
                    fontSize: 11, fontWeight: 600, color: '#fff',
                    background: STATUS_COLORS[ret.status] || '#6b7280',
                  }}>
                    {STATUS_LABELS[ret.status] || ret.status}
                  </span>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                    {(Number(ret.requestedRefundMinor) / 100).toFixed(2)} SYP
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
