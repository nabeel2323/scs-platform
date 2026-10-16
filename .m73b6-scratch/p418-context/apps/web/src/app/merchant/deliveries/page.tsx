'use client';

/**
 * M7.3-B.6 — Merchant Delivery Operations: deliveries list.
 *
 * Tenant-scoped view of the merchant's own shipments (server restricts rows to
 * the active org's stores). Queue tabs for exceptions / return-to-sender, plus
 * navigation into the per-shipment delivery console. Merchants operate delivery
 * entirely through this UI — no direct API usage required.
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { isMerchantRole } from '../../../lib/auth';
import {
  ShipRow, listShipments, exceptionLabel,
} from '../../../lib/shipops';
import { PageHeader, Breadcrumb } from '@scs/ui-kit';
import { StatusBadge, LoadingSpinner, EmptyState, formatDate } from '../../../components/Shared';

const PAGE = 25;
const TABS = [
  { key: 'all', label: 'All Deliveries' },
  { key: 'exceptions', label: 'Exceptions' },
  { key: 'rts', label: 'Return-to-Sender' },
];

export default function MerchantDeliveriesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<'all' | 'exceptions' | 'rts'>('all');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ShipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError('');
    listShipments({ scope, limit: PAGE, offset: page * PAGE })
      .then((r: { data: ShipRow[]; total: number }) => { setRows(r.data); setTotal(r.total); })
      .catch((e: any) => setError(e.message || 'Failed to load deliveries'))
      .finally(() => setLoading(false));
  }, [user, scope, page]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/auth/login?redirect=/merchant/deliveries'); return; }
    if (!isMerchantRole(user?.role)) { router.replace('/search'); return; }
    load();
  }, [authLoading, user, router, load]);

  if (authLoading || !user) return <LoadingSpinner />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="Deliveries"
        subtitle="Shipments, delivery exceptions and returns for your stores"
        breadcrumbs={<Breadcrumb items={[{ label: 'Deliveries', href: '/merchant/deliveries' }]} />}
      />
      <div style={{ padding: '20px 24px 48px' }}>
        {error && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>{error}</div>}

        <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = scope === t.key;
            return (
              <button key={t.key} role="tab" aria-selected={active}
                onClick={() => { setScope(t.key as any); setPage(0); }}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${active ? '#1e6178' : '#d9e2e6'}`, background: active ? '#e8f1f9' : '#fff', color: active ? '#1e6178' : '#5b6b74' }}>
                {t.label}
              </button>
            );
          })}
        </div>

        <p style={{ fontSize: 12, color: '#5b6b74', margin: '0 0 12px' }}>
          Accepting an order automatically creates its shipment. Open a delivery to manage the carrier label, tracking, exceptions and returns.
        </p>

        {loading ? <LoadingSpinner /> : rows.length === 0 ? (
          <EmptyState title="No deliveries yet" description="Shipments appear here once you accept orders." />
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #d9e2e6', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f7fafb', textAlign: 'left' }}>
                  {['Delivery', 'Store', 'Status', 'Exception', 'Attempts', 'Updated'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 600, color: '#0f3340', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #eef3f5' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/merchant/deliveries/${r.id}`} style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e6178', textDecoration: 'none' }}>
                        {r.id.slice(0, 12)}…
                      </Link>
                      {r.carrierTrackingId && <div style={{ fontSize: 11, color: '#5b6b74' }}>{r.carrierTrackingId}</div>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>{r.storeName || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '10px 14px' }}>{r.exceptionStatus ? exceptionLabel(r.exceptionStatus, r.exceptionType) : <span style={{ color: '#8a97a0' }}>—</span>}</td>
                    <td style={{ padding: '10px 14px' }}>{r.deliveryAttempts}/{r.maxDeliveryAttempts}</td>
                    <td style={{ padding: '10px 14px', color: '#5b6b74', whiteSpace: 'nowrap' }}>{formatDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13, color: '#5b6b74' }}>
            <span>Page {page + 1} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={navBtn}>Previous</button>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} style={navBtn}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { padding: '6px 14px', border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
