'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminPayments,
  fetchPaymentVerificationQueue,
  verifyPayment,
  fetchStalePayments,
  type AdminPayment,
} from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import {
  PageHeader, Card, Button, colors, typeScale, radii,
} from '@scs/ui-kit';

type Tab = 'queue' | 'all' | 'stale';

const STATUS_COLORS: Record<string, string> = {
  AWAITING_VERIFICATION: '#f59e0b',
  AWAITING_PAYMENT: '#6366f1',
  CONFIRMED: '#10b981',
  REJECTED: '#ef4444',
  CANCELLED: '#6b7280',
  EXPIRED: '#9ca3af',
  PARTIALLY_REFUNDED: '#f97316',
  REFUNDED: '#8b5cf6',
};

function PaymentStatusBadge({ status }: { status: string }) {
  const bg = STATUS_COLORS[status] || '#6b7280';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, color: '#fff', background: bg,
    }}>{status.replace(/_/g, ' ')}</span>
  );
}

function formatMinor(minor: number | null, currency?: string) {
  if (minor == null) return '—';
  return `${(minor / 100).toLocaleString()} ${currency || 'SYP'}`;
}

export default function AdminPaymentsPage() {
  useRequirePerms(['admin:payments:read']);
  const [tab, setTab] = useState<Tab>('queue');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data: AdminPayment[];
      if (tab === 'queue') data = await fetchPaymentVerificationQueue();
      else if (tab === 'stale') data = await fetchStalePayments();
      else data = await fetchAdminPayments();
      setPayments(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (paymentId: string, decision: 'CONFIRMED' | 'REJECTED') => {
    setActing(paymentId);
    setError('');
    try {
      await verifyPayment(paymentId, decision);
      await load();
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setActing(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'queue', label: 'Verification Queue' },
    { key: 'all', label: 'All Payments' },
    { key: 'stale', label: 'Stale / Expiring' },
  ];

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader title="Payments" subtitle="P12 — Manual verification & payment management" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', borderRadius: radii.sm, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13,
            background: tab === t.key ? colors.brand[700] : colors.bgSubtle,
            color: tab === t.key ? '#fff' : colors.brand[700],
          }}>{t.label}</button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.sm, color: '#dc2626', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>Loading…</div>
      ) : payments.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center', color: colors.muted }}>
          No payments found in this view.
        </Card>
      ) : (
        <Card style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Order</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Method</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Amount</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Reference</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Created</th>
                {tab === 'queue' && <th style={{ textAlign: 'center', padding: '10px 8px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                    {(p.orderId || '').slice(0, 8)}
                  </td>
                  <td style={{ padding: '10px 8px' }}>{p.paymentMethod?.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '10px 8px' }}><PaymentStatusBadge status={p.status} /></td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{formatMinor(p.amountMinor, p.currency)}</td>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: colors.muted }}>
                    {p.receiptReference || '—'}
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 11 }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  {tab === 'queue' && (
                    <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <Button size="sm" variant="primary" disabled={acting === p.id}
                        onClick={() => handleVerify(p.id, 'CONFIRMED')}>Confirm</Button>{' '}
                      <Button size="sm" variant="danger" disabled={acting === p.id}
                        onClick={() => handleVerify(p.id, 'REJECTED')}>Reject</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
