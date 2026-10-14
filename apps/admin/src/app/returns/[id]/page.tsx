'use client';

/**
 * P13 Phase 2 — Admin Return Detail & Escalation Resolution Page
 *
 * Route: /returns/[id]
 * Shows return details and, if ESCALATED, provides a resolution form
 * for approving, rejecting, or cancelling the escalated return.
 */
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminRequest } from '../../../lib/api';
import { useRequirePerms, AccessDenied } from '../../../hooks/useRequirePerms';
import { radii } from '@scs/ui-kit';

interface ReturnDetail {
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
  resolvedBy: string | null;
  resolvedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#f59e0b', MERCHANT_APPROVED: '#3b82f6', BUYER_SHIPPED: '#8b5cf6',
  RECEIVED: '#06b6d4', INSPECTED: '#6366f1', REFUND_PENDING: '#f97316',
  REFUNDED: '#22c55e', MERCHANT_REJECTED: '#ef4444', CANCELLED: '#6b7280',
  EXPIRED: '#6b7280', REJECTED_AFTER_INSPECTION: '#ef4444', REFUND_FAILED: '#ef4444',
  ESCALATED: '#dc2626',
};

const RESPONSIBILITY_OPTIONS = [
  { value: 'MERCHANT', label: 'Merchant — wrong item, quality issue' },
  { value: 'BUYER_REMORSE', label: 'Buyer remorse — changed mind' },
  { value: 'PLATFORM', label: 'Platform — system error, listing mistake' },
  { value: 'CARRIER_DAMAGE', label: 'Carrier damage — shipping incident' },
];

function fmtDate(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function ReturnDetailContent({ id }: { id: string }) {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:returns:read']);
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [ret, setRet] = useState<ReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Resolution form state
  const [action, setAction] = useState<'APPROVE' | 'REJECT' | 'CANCEL'>('APPROVE');
  const [responsibilityCategory, setResponsibilityCategory] = useState('MERCHANT');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const showResolveForm = searchParams?.get('resolve') === '1';

  const load = useCallback(() => {
    if (!hasAccess) { setLoading(false); return; }
    setLoading(true);
    adminRequest<ReturnDetail>(`admin/returns/${encodeURIComponent(id)}`)
      .then((data) => { setRet(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id, hasAccess]);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ret || ret.status !== 'ESCALATED') return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      await adminRequest(`admin/returns/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          responsibilityCategory: action === 'CANCEL' ? undefined : responsibilityCategory,
          notes: notes.trim() || undefined,
        }),
      });
      setSubmitSuccess(true);
      // Reload the return to show updated status
      await load();
    } catch (err: any) {
      setSubmitError(err.message || 'Resolution failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) return <div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.5)' }}>Loading…</div>;
  if (!hasAccess) return <div style={{ padding: '24px 28px' }}><AccessDenied requiredPerms={['admin:returns:read']} missingPerms={missingPerms} /></div>;
  if (loading) return <div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.5)' }}>Loading return details…</div>;
  if (error) return <div style={{ padding: '24px 28px', color: '#ef4444' }}>{error}</div>;
  if (!ret) return <div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.5)' }}>Return not found.</div>;

  const isEscalated = ret.status === 'ESCALATED';
  const isOverdue = isEscalated && ret.escalationDeadline && new Date(ret.escalationDeadline) < new Date();

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/returns" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textDecoration: 'none' }}>
          ← Returns
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>
            Return #{ret.id.slice(0, 12)}…
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            Sub-order: {ret.subOrderId.slice(0, 16)}…
          </p>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: radii.md, fontSize: 13, fontWeight: 700, color: '#fff',
          background: STATUS_COLORS[ret.status] || '#6b7280',
        }}>
          {ret.status}
        </span>
      </div>

      {/* Details */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: radii.lg,
        padding: 20, marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Reason</div>
          <div style={{ fontSize: 14, color: '#fff' }}>{ret.reason}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Requested Refund</div>
          <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>
            {(Number(ret.requestedRefundMinor) / 100).toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Created</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{fmtDate(ret.createdAt)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Buyer</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{ret.buyerId}</div>
        </div>
        {ret.escalatedAt && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Escalated</div>
            <div style={{ fontSize: 14, color: '#dc2626' }}>{fmtDate(ret.escalatedAt)}</div>
          </div>
        )}
        {ret.escalationDeadline && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Admin Deadline</div>
            <div style={{ fontSize: 14, color: isOverdue ? '#ef4444' : 'rgba(255,255,255,0.8)', fontWeight: isOverdue ? 700 : 400 }}>
              {fmtDate(ret.escalationDeadline)} {isOverdue && '(OVERDUE)'}
            </div>
          </div>
        )}
        {ret.responsibilityCategory && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Responsibility</div>
            <div style={{ fontSize: 14, color: '#fff' }}>{ret.responsibilityCategory}</div>
          </div>
        )}
        {ret.resolvedBy && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Resolved By</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{ret.resolvedBy}</div>
          </div>
        )}
        {ret.resolvedAt && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Resolved At</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{fmtDate(ret.resolvedAt)}</div>
          </div>
        )}
      </div>

      {/* Resolution Form (only for ESCALATED returns) */}
      {isEscalated && showResolveForm && !submitSuccess && (
        <div style={{
          border: '1px solid rgba(220,38,38,0.3)', borderRadius: radii.lg,
          padding: 20, marginBottom: 24, background: 'rgba(220,38,38,0.05)',
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#fff' }}>
            Resolve Escalated Return
          </h2>

          {submitError && (
            <div style={{ color: '#ef4444', marginBottom: 16, fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: radii.md }}>
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Action */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }}>
                Resolution Action
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { value: 'APPROVE', label: 'Approve', color: '#3b82f6', desc: '→ MERCHANT_APPROVED' },
                  { value: 'REJECT', label: 'Reject', color: '#ef4444', desc: '→ MERCHANT_REJECTED' },
                  { value: 'CANCEL', label: 'Cancel', color: '#6b7280', desc: '→ CANCELLED' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAction(opt.value)}
                    style={{
                      padding: '8px 16px', borderRadius: radii.md, fontSize: 13, fontWeight: 600,
                      border: `2px solid ${action === opt.value ? opt.color : 'rgba(255,255,255,0.15)'}`,
                      background: action === opt.value ? `${opt.color}22` : 'transparent',
                      color: action === opt.value ? opt.color : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                    <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.7 }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Responsibility Category (not needed for CANCEL) */}
            {action !== 'CANCEL' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }}>
                  Responsibility Category
                </label>
                <select
                  value={responsibilityCategory}
                  onChange={(e) => setResponsibilityCategory(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: radii.md,
                    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 13,
                  }}
                >
                  {RESPONSIBILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }}>
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Reason for this resolution decision…"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: radii.md,
                  border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 24px', borderRadius: radii.md, fontSize: 14, fontWeight: 700,
                  border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                  background: submitting ? 'rgba(255,255,255,0.1)' : '#dc2626',
                  color: '#fff', opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Resolving…' : `Confirm ${action}`}
              </button>
              <Link
                href={`/returns`}
                style={{
                  padding: '10px 24px', borderRadius: radii.md, fontSize: 14, fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                  color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center',
                }}
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div style={{
          border: '1px solid rgba(34,197,94,0.3)', borderRadius: radii.lg,
          padding: 20, marginBottom: 24, background: 'rgba(34,197,94,0.05)',
          color: '#22c55e', fontSize: 14,
        }}>
          Return resolved successfully. New status: <strong>{ret.status}</strong>
        </div>
      )}

      {/* Resolve button if ESCALATED but form not shown */}
      {isEscalated && !showResolveForm && !submitSuccess && (
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/returns/${id}?resolve=1`}
            style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: radii.md,
              fontSize: 14, fontWeight: 700, background: '#dc2626', color: '#fff',
              textDecoration: 'none',
            }}
          >
            Resolve This Return
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ReturnDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return (
    <Suspense fallback={<div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.5)' }}>Loading…</div>}>
      <ReturnDetailContent id={id} />
    </Suspense>
  );
}
