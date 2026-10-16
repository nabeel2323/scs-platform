'use client';

/**
 * M7.3-B.6 — Admin Ship Operations: shipments list.
 *
 * Tenant-scoped enumeration of every shipment with queue scopes
 * (all / exceptions / RTS / recovery), exact status filters, free-text
 * search and pagination. Rows link into the shipment detail console.
 *
 * Permission: fulfillment:shipments:read (nav + read model).
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { useAdminResource } from '../../hooks/useAdminTable';
import { PaginatedResult } from '../../lib/api';
import {
  ShipRow,
  listShipments,
  SHIPMENT_STATUSES,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  exceptionTone,
  carrierTone,
} from '../../lib/shipops';
import {
  AdminStatusDot,
  formatDateShort,
  AdminErrorState,
  AdminEmptyState,
} from '../../components/detail';
import { SkeletonTable } from '@scs/ui-kit';

const PAGE_SIZE = 25;
const SCOPES: { key: string; label: string }[] = [
  { key: 'all', label: 'All Shipments' },
  { key: 'exceptions', label: 'Delivery Exceptions' },
  { key: 'rts', label: 'Return-to-Sender' },
  { key: 'recovery', label: 'Carrier Recovery' },
];

function ShipmentsConsole() {
  const { hasAccess, missingPerms } = useRequirePerms(['fulfillment:shipments:read']);
  const router = useRouter();
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const scope = params.get('scope') || 'all';
  const status = params.get('status') || '';
  const exceptionStatus = params.get('exceptionStatus') || '';
  const exceptionType = params.get('exceptionType') || '';
  const search = params.get('search') || '';
  const page = Math.max(0, parseInt(params.get('page') || '0', 10) || 0);

  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);

  const query = useMemo(
    () => ({
      scope: scope as 'all' | 'exceptions' | 'rts' | 'recovery',
      status: status || undefined,
      exceptionStatus: exceptionStatus || undefined,
      exceptionType: exceptionType || undefined,
      search: search || undefined,
      sortBy: 'updatedAt',
      sortDir: 'desc' as const,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [scope, status, exceptionStatus, exceptionType, search, page],
  );

  const path = `shipments?${listQueryToQs(query)}`;
  const list = useAdminResource<PaginatedResult<ShipRow>>(path, ready && hasAccess);
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Debounced search → URL.
  useEffect(() => {
    if (searchDraft === search) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (searchDraft.trim()) next.set('search', searchDraft.trim()); else next.delete('search');
      next.delete('page');
      router.replace(`/shipments?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, search, params, router]);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`/shipments?${next.toString()}`, { scroll: false });
  };

  if (!ready) return <div style={{ padding: 32 }}><SkeletonTable rows={6} cols={6} /></div>;
  if (!hasAccess) return <div style={{ padding: 32 }}><AccessDenied requiredPerms={['fulfillment:shipments:read']} missingPerms={missingPerms} /></div>;

  return (
    <div style={{ padding: '0 0 48px' }}>
      <header style={{ padding: '24px 32px', borderBottom: '1px solid #e5eef1' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f3340' }}>Ship Operations</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#5b6b74' }}>
          Deliveries, exceptions, return-to-sender and carrier recovery across the platform.
        </p>
      </header>

      <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Scope tabs */}
        <div role="tablist" aria-label="Shipment queues" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SCOPES.map((s) => {
            const active = scope === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                onClick={() => setParam({ scope: s.key === 'all' ? '' : s.key })}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${active ? '#1e6178' : '#d9e2e6'}`,
                  background: active ? '#e8f1f9' : '#fff',
                  color: active ? '#1e6178' : '#5b6b74',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#5b6b74' }}>
            Search
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Shipment ID, tracking, store…"
              style={{ padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, minWidth: 240, fontFamily: 'inherit' }}
            />
          </label>
          <select value={status} onChange={(e) => setParam({ status: e.target.value })} style={selectStyle}>
            <option value="">All statuses</option>
            {SHIPMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={exceptionStatus} onChange={(e) => setParam({ exceptionStatus: e.target.value })} style={selectStyle}>
            <option value="">All exception states</option>
            {EXCEPTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={exceptionType} onChange={(e) => setParam({ exceptionType: e.target.value })} style={selectStyle}>
            <option value="">All exception types</option>
            {EXCEPTION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => list.reload()} style={selectStyle}>Refresh</button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: '#5b6b74' }}>
          {total} shipment(s) · click a row to open the operations console
        </p>

        {list.error && <AdminErrorState title="Unable to load shipments" message={list.error} onRetry={list.reload} />}

        {!list.error && (
          list.loading ? <SkeletonTable rows={6} cols={7} /> :
          rows.length === 0 ? <AdminEmptyState title="No shipments in this queue" description="Nothing matches the current scope and filters." /> :
          <ShipmentsTable rows={rows} />
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#5b6b74' }}>
            <span>Page {page + 1} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={page === 0} onClick={() => setParam({ page: String(page - 1) })} style={navBtn}>Previous</button>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setParam({ page: String(page + 1) })} style={navBtn}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShipmentsTable({ rows }: { rows: ShipRow[] }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e5eef1', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f7fafb', textAlign: 'left' }}>
            {['Shipment', 'Store', 'Status', 'Exception', 'RTS', 'Carrier', 'Attempts', 'Updated'].map((h) => (
              <th key={h} scope="col" style={{ padding: '10px 14px', fontWeight: 600, color: '#0f3340', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isRts = r.exceptionStatus && r.exceptionStatus.startsWith('RTS_');
            return (
              <tr
                key={r.id}
                onClick={() => { window.location.href = `/shipments/${r.id}`; }}
                style={{ borderTop: '1px solid #eef3f5', cursor: 'pointer' }}
              >
                <td style={{ padding: '10px 14px' }}>
                  <Link href={`/shipments/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e6178', textDecoration: 'none' }}>
                    {r.id.slice(0, 12)}…
                  </Link>
                  {r.carrierTrackingId && <div style={{ fontSize: 11, color: '#5b6b74' }}>{r.carrierTrackingId}</div>}
                </td>
                <td style={{ padding: '10px 14px' }}>{r.storeName || '—'}</td>
                <td style={{ padding: '10px 14px' }}><AdminStatusDot status={r.status} color={statusTone(r.status)} /></td>
                <td style={{ padding: '10px 14px' }}>
                  {r.exceptionStatus && !isRts
                    ? <><AdminStatusDot status={r.exceptionStatus} color={exceptionTone(r.exceptionStatus)} />{r.exceptionType && <div style={{ fontSize: 11, color: '#5b6b74' }}>{r.exceptionType}</div>}</>
                    : <span style={{ color: '#8a97a0' }}>—</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {isRts ? <AdminStatusDot status={r.exceptionStatus!} color="info" /> : <span style={{ color: '#8a97a0' }}>—</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {r.carrierCreateStatus ? <AdminStatusDot status={r.carrierCreateStatus} color={carrierTone(r.carrierCreateStatus)} /> : <span style={{ color: '#8a97a0' }}>Not queued</span>}
                </td>
                <td style={{ padding: '10px 14px' }}>{r.deliveryAttempts}/{r.maxDeliveryAttempts}</td>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#5b6b74' }}>{formatDateShort(r.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function statusTone(status: string): 'ok' | 'warn' | 'err' | 'info' | 'muted' {
  if (status === 'DELIVERED') return 'ok';
  if (status === 'CANCELLED') return 'err';
  if (status === 'PREPARING' || status === 'READY_FOR_PICKUP') return 'warn';
  return 'info';
}

function listQueryToQs(q: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') sp.set(k, String(v));
  return sp.toString();
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13,
  background: '#fff', color: '#0f3340', fontFamily: 'inherit', cursor: 'pointer',
};
const navBtn: React.CSSProperties = {
  padding: '6px 14px', border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff',
  cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};

export default function ShipmentsPage() {
  return <Suspense fallback={<div style={{ padding: 32 }}><SkeletonTable rows={6} cols={6} /></div>}><ShipmentsConsole /></Suspense>;
}
