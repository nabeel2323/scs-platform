'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchOfferRevenueKpis, OfferRevenueKpiResponse, OfferRevenueRow,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import {
  PageHeader, KpiCard, colors, typeScale, radii,
  IconDollar, IconPackage, IconActivity,
} from '@scs/ui-kit';

/**
 * PHASE 17: Platform-wide per-offer revenue KPI dashboard.
 *
 * Surfaces which merchant offers are pulling GMV, joining order_items.offer_id
 * (Phase 10) with offer_snapshot (Phase 15) so the currency label on every
 * figure reflects what was actually committed at checkout time.
 */
export default function OffersKpiPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:kpis:read']);

  const [data, setData] = useState<OfferRevenueKpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState('100');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchOfferRevenueKpis({
        from: from || undefined,
        to: to || undefined,
        storeId: storeId || undefined,
        status: status || undefined,
        limit: limit ? Number(limit) : undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load offer KPIs');
    } finally {
      setLoading(false);
    }
  }, [from, to, storeId, status, limit]);

  useEffect(() => { load(); }, [load]);

  if (!hasAccess) return <AccessDenied requiredPerms={['admin:kpis:read']} missingPerms={missingPerms} />;

  const periodLabel = data
    ? `${new Date(data.from).toLocaleDateString()} — ${new Date(data.to).toLocaleDateString()}`
    : 'Loading period…';

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: `1px solid ${colors.border}`,
    borderRadius: radii.sm, fontSize: typeScale.bodySm.fontSize,
    background: colors.surface, color: colors.brand[700],
  };

  const fmtMoney = (minor: number, cur: string) =>
    `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Offers Revenue KPIs"
        subtitle={periodLabel}
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} aria-label="From date" />
            <span style={{ color: colors.muted, fontSize: typeScale.bodySm.fontSize }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} aria-label="To date" />
            <input
              type="text"
              placeholder="Store ID (optional)"
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              style={{ ...inputStyle, width: 200 }}
              aria-label="Store filter"
            />
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle} aria-label="Offer status">
              <option value="">Any status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="WITHDRAWN">WITHDRAWN</option>
              <option value="REJECTED">REJECTED</option>
              <option value="PROPOSED">PROPOSED</option>
              <option value="DRAFT">DRAFT</option>
            </select>
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={e => setLimit(e.target.value)}
              style={{ ...inputStyle, width: 80 }}
              aria-label="Top N offers"
            />
            <Link href="/offers" style={{ ...typeScale.bodySm, color: colors.brand[700] }}>
              Governance →
            </Link>
          </div>
        }
      />

      {error && (
        <div role="alert" style={{ padding: 12, background: colors.errBg, color: colors.err, borderRadius: radii.sm, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Header KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={<IconActivity />}
          label="Offers Touched"
          value={String(data?.totals.offersTouched ?? 0)}
          accent={colors.brand[700]}
          tint={colors.brand[50]}
        />
        {(data?.totals.byCurrency ?? []).slice(0, 4).map(b => (
          <KpiCard
            key={b.currency}
            icon={<IconDollar />}
            label={`Revenue (${b.currency})`}
            value={fmtMoney(b.revenueMinor, b.currency)}
            accent="#065f46"
            tint={colors.okBg}
          />
        ))}
        {(data?.totals.byCurrency ?? []).slice(0, 4).map(b => (
          <KpiCard
            key={`units-${b.currency}`}
            icon={<IconPackage />}
            label={`Units (${b.currency})`}
            value={b.unitsSold.toLocaleString()}
            accent="#1e40af"
            tint={colors.infoBg ?? '#e3f2fd'}
          />
        ))}
      </div>

      {/* Detail table */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: radii.md, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, ...typeScale.h2, color: colors.brand[700] }}>
          Top Offers by Revenue
        </div>
        {loading ? (
          <div style={{ padding: 24, color: colors.muted }}>Loading…</div>
        ) : !data || data.offers.length === 0 ? (
          <div style={{ padding: 24, color: colors.muted }}>No offer-backed sales in this window.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: colors.bgSubtle }}>
                  {['Store', 'Product', 'Offer', 'Status', 'Currency', 'Orders', 'Units', 'Revenue'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', ...typeScale.bodySm, color: colors.muted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.offers.map((r: OfferRevenueRow) => (
                  <tr key={r.offerId} style={{ borderBottom: `1px solid ${colors.borderLight ?? colors.border}` }}>
                    <td style={{ padding: '8px 12px' }}>{r.storeName || r.storeId.slice(0, 8) + '…'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.productTitle || r.productId.slice(0, 8) + '…'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.offerId.slice(0, 8)}…</td>
                    <td style={{ padding: '8px 12px' }}><StatusPill status={r.offerStatus} /></td>
                    <td style={{ padding: '8px 12px' }}>{r.currency}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{r.ordersCount}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{r.unitsSold}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtMoney(r.revenueMinor, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline status pill reusing ui-kit colors — the shared StatusPill primitive is
 * not currently exported from @scs/ui-kit, so this page keeps its own copy. */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    ACTIVE: { bg: colors.okBg, fg: colors.ok },
    SUSPENDED: { bg: colors.warnBg, fg: colors.warn },
    REJECTED: { bg: colors.errBg, fg: colors.err },
    WITHDRAWN: { bg: colors.bgSubtle, fg: colors.disabled },
    PROPOSED: { bg: colors.infoBg ?? '#e3f2fd', fg: colors.info ?? '#1565c0' },
    DRAFT: { bg: colors.bgSubtle, fg: colors.muted },
  };
  const c = map[status] ?? map['DRAFT']!;
  return <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg }}>{status}</span>;
}
