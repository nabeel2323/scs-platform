'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminCatalogRequest,
  fetchAdminCatalogRequests,
  approveCatalogRequest,
  rejectCatalogRequest,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { getUser } from '../../lib/auth';

/* ── Styles (matching management.module.css tokens) ─────────── */
const css = {
  shell: { color: '#16232b', fontSize: 14 } as React.CSSProperties,
  header: { padding: '30px 36px', background: 'linear-gradient(135deg,#0c2831,#1e6178)', color: 'white' } as React.CSSProperties,
  headerH1: { margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: -0.2 } as React.CSSProperties,
  headerP: { margin: 0, opacity: 0.7, fontSize: 13 } as React.CSSProperties,
  content: { padding: '24px 32px 48px' } as React.CSSProperties,
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12, margin: '16px 0' } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 12, fontWeight: 600, color: '#16232b' } as React.CSSProperties,
  input: { padding: '9px 11px', font: 'inherit', border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#16232b' } as React.CSSProperties,
  btn: { padding: '8px 14px', font: 'inherit', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer', color: '#0f3340', background: '#fff', fontWeight: 500 } as React.CSSProperties,
  btnPrimary: { padding: '8px 14px', font: 'inherit', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', background: '#1b7a4b', fontWeight: 600 } as React.CSSProperties,
  btnDanger: { padding: '8px 14px', font: 'inherit', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', background: '#c4413a', fontWeight: 500 } as React.CSSProperties,
  tableWrap: { overflowX: 'auto', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' } as React.CSSProperties,
  th: { background: '#103744', color: '#fff', padding: 12, textAlign: 'left' as const, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, zIndex: 2 } as React.CSSProperties,
  td: { padding: '13px 12px', borderBottom: '1px solid #e5ecf0', maxWidth: 300, overflowWrap: 'anywhere' as const, minWidth: 85, verticalAlign: 'top' as const } as React.CSSProperties,
  error: { padding: 12, color: '#991b1b', background: '#fbeeec', borderRadius: 6, margin: '12px 0', fontSize: 13 } as React.CSSProperties,
  badge: (bg: string, fg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color: fg }) as React.CSSProperties,
  dialog: { border: '1px solid #d9e2e6', borderRadius: 14, padding: 24, width: 'min(480px, 92vw)', color: '#16232b', boxShadow: '0 20px 80px rgba(0,0,0,0.25)' } as React.CSSProperties,
};

const TYPE_LABELS: Record<string, string> = {
  CATEGORY: 'Category',
  BRAND: 'Brand',
  ATTRIBUTE: 'Attribute',
  OPTION: 'Option',
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#fff8e1', fg: '#8a6d00' },
  APPROVED: { bg: '#eaf5ef', fg: '#1b7a4b' },
  REJECTED: { bg: '#fbeeec', fg: '#991b1b' },
};

type TypeFilter = '' | 'CATEGORY' | 'BRAND' | 'ATTRIBUTE' | 'OPTION';
type StatusFilter = '' | 'PENDING' | 'APPROVED' | 'REJECTED';

function RequestsPageContent() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:categories:write']);
  const [requests, setRequests] = useState<AdminCatalogRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [rejecting, setRejecting] = useState<AdminCatalogRequest | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminCatalogRequests({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setRequests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => { void reload(); }, [reload]);

  const handleApprove = async (req: AdminCatalogRequest) => {
    const reviewerId = getUser()?.id || '';
    try {
      await approveCatalogRequest(req.id, reviewerId);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve request');
    }
  };

  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:categories:write']} missingPerms={missingPerms} />;

  return (
    <div style={css.shell}>
      <div style={css.header}>
        <h1 style={css.headerH1}>Catalog Requests</h1>
        <p style={css.headerP}>Review merchant requests for new categories, brands, attributes, and options</p>
      </div>

      <div style={css.content}>
        {error && <div style={css.error}>{error}</div>}

        {/* Toolbar */}
        <div style={css.toolbar}>
          <label style={css.label}>
            Type
            <select style={css.input} value={typeFilter} onChange={e => setTypeFilter(e.target.value as TypeFilter)}>
              <option value="">All Types</option>
              <option value="CATEGORY">Category</option>
              <option value="BRAND">Brand</option>
              <option value="ATTRIBUTE">Attribute</option>
              <option value="OPTION">Option</option>
            </select>
          </label>
          <label style={css.label}>
            Status
            <select style={css.input} value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
        </div>

        <p style={{ fontSize: 12, color: '#5b6b74', margin: '8px 0' }}>
          Showing {requests.length} request{requests.length !== 1 ? 's' : ''}
        </p>

        {/* Table */}
        <div style={css.tableWrap}>
          <table>
            <thead>
              <tr>
                <th style={css.th}>Type</th>
                <th style={css.th}>Details</th>
                <th style={css.th}>Store</th>
                <th style={css.th}>Status</th>
                <th style={css.th}>Submitted</th>
                <th style={css.th}>Reviewed</th>
                <th style={css.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...css.td, textAlign: 'center', color: '#5b6b74' }}>Loading requests…</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} style={{ ...css.td, textAlign: 'center', color: '#5b6b74' }}>No requests found</td></tr>
              ) : (
                requests.map(r => (
                  <tr key={r.id}>
                    <td style={css.td}>
                      <span style={css.badge('#e5f2f8', '#1e6178')}>{TYPE_LABELS[r.type] ?? r.type}</span>
                    </td>
                    <td style={css.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {Object.entries(r.payload).filter(([, v]) => v).map(([k, v]) => (
                          <span key={k} style={{ background: '#f7f9fa', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
                            <strong>{k}:</strong> {String(v)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={css.td}>
                      <code style={{ fontSize: 11 }}>{r.storeId.slice(0, 8)}…</code>
                    </td>
                    <td style={css.td}>
                      <span style={css.badge(
                        STATUS_BADGE[r.status]?.bg ?? '#f7f9fa',
                        STATUS_BADGE[r.status]?.fg ?? '#5b6b74',
                      )}>
                        {r.status}
                      </span>
                    </td>
                    <td style={css.td}>
                      <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString()}</time>
                    </td>
                    <td style={css.td}>
                      {r.reviewedAt ? (
                        <>
                          <time dateTime={r.reviewedAt}>{new Date(r.reviewedAt).toLocaleDateString()}</time>
                          {r.reviewReason && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>{r.reviewReason}</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td style={css.td}>
                      {r.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={css.btnPrimary} onClick={() => handleApprove(r)}>Approve</button>
                          <button style={css.btnDanger} onClick={() => setRejecting(r)}>Reject</button>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Dialog */}
      {rejecting && (
        <RejectDialog
          request={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); void reload(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

/* ── Reject Dialog ───────────────────────────────────────────── */
function RejectDialog({ request, onClose, onDone, onError }: {
  request: AdminCatalogRequest;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      const reviewerId = getUser()?.id || '';
      await rejectCatalogRequest(request.id, reviewerId, reason.trim());
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to reject request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog open style={css.dialog} onClick={e => e.target === e.currentTarget && onClose()}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Reject Request</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5b6b74' }}>
        Rejecting request for <strong>{TYPE_LABELS[request.type]}</strong>. Provide a reason for the merchant:
      </p>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Reason for rejection…"
        required
        style={{ ...css.input, width: '100%', minHeight: 80, resize: 'vertical' as const, boxSizing: 'border-box' as const }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={css.btn} onClick={onClose}>Cancel</button>
        <button style={css.btnDanger} disabled={saving || !reason.trim()} onClick={handleReject}>
          {saving ? 'Rejecting…' : 'Reject Request'}
        </button>
      </div>
    </dialog>
  );
}

/* ── Default Export with Suspense ────────────────────────────── */
export default function RequestsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading requests…</div>}>
      <RequestsPageContent />
    </Suspense>
  );
}
