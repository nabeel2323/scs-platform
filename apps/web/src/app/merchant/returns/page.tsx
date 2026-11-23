'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { fetchMerchantReturns, ReturnRequest } from '../../../lib/buyer-api';
import { fetchMyStores, Store } from '../../../lib/api';
import { useAuth } from '../../../components/AuthProvider';
import { formatDate, LoadingSpinner, EmptyState, ErrorBanner } from '../../../components/Shared';
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

export default function MerchantReturnsPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState('');
  const [storeId, setStoreId] = useState('');
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reloadStores, setReloadStores] = useState(0);
  const [reloadReturns, setReloadReturns] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setStoresLoading(true);
    setStoresError('');
    fetchMyStores()
      .then((result) => {
        if (cancelled) return;
        setStores(result);
        setStoreId((current) =>
          result.some((store) => store.id === current) ? current : (result[0]?.id ?? ''),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStoresError(err instanceof Error ? err.message : 'Failed to load your stores');
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadStores]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!user || !storeId) {
      setReturns([]);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    fetchMerchantReturns(storeId, statusFilter || undefined)
      .then((result) => {
        if (!cancelled && requestVersion.current === version) setReturns(result);
      })
      .catch((err: unknown) => {
        if (!cancelled && requestVersion.current === version) {
          setError(err instanceof Error ? err.message : 'Failed to load return requests');
        }
      })
      .finally(() => {
        if (!cancelled && requestVersion.current === version) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, storeId, statusFilter, reloadReturns]);

  if (authLoading || storesLoading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader title="Return Requests" subtitle="Manage buyer return requests for your stores" />

      {storesError ? (
        <ErrorBanner message={storesError} onRetry={() => setReloadStores((value) => value + 1)} />
      ) : stores.length === 0 ? (
        <EmptyState
          title="No stores available"
          description="Create or join a merchant store before managing return requests."
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: colors.muted,
              }}
            >
              Store
              <select
                aria-label="Select store"
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: radii.md,
                  border: `1px solid ${colors.border}`,
                  fontSize: 14,
                  minWidth: 240,
                }}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: colors.muted,
              }}
            >
              Status
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: radii.md,
                  border: `1px solid ${colors.border}`,
                  fontSize: 14,
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
            </label>
          </div>

          {error && (
            <ErrorBanner message={error} onRetry={() => setReloadReturns((value) => value + 1)} />
          )}

          {loading ? (
            <LoadingSpinner />
          ) : error ? null : returns.length === 0 ? (
            <EmptyState
              title="No returns"
              description="No return requests match this store and status filter."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {returns.map((ret) => (
                <Link
                  key={ret.id}
                  href={`/merchant/returns/${ret.id}`}
                  style={{
                    display: 'block',
                    padding: 14,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radii.lg,
                    background: '#fff',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {ret.reason} — {ret.subOrderId.slice(0, 8)}…
                      </div>
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {formatDate(ret.createdAt)} · {ret.items.length} item(s)
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: radii.md,
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#fff',
                          background: STATUS_COLORS[ret.status] || '#6b7280',
                        }}
                      >
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
        </>
      )}
    </div>
  );
}
