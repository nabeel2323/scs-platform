'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminRequest } from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import { PageHeader } from '@scs/ui-kit';

interface Approval {
  id: string;
  approverId: string;
  approverRole: string;
  approvalHash: string;
  approvedAt: string;
  notes: string | null;
}

interface Adjustment {
  id: string;
  subOrderId: string;
  returnRequestId: string | null;
  adjustmentType: string;
  amountMinor: number;
  currency: string;
  fxStatus: string;
  fxEvidence: any;
  status: string;
  reason: string;
  requiresDualApproval: boolean;
  approvalHash: string;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
  approvals: Approval[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280', PENDING_APPROVAL: '#f59e0b', APPROVED: '#3b82f6',
  POSTED: '#22c55e', REJECTED: '#ef4444', FAILED: '#ef4444', BLOCKED_FX: '#dc2626',
};

const FX_COLORS: Record<string, string> = {
  NOT_REQUIRED: '#22c55e', RESOLVED: '#3b82f6', BLOCKED: '#ef4444', BLOCKED_FX: '#dc2626', PENDING_REVIEW: '#f59e0b',
};

function fmtMinor(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function SettlementAdjustmentsPage() {
  useRequirePerms(['admin:adjustments:read']);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (statusFilter) sp.set('status', statusFilter);
    const qs = sp.toString();
    adminRequest<Adjustment[]>(`admin/settlement-adjustments${qs ? `?${qs}` : ''}`)
      .then(data => setAdjustments(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: string) => {
    setActing(id);
    try {
      if (action === 'submit') {
        await adminRequest(`admin/settlement-adjustments/${id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      } else if (action === 'approve') {
        await adminRequest(`admin/settlement-adjustments/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'Approved via admin UI' }) });
      } else if (action === 'post') {
        await adminRequest(`admin/settlement-adjustments/${id}/post`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      }
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#0f1115', color: '#e5e7eb' }}>
      <PageHeader title="Settlement Adjustments" subtitle="Financial adjustment approval workflow" />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background: '#1e2028', color: '#e5e7eb', border: '1px solid #333', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="POSTED">Posted</option>
          <option value="REJECTED">Rejected</option>
          <option value="BLOCKED_FX">Blocked (FX)</option>
        </select>
        <button onClick={load} style={{ background: '#3b82f6', color: '#fff', border: 0, borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>Refresh</button>
      </div>

      {error && <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {loading && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading...</div>}

      {!loading && adjustments.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No settlement adjustments found.</div>
      )}

      {adjustments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {adjustments.map(adj => (
            <div key={adj.id} style={{ background: '#1a1d24', borderRadius: 12, border: '1px solid #2a2d34', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: STATUS_COLORS[adj.status] || '#6b7280' }}>{adj.status}</span>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: FX_COLORS[adj.fxStatus] || '#6b7280' }}>FX: {adj.fxStatus}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{adj.adjustmentType}</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600 }}>{fmtMinor(adj.amountMinor, adj.currency)}</span>
              </div>

              <div style={{ fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>{adj.reason}</div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Order: {adj.subOrderId.slice(0, 8)}... | Created: {fmtDate(adj.createdAt)} | Dual approval: {adj.requiresDualApproval ? 'Required' : 'Single'}
              </div>

              {adj.approvals.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Approvals ({adj.approvals.length}):</div>
                  {adj.approvals.map(a => (
                    <div key={a.id} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', paddingLeft: 8 }}>
                      {a.approverRole} — {fmtDate(a.approvedAt)}{a.notes ? ` — ${a.notes}` : ''}
                    </div>
                  ))}
                </div>
              )}

              {adj.fxStatus === 'BLOCKED_FX' && (
                <div style={{ background: '#7f1d1d33', border: '1px solid #7f1d1d', borderRadius: 8, padding: 8, fontSize: 11, color: '#fca5a5', marginBottom: 8 }}>
                  Posting blocked: no authoritative FX rate available. Dual approval required as safe default.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {adj.status === 'DRAFT' && (
                  <button onClick={() => handleAction(adj.id, 'submit')} disabled={acting === adj.id}
                    style={{ background: '#f59e0b', color: '#000', border: 0, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Submit</button>
                )}
                {adj.status === 'PENDING_APPROVAL' && (
                  <button onClick={() => handleAction(adj.id, 'approve')} disabled={acting === adj.id}
                    style={{ background: '#3b82f6', color: '#fff', border: 0, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Approve</button>
                )}
                {adj.status === 'APPROVED' && adj.fxStatus !== 'BLOCKED_FX' && (
                  <button onClick={() => handleAction(adj.id, 'post')} disabled={acting === adj.id}
                    style={{ background: '#22c55e', color: '#000', border: 0, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Post</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
