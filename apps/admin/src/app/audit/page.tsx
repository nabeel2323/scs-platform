'use client';

/**
 * Audit Log Page — dedicated audit log viewer with filtering, entity links,
 * and metadata expansion.
 *
 * Route: /audit
 * API: GET /v1/admin/audit-logs
 */
import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchAuditLogs, type AuditLog } from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import { AdminLoadingSkeleton, formatDate } from '../../components/detail';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUSPEND', 'ACTIVATE', 'DEACTIVATE', 'LOGIN', 'LOGOUT', 'ROLE_ASSIGN', 'ROLE_REVOKE'];
const RESOURCES = ['product', 'offer', 'order', 'user', 'organization', 'category', 'brand', 'attribute', 'product-type', 'store', 'dispute', 'import-job'];

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  CREATE: { bg: '#ecfdf5', fg: '#065f46' },
  UPDATE: { bg: '#eff6ff', fg: '#1e40af' },
  DELETE: { bg: '#fef2f2', fg: '#991b1b' },
  APPROVE: { bg: '#ecfdf5', fg: '#065f46' },
  REJECT: { bg: '#fef2f2', fg: '#991b1b' },
  SUSPEND: { bg: '#fffbeb', fg: '#92400e' },
  ACTIVATE: { bg: '#ecfdf5', fg: '#065f46' },
  DEACTIVATE: { bg: '#fef2f2', fg: '#991b1b' },
  LOGIN: { bg: '#f0f9ff', fg: '#0c4a6e' },
  LOGOUT: { bg: '#f0f9ff', fg: '#0c4a6e' },
  ROLE_ASSIGN: { bg: '#ede9fe', fg: '#5b21b6' },
  ROLE_REVOKE: { bg: '#ede9fe', fg: '#5b21b6' },
};

/** Map resource names to admin detail routes. */
function entityLink(resource: string, resourceId: string | null): { href: string; label: string } | null {
  if (!resourceId) return null;
  const routeMap: Record<string, string> = {
    product: '/products', offer: '/offers', order: '/orders', user: '/users',
    organization: '/organizations', category: '/categories', brand: '/brands',
    'product-type': '/product-types', store: '/merchants', dispute: '/disputes',
    'import-job': '/catalog-import',
  };
  const base = routeMap[resource];
  if (!base) return null;
  return { href: `${base}/${resourceId}`, label: resourceId.slice(0, 12) + '…' };
}

function AuditContent() {
  const { hasAccess } = useRequirePerms(['admin:audit:read']);
  const [ready, setReady] = useState(false);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Expanded metadata row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => setReady(true), []);

  const load = useCallback(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    setError('');
    fetchAuditLogs({
      action: filterAction || undefined,
      resource: filterResource || undefined,
      actorId: filterActor || undefined,
      limit,
      offset,
    })
      .then(result => {
        setLogs(result.data);
        setTotal(result.total);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load audit logs');
        setLoading(false);
      });
  }, [ready, hasAccess, filterAction, filterResource, filterActor, limit, offset]);

  useEffect(() => { load(); }, [load]);

  if (!ready) return <AdminLoadingSkeleton kvRows={8} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:audit:read</div>;

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div style={{ padding: '24px 32px 48px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f3340', margin: 0 }}>Audit Log</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Platform-wide activity trail · {total.toLocaleString()} entries
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Action</label>
          <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setOffset(0); }}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">All actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Resource</label>
          <select value={filterResource} onChange={e => { setFilterResource(e.target.value); setOffset(0); }}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">All resources</option>
            {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Actor ID</label>
          <input type="text" value={filterActor} onChange={e => { setFilterActor(e.target.value); setOffset(0); }}
            placeholder="Filter by actor…"
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', width: 180 }} />
        </div>
        <button onClick={load}
          style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
          Refresh
        </button>
      </div>

      {error && <div style={{ padding: 16, color: '#991b1b', fontSize: 13, background: '#fef2f2', borderRadius: 6, marginBottom: 16 }}>{error}</div>}

      {loading && <div style={{ padding: 24, color: '#6b7280', fontSize: 13 }}>Loading audit logs…</div>}

      {!loading && !error && logs.length === 0 && (
        <div style={{ padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>No audit log entries found.</div>
      )}

      {logs.length > 0 && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '140px 100px 110px 120px 1fr 140px 40px',
            padding: '8px 16px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontSize: 11,
            fontWeight: 700,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            <span>Timestamp</span>
            <span>Action</span>
            <span>Resource</span>
            <span>Actor</span>
            <span>Resource ID</span>
            <span>Actor Type</span>
            <span></span>
          </div>

          {/* Rows */}
          {logs.map((log) => {
            const actionColor = ACTION_COLORS[log.action] ?? { bg: '#f3f4f6', fg: '#374151' };
            const link = entityLink(log.resource, log.resourceId);
            const hasMeta = log.metadata && Object.keys(log.metadata).length > 0;
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 100px 110px 120px 1fr 140px 40px',
                  padding: '10px 16px',
                  borderBottom: '1px solid #f0f4f6',
                  fontSize: 13,
                  alignItems: 'center',
                  background: isExpanded ? '#f0f9ff' : 'transparent',
                }}>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{formatDate(log.createdAt)}</span>
                  <span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: actionColor.bg, color: actionColor.fg,
                    }}>{log.action}</span>
                  </span>
                  <span style={{ fontSize: 12, color: '#374151' }}>{log.resource}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>
                    {log.actorId ? log.actorId.slice(0, 10) + '…' : '—'}
                  </span>
                  <span>
                    {link ? (
                      <Link href={link.href} style={{ fontSize: 12, fontFamily: 'monospace', color: '#0f3340', textDecoration: 'underline' }}>
                        {link.label}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#9ca3af' }}>
                        {log.resourceId ? log.resourceId.slice(0, 12) + '…' : '—'}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{log.actorType}</span>
                  <span>
                    {hasMeta && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280', padding: 0, fontFamily: 'inherit' }}
                        title="Toggle metadata"
                      >
                        {isExpanded ? '▾' : '▸'}
                      </button>
                    )}
                  </span>
                </div>
                {isExpanded && hasMeta && (
                  <div style={{
                    padding: '12px 16px',
                    background: '#f0f9ff',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: '#374151',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    <strong>Metadata:</strong>
                    <div style={{ marginTop: 4 }}>{JSON.stringify(log.metadata, null, 2)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: offset === 0 ? '#f3f4f6' : '#0f3340', color: offset === 0 ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: offset === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: offset + limit >= total ? '#f3f4f6' : '#0f3340', color: offset + limit >= total ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: offset + limit >= total ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}><AuditContent /></Suspense>;
}
