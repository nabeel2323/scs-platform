'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchMyStores, type Store } from '../../../lib/api';
import {
  fetchMerchantSettlements,
  type MerchantSettlement,
} from '../../../lib/buyer-api';
import { useAuth } from '../../../components/AuthProvider';
import { pickStore } from '../../../lib/merchant-store';
import {
  EmptyState,
  ErrorBanner,
  formatDateCompact,
  formatMinor,
  LoadingSpinner,
  StatusBadge,
} from '../../../components/Shared';
import { PageHeader, colors, radii } from '@scs/ui-kit';

const SETTLEMENT_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CALCULATED', label: 'Calculated' },
  { value: 'DUE', label: 'Due' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'PAID', label: 'Paid' },
];

export default function MerchantSettlementsPage() {
  const { user, loading: authLoading } = useAuth();
  const activeOrgId = user?.activeOrgId ?? null;
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState('');
  const [settlements, setSettlements] = useState<MerchantSettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reloadStores, setReloadStores] = useState(0);
  const [reloadSettlements, setReloadSettlements] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setStoresLoading(true);
    setStoresError('');
    setStores([]);
    setStoreId('');
    setSettlements([]);
    setError('');
    fetchMyStores()
      .then((result) => {
        if (cancelled) return;
        setStores(result);
        setStoreId(pickStore(result)?.id ?? '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStoresError(err instanceof Error ? err.message : 'Failed to load your stores');
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, activeOrgId, reloadStores]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!user || !storeId) {
      setSettlements([]);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    fetchMerchantSettlements(storeId, statusFilter || undefined)
      .then((result) => {
        if (!cancelled && requestVersion.current === version) setSettlements(result);
      })
      .catch((err: unknown) => {
        if (!cancelled && requestVersion.current === version) {
          setError(err instanceof Error ? err.message : 'Failed to load settlements');
        }
      })
      .finally(() => {
        if (!cancelled && requestVersion.current === version) setLoading(false);
      });
    return () => {
      cancelled = true;
      requestVersion.current += 1;
    };
  }, [user, activeOrgId, storeId, statusFilter, reloadSettlements]);

  if (authLoading || storesLoading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title="Settlements"
        subtitle="View payouts and financial adjustments for your stores"
      />

      {storesError ? (
        <ErrorBanner message={storesError} onRetry={() => setReloadStores((value) => value + 1)} />
      ) : stores.length === 0 ? (
        <EmptyState
          title="No stores available"
          description="Create or join a merchant store before viewing settlements."
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted }}>
              Store
              <select
                aria-label="Select store"
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: radii.md,
                  border: `1px solid ${colors.border}`, fontSize: 14, minWidth: 220,
                }}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.displayName}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted }}>
              Status
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: radii.md,
                  border: `1px solid ${colors.border}`, fontSize: 14,
                }}
              >
                {SETTLEMENT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setReloadSettlements((value) => value + 1)}
              style={{
                padding: '8px 14px', borderRadius: radii.md,
                border: `1px solid ${colors.border}`, background: '#fff',
                color: '#334155', cursor: 'pointer', fontSize: 13,
              }}
            >
              Refresh
            </button>
          </div>

          {error && <ErrorBanner message={error} onRetry={() => setReloadSettlements((value) => value + 1)} />}

          {loading ? (
            <LoadingSpinner />
          ) : error ? null : settlements.length === 0 ? (
            <EmptyState
              title="No settlements"
              description="No settlement or adjustment records match this store and status filter."
            />
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: radii.lg, background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }}>
                    <th style={{ padding: '12px 10px' }}>Sub-order</th>
                    <th style={{ padding: '12px 10px' }}>Date</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Gross</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Refunds</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Commission</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Fees</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Net</th>
                    <th style={{ padding: '12px 10px' }}>Status</th>
                    <th style={{ padding: '12px 10px' }}>Payout reference</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => (
                    <tr key={settlement.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '11px 10px', fontFamily: 'monospace', fontSize: 12 }}>
                        {settlement.subOrderId.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                        {formatDateCompact(settlement.createdAt)}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                        {formatMinor(settlement.grossMinor, settlement.currency)}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                        {settlement.refundMinor > 0 ? formatMinor(settlement.refundMinor, settlement.currency) : '—'}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                        {formatMinor(settlement.commissionMinor, settlement.currency)}
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                        {formatMinor(settlement.feeMinor, settlement.currency)}
                      </td>
                      <td style={{
                        padding: '11px 10px', textAlign: 'right', fontWeight: 700,
                        color: settlement.netMinor < 0 ? '#b91c1c' : '#047857',
                      }}>
                        {formatMinor(settlement.netMinor, settlement.currency)}
                      </td>
                      <td style={{ padding: '11px 10px' }}>
                        <StatusBadge status={
                          settlement.status === 'PAID' && (settlement.metadata?.adjustmentId || settlement.notes?.startsWith('Posted adjustment '))
                            ? 'ADJUSTMENT · PAID'
                            : settlement.status
                        } />
                      </td>
                      <td style={{ padding: '11px 10px', fontFamily: 'monospace', fontSize: 11 }}>
                        {settlement.paymentReference || (settlement.paidAt ? formatDateCompact(settlement.paidAt) : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '8px 12px', color: colors.muted, fontSize: 11 }}>
                Showing the latest {settlements.length} records returned by the settlement service.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
