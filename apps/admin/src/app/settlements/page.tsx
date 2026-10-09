'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminSettlements,
  markSettlementPaid,
  type AdminSettlement,
} from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import {
  PageHeader, Card, Button, colors, typeScale, radii,
} from '@scs/ui-kit';

const SETTLEMENT_COLORS: Record<string, string> = {
  PENDING: '#6b7280',
  CALCULATED: '#6366f1',
  DUE: '#f59e0b',
  PAID: '#10b981',
};

function SettlementBadge({ status }: { status: string }) {
  const bg = SETTLEMENT_COLORS[status] || '#6b7280';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, color: '#fff', background: bg,
    }}>{status}</span>
  );
}

function fmt(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString()} ${currency}`;
}

export default function AdminSettlementsPage() {
  useRequirePerms(['admin:settlements:read']);
  const [settlements, setSettlements] = useState<AdminSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminSettlements(filter ? { status: filter } : undefined);
      setSettlements(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (id: string) => {
    setActing(id);
    try {
      await markSettlementPaid(id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to mark settlement as paid');
    } finally {
      setActing(null);
    }
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader title="Settlements" subtitle="P12 — Merchant settlement tracking" />

      {/* Filter */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ ...typeScale.label, fontSize: 12 }}>Status:</label>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{
          padding: '6px 10px', borderRadius: radii.sm, border: `1px solid ${colors.border}`,
          fontSize: 13,
        }}>
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="CALCULATED">Calculated</option>
          <option value="DUE">Due</option>
          <option value="PAID">Paid</option>
        </select>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.sm, color: '#dc2626', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.muted }}>Loading…</div>
      ) : settlements.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center', color: colors.muted }}>
          No settlements found.
        </Card>
      ) : (
        <Card style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Sub-Order</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Store</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Gross</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Refunds</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Commission</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Net</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Status</th>
                <th style={{ textAlign: 'center', padding: '10px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                    {(s.subOrderId || '').slice(0, 8)}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                    {(s.merchantStoreId || '').slice(0, 8)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmt(s.grossMinor, s.currency)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: '#dc2626' }}>
                    {s.refundMinor > 0 ? `−${fmt(s.refundMinor, s.currency)}` : '—'}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: colors.muted }}>
                    {fmt(s.commissionMinor, s.currency)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>
                    {fmt(s.netMinor, s.currency)}
                  </td>
                  <td style={{ padding: '10px 8px' }}><SettlementBadge status={s.status} /></td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    {['CALCULATED', 'DUE'].includes(s.status) && (
                      <Button size="sm" variant="primary" disabled={acting === s.id}
                        onClick={() => handleMarkPaid(s.id)}>Mark Paid</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
