'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminRequest } from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import { PageHeader, Card, colors, radii, typeScale } from '@scs/ui-kit';

interface CommissionReversal {
  id: string;
  returnRequestId: string;
  refundId: string | null;
  settlementId: string | null;
  originalCommissionMinor: number;
  reversalMinor: number;
  responsibilityCategory: string;
  idempotencyKey: string;
  status: string;
  currency: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  POSTED: '#22c55e',
  REVERSED: '#f59e0b',
  FAILED: '#ef4444',
};

const CATEGORY_COLORS: Record<string, string> = {
  MERCHANT: '#ef4444',
  PLATFORM: '#f59e0b',
  CARRIER_DAMAGE: '#8b5cf6',
  BUYER_REMORSE: '#6b7280',
};

function fmtMinor(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function CommissionOversightPage() {
  useRequirePerms(['admin:commission:read']);
  const [reversals, setReversals] = useState<CommissionReversal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (statusFilter) sp.set('status', statusFilter);
    const qs = sp.toString();
    adminRequest<CommissionReversal[]>(`admin/commission-reversals${qs ? `?${qs}` : ''}`)
      .then(data => setReversals(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#0f1115', color: '#e5e7eb' }}>
      <PageHeader title="Commission Oversight" subtitle="Commission reversals and responsibility tracking" />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ background: '#1e2028', color: '#e5e7eb', border: '1px solid #333', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}
        >
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSED">Reversed</option>
          <option value="FAILED">Failed</option>
        </select>
        <button onClick={load} style={{ background: '#3b82f6', color: '#fff', border: 0, borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>
          Refresh
        </button>
      </div>

      {error && <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {loading && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading...</div>}

      {!loading && reversals.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No commission reversals found.</div>
      )}

      {reversals.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                {['Status', 'Return', 'Category', 'Original Commission', 'Reversal', 'Currency', 'Idempotency Key', 'Created'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reversals.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #1e2028' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: STATUS_COLORS[r.status] || '#6b7280' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.returnRequestId.slice(0, 8)}...</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: CATEGORY_COLORS[r.responsibilityCategory] || '#6b7280' }}>
                      {r.responsibilityCategory}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{fmtMinor(r.originalCommissionMinor, r.currency)}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#22c55e' }}>{fmtMinor(r.reversalMinor, r.currency)}</td>
                  <td style={{ padding: '8px 10px' }}>{r.currency}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.idempotencyKey}</td>
                  <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
