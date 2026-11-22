'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAdminPayments,
  fetchPaymentVerificationQueue,
  verifyPayment,
  fetchStalePayments,
  fetchRequestedRefunds,
  approveRefund,
  type AdminPayment,
  type AdminRefund,
} from '../../lib/api';
import { AccessDenied, useRequirePerms } from '../../hooks/useRequirePerms';
import { PageHeader, Card, Button, colors, radii } from '@scs/ui-kit';

type Tab = 'queue' | 'all' | 'stale' | 'refunds';

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
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        background: STATUS_COLORS[status] || '#6b7280',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatMinor(minor: number | null, currency?: string) {
  if (minor == null) return '—';
  return `${(minor / 100).toLocaleString()} ${currency || 'SYP'}`;
}

export default function AdminPaymentsPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:payments:read']);
  const { hasAccess: canVerifyPayments } = useRequirePerms(['admin:payments:verify']);
  const { hasAccess: canApproveRefunds } = useRequirePerms(['admin:refunds:approve']);
  const [tab, setTab] = useState<Tab>(canVerifyPayments ? 'queue' : hasAccess ? 'all' : 'refunds');
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const requestVersion = useRef(0);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasAccess && !(tab === 'refunds' && canApproveRefunds)) return;
    if (tab === 'queue' && !canVerifyPayments) {
      setTab('all');
      return;
    }
    if (tab === 'refunds' && !canApproveRefunds) {
      setTab(canVerifyPayments ? 'queue' : 'all');
      return;
    }

    const requestId = ++requestVersion.current;
    setLoading(true);
    setLoadError('');
    setActionError('');
    try {
      if (tab === 'refunds') {
        const data = await fetchRequestedRefunds();
        if (requestId === requestVersion.current) setRefunds(data);
      } else {
        let data: AdminPayment[];
        if (tab === 'queue') data = await fetchPaymentVerificationQueue();
        else if (tab === 'stale') data = await fetchStalePayments();
        else data = await fetchAdminPayments();
        if (requestId === requestVersion.current) setPayments(data);
      }
    } catch (err: any) {
      if (requestId === requestVersion.current) {
        setLoadError(err.message || 'Failed to load payments');
      }
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [tab, hasAccess, canVerifyPayments, canApproveRefunds]);

  useEffect(() => {
    if (hasAccess || (tab === 'refunds' && canApproveRefunds)) void load();
    return () => { requestVersion.current += 1; };
  }, [load, hasAccess, tab, canApproveRefunds]);

  const handleVerify = async (paymentId: string, decision: 'CONFIRMED' | 'REJECTED') => {
    if (!canVerifyPayments) return;
    setActing(paymentId);
    setActionError('');
    try {
      await verifyPayment(paymentId, decision);
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Verification failed');
    } finally {
      setActing(null);
    }
  };

  const handleApproveRefund = async (refund: AdminRefund) => {
    const amount = formatMinor(refund.amountMinor, refund.currency);
    if (
      !canApproveRefunds ||
      !window.confirm(`Approve refund of ${amount} for order ${refund.orderId.slice(0, 8)}?`)
    ) {
      return;
    }

    setActing(refund.id);
    setActionError('');
    try {
      await approveRefund(refund.id);
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Refund approval failed');
    } finally {
      setActing(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    ...(canVerifyPayments ? [{ key: 'queue' as const, label: 'Verification Queue' }] : []),
    ...(hasAccess
      ? [
          { key: 'all' as const, label: 'All Payments' },
          { key: 'stale' as const, label: 'Stale / Expiring' },
        ]
      : []),
    ...(canApproveRefunds ? [{ key: 'refunds' as const, label: 'Refund Requests' }] : []),
  ];

  if (!hasAccess && !canApproveRefunds) {
    return <AccessDenied requiredPerms={['admin:payments:read']} missingPerms={missingPerms} />;
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader
        title="Payments"
        subtitle="P12 — Manual verification, refunds & payment management"
      />

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              padding: '8px 16px',
              borderRadius: radii.sm,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              background: tab === item.key ? colors.brand[700] : colors.bgSubtle,
              color: tab === item.key ? '#fff' : colors.brand[700],
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div role="alert" style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.sm, color: '#dc2626', marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{loadError}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {actionError && (
        <div role="alert" style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.sm, color: '#dc2626', marginBottom: 12, fontSize: 13 }}>
          {actionError}
        </div>
      )}

      {loadError ? null : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>Loading…</div>
      ) : tab === 'refunds' ? (
        refunds.length === 0 ? (
          <Card style={{ padding: 32, textAlign: 'center', color: colors.muted }}>
            No refund requests awaiting approval.
          </Card>
        ) : (
          <Card style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Order</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Payment</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Refund amount</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Reason</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Requested</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                      {refund.orderId.slice(0, 8)}
                    </td>
                    <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                      {refund.paymentRecordId.slice(0, 8)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>
                      {formatMinor(refund.amountMinor, refund.currency)}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{refund.reason.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '10px 8px', fontSize: 11 }}>
                      {new Date(refund.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={acting === refund.id}
                        onClick={() => handleApproveRefund(refund)}
                      >
                        Approve refund
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
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
                {tab === 'queue' && canVerifyPayments && (
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                    {(payment.orderId || '').slice(0, 8)}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    {payment.paymentMethod?.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <PaymentStatusBadge status={payment.status} />
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    {formatMinor(payment.amountMinor, payment.currency)}
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: colors.muted }}>
                    {payment.receiptReference || '—'}
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 11 }}>
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </td>
                  {tab === 'queue' && canVerifyPayments && (
                    <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={acting === payment.id}
                        onClick={() => handleVerify(payment.id, 'CONFIRMED')}
                      >
                        Confirm
                      </Button>{' '}
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={acting === payment.id}
                        onClick={() => handleVerify(payment.id, 'REJECTED')}
                      >
                        Reject
                      </Button>
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
