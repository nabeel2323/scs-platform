'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { adminRequest } from '../../lib/api';
import { AccessDenied, useRequirePerms } from '../../hooks/useRequirePerms';
import { PageHeader, colors, radii } from '@scs/ui-kit';
import { AdminErrorState } from '../../components/detail';

interface ReturnRow {
  id: string;
  subOrderId: string;
  buyerId: string;
  status: string;
  reason: string;
  requestedRefundMinor: number;
  actualRefundMinor: number | null;
  createdAt: string;
  escalatedAt: string | null;
  escalationDeadline: string | null;
  responsibilityCategory: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b', MERCHANT_APPROVED: '#3b82f6', BUYER_SHIPPED: '#8b5cf6',
  RECEIVED: '#06b6d4', INSPECTED: '#6366f1', REFUND_PENDING: '#f97316',
  REFUNDED: '#22c55e', MERCHANT_REJECTED: '#ef4444', CANCELLED: '#6b7280',
  EXPIRED: '#6b7280', REJECTED_AFTER_INSPECTION: '#ef4444', REFUND_FAILED: '#ef4444',
  ESCALATED: '#dc2626',
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
}

export default function AdminReturnsPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:returns:read']);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loadedFilter, setLoadedFilter] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const hasCurrentResults = loadedFilter === statusFilter;

  const load = useCallback(() => {
    if (!hasAccess) { setLoading(false); return; }
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError('');
    const sp = new URLSearchParams();
    if (statusFilter) sp.set('status', statusFilter);
    const qs = sp.toString();
    adminRequest<ReturnRow[]>(`admin/returns${qs ? `?${qs}` : ''}`)
      .then((data) => {
        if (requestId === requestVersion.current) {
          setReturns(data);
          setLoadedFilter(statusFilter);
        }
      })
      .catch((e) => {
        if (requestId === requestVersion.current) {
          setError(e instanceof Error ? e.message : 'Failed to load returns');
        }
      })
      .finally(() => {
        if (requestId === requestVersion.current) setLoading(false);
      });
  }, [statusFilter, hasAccess]);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  if (!ready) {
    return <div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.5)' }}>Loading…</div>;
  }
  if (!hasAccess) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <AccessDenied requiredPerms={['admin:returns:read']} missingPerms={missingPerms} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>Returns Oversight</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            Cross-organization return request management
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '6px 12px', borderRadius: radii.md,
            border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
            color: '#fff', fontSize: 13,
          }}
        >
          <option value="">All Statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="MERCHANT_APPROVED">Approved</option>
          <option value="REFUND_PENDING">Refund Pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
          <option value="ESCALATED">Escalated</option>
        </select>
        <button
          type="button"
          onClick={load}
          style={{ padding: '6px 12px', borderRadius: radii.md, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          Refresh
        </button>
        </div>
      </div>

      {error && (hasCurrentResults ? (
        <div role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12, borderRadius: 8, background: '#7f1d1d', color: '#fff', fontSize: 13 }}>
          <span>{error} Showing the last successfully loaded results.</span>
          <button onClick={load} style={{ padding: '4px 12px', border: 0, borderRadius: 6, cursor: 'pointer' }}>Retry returns</button>
        </div>
      ) : <AdminErrorState title="Unable to load returns" message={error} onRetry={load} />)}
      {loading && hasCurrentResults && (
        <div role="status" style={{ color: 'rgba(255,255,255,0.5)', padding: '6px 0', fontSize: 12 }}>Refreshing returns… showing the last successful results.</div>
      )}
      {loading && !hasCurrentResults ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : !hasCurrentResults ? null : returns.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', padding: 40, textAlign: 'center' }}>
          No return requests found.
        </div>
      ) : (
        <div style={{
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: radii.lg,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                {['Status', 'Reason', 'Order', 'Refund', 'Escalated', 'Deadline', 'Created', 'Action'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                    color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 12,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {returns.map((ret) => (
                <tr key={ret.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: radii.md,
                      fontSize: 11, fontWeight: 600, color: '#fff',
                      background: STATUS_COLORS[ret.status] || '#6b7280',
                    }}>
                      {ret.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#fff' }}>{ret.reason}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: 12 }}>
                      {ret.subOrderId.slice(0, 8)}…
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#fff', fontWeight: 600 }}>
                    {(Number(ret.requestedRefundMinor) / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.6)' }}>
                    {ret.escalatedAt ? fmtDate(ret.escalatedAt) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: ret.escalationDeadline && new Date(ret.escalationDeadline) < new Date() ? '#ef4444' : 'rgba(255,255,255,0.6)' }}>
                    {ret.escalationDeadline ? fmtDate(ret.escalationDeadline) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.6)' }}>
                    {fmtDate(ret.createdAt)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {ret.status === 'ESCALATED' && (
                      <Link href={`/returns/${ret.id}?resolve=1`} style={{
                        padding: '4px 10px', borderRadius: radii.md, fontSize: 11, fontWeight: 600,
                        background: '#dc2626', color: '#fff', textDecoration: 'none',
                      }}>
                        Resolve
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
