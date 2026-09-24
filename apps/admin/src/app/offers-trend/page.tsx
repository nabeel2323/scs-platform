'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchAdminOfferTrend, OfferTrendResponse, OfferTrendBucket,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { PageHeader, colors, typeScale, radii } from '@scs/ui-kit';

/**
 * PHASE 19: Platform-wide offer sales trend dashboard.
 *
 * Governance counterpart of the Phase 18 merchant trend — same `date_trunc`
 * buckets, but every seller is in scope by default and the response carries a
 * top-N store leaderboard for the selected window. The chart is drawn as an
 * inline SVG so no external chart dependency is introduced.
 */
export default function OffersTrendPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:kpis:read']);

  const [data, setData] = useState<OfferTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [days, setDays] = useState<number>(90);
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [metric, setMetric] = useState<'revenue' | 'units' | 'orders'>('revenue');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminOfferTrend({
        granularity,
        days,
        storeId: storeId || undefined,
        status: status || undefined,
        topStores: 10,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load trend');
    } finally {
      setLoading(false);
    }
  }, [granularity, days, storeId, status]);

  useEffect(() => { load(); }, [load]);

  if (!hasAccess) return <AccessDenied requiredPerms={['admin:kpis:read']} missingPerms={missingPerms} />;

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: `1px solid ${colors.border}`,
    borderRadius: radii.sm, fontSize: typeScale.bodySm.fontSize,
    background: colors.surface, color: colors.brand[700],
  };

  const bucketValues: number[] = useMemo(() =>
    (data?.buckets ?? []).map(b =>
      metric === 'units' ? b.unitsSold : metric === 'orders' ? b.ordersCount : b.revenueMinor,
    ),
    [data, metric]);

  const periodLabel = data
    ? `${new Date(data.from).toLocaleDateString()} — ${new Date(data.to).toLocaleDateString()} · ${data.granularity}`
    : 'Loading period…';

  const peak = useMemo(() => {
    const buckets = data?.buckets ?? [];
    let idx = -1; let max = 0;
    bucketValues.forEach((v, i) => { if (v > max) { max = v; idx = i; } });
    return idx >= 0 && buckets[idx] ? { bucket: buckets[idx]!.bucket, value: max } : null;
  }, [data, bucketValues]);

  // PHASE 20: client-side CSV export of the currently-visible trend series and
  // store leaderboard. Two files rather than one so a spreadsheet can open
  // either without a mixed-schema import prompt. Values with commas/quotes are
  // escaped per RFC 4180 so store names containing punctuation survive.
  const escapeCsv = (v: string | number | null | undefined): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const triggerDownload = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const scopeTag = data?.filters.storeId ? `store-${data.filters.storeId.slice(0, 8)}` : 'platform';
  const rangeTag = data ? `${data.granularity}-${data.from.slice(0, 10)}_${data.to.slice(0, 10)}` : 'trend';
  const downloadBucketsCsv = () => {
    const rows = data?.buckets ?? [];
    if (rows.length === 0) return;
    const header = 'bucket,ordersCount,unitsSold,revenueMinor';
    const lines = rows.map(b => `${b.bucket},${b.ordersCount},${b.unitsSold},${b.revenueMinor}`);
    triggerDownload([header, ...lines].join('\r\n'), `offer-trend-${scopeTag}-${rangeTag}.csv`);
  };
  const downloadTopStoresCsv = () => {
    const rows = data?.topStores ?? [];
    if (rows.length === 0) return;
    const header = 'rank,storeId,storeName,ordersCount,unitsSold,revenueMinor';
    const lines = rows.map((r, i) => [i + 1, r.storeId, escapeCsv(r.storeName), r.ordersCount, r.unitsSold, r.revenueMinor].join(','));
    triggerDownload([header, ...lines].join('\r\n'), `offer-top-stores-${scopeTag}-${rangeTag}.csv`);
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Offer Sales Trend"
        subtitle={periodLabel}
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={granularity} onChange={e => setGranularity(e.target.value as 'day' | 'week')} style={inputStyle} aria-label="Granularity">
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
            </select>
            <select value={String(days)} onChange={e => setDays(Number(e.target.value))} style={inputStyle} aria-label="Window">
              {[30, 90, 180, 365].map(d => <option key={d} value={d}>Last {d}d</option>)}
            </select>
            <input
              type="text"
              placeholder="Store ID (optional)"
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              style={{ ...inputStyle, width: 220 }}
              aria-label="Store filter"
            />
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle} aria-label="Offer status">
              <option value="">Any status</option>
              {['ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'REJECTED', 'PROPOSED', 'DRAFT'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={metric} onChange={e => setMetric(e.target.value as 'revenue' | 'units' | 'orders')} style={inputStyle} aria-label="Metric">
              <option value="revenue">Revenue</option>
              <option value="units">Units</option>
              <option value="orders">Orders</option>
            </select>
            <Link href="/offers-kpis" style={{ ...typeScale.bodySm, color: colors.brand[700] }}>
              KPIs →
            </Link>
          </div>
        }
      />

      {error && (
        <div role="alert" style={{ padding: 12, background: colors.errBg, color: colors.err, borderRadius: radii.sm, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Trend chart */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0, ...typeScale.h2, color: colors.brand[700] }}>
            {metric === 'revenue' ? 'Revenue' : metric === 'units' ? 'Units' : 'Orders'} per bucket
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={downloadBucketsCsv}
              disabled={loading || (data?.buckets.length ?? 0) === 0}
              style={{ ...inputStyle, cursor: 'pointer', opacity: (data?.buckets.length ?? 0) === 0 ? 0.5 : 1 }}
              aria-label="Download trend buckets CSV"
            >
              Download CSV
            </button>
            <span style={{ fontSize: typeScale.bodySm.fontSize, color: colors.muted }}>
              {loading ? 'Loading…' : `${data?.buckets.length ?? 0} bucket${(data?.buckets.length ?? 0) === 1 ? '' : 's'}`}
              {peak && !loading ? ` · peak ${peak.bucket}` : ''}
            </span>
          </div>
        </div>
        <TrendChart buckets={data?.buckets ?? []} values={bucketValues} metric={metric} loading={loading} />
      </div>

      {/* Top-N store leaderboard */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: radii.md, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...typeScale.h2, color: colors.brand[700] }}>
            Top Stores by Revenue ({periodLabel})
          </span>
          <button
            type="button"
            onClick={downloadTopStoresCsv}
            disabled={loading || (data?.topStores.length ?? 0) === 0}
            style={{ ...inputStyle, cursor: 'pointer', opacity: (data?.topStores.length ?? 0) === 0 ? 0.5 : 1 }}
            aria-label="Download top stores CSV"
          >
            Download CSV
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 24, color: colors.muted }}>Loading…</div>
        ) : !data || data.topStores.length === 0 ? (
          <div style={{ padding: 24, color: colors.muted }}>No offer-backed sales in this window.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: colors.bgSubtle }}>
                  {['#', 'Store', 'Orders', 'Units', 'Revenue (minor)'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', ...typeScale.bodySm, color: colors.muted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topStores.map((r, i) => (
                  <tr key={r.storeId} style={{ borderBottom: `1px solid ${colors.borderLight ?? colors.border}` }}>
                    <td style={{ padding: '8px 12px', color: colors.muted }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px' }}>{r.storeName || r.storeId.slice(0, 8) + '…'}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{r.ordersCount}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{r.unitsSold}</td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.revenueMinor.toLocaleString()}</td>
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

/**
 * Inline SVG bar chart. Kept in this file so no chart library is required at
 * runtime. Bars scale to the maximum value; only first/middle/last x-axis
 * labels are drawn to keep the axis readable on long windows.
 */
function TrendChart({ buckets, values, metric, loading }: {
  buckets: OfferTrendBucket[];
  values: number[];
  metric: 'revenue' | 'units' | 'orders';
  loading: boolean;
}) {
  const n = values.length;
  const maxValue = n > 0 ? Math.max(...values) : 0;
  const width = 900; const height = 200; const padL = 8; const padR = 8; const padT = 10; const padB = 26;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const barW = n > 0 ? Math.max(2, chartW / n - 2) : 0;
  const fmt = (v: number) => metric === 'revenue'
    ? (v / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString();

  if (loading && n === 0) {
    return <div style={{ padding: 24, color: colors.muted }}>Loading chart…</div>;
  }
  if (n === 0) {
    return <div style={{ padding: 24, color: colors.muted }}>No data in this range.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} role="img" aria-label="Offer sales trend bar chart">
        <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke={colors.border} strokeWidth={1} />
        {buckets.map((b, i) => {
          const v = values[i] ?? 0;
          const h = maxValue > 0 ? (v / maxValue) * chartH : 0;
          const x = padL + i * (barW + 2);
          const y = padT + (chartH - h);
          const raw = metric === 'revenue' ? b.revenueMinor : metric === 'units' ? b.unitsSold : b.ordersCount;
          const tip = `${b.bucket} · orders ${b.ordersCount} · units ${b.unitsSold} · revenue ${fmt(b.revenueMinor)}`;
          return (
            <g key={b.bucket + i}>
              <rect x={x} y={y} width={barW} height={h} fill={colors.brand[500] ?? colors.brand[700]} opacity={0.85}>
                <title>{tip}</title>
              </rect>
              {(i === 0 || i === n - 1 || (n > 6 && i === Math.floor(n / 2))) && (
                <text x={x + barW / 2} y={padT + chartH + 14} fontSize={10} textAnchor="middle" fill={colors.muted}>{b.bucket.slice(5)}</text>
              )}
              {/* Value label on the tallest bar so the peak is legible. */}
              {i === values.indexOf(maxValue) && maxValue > 0 && (
                <text x={x + barW / 2} y={y - 3} fontSize={10} textAnchor="middle" fill={colors.brand[700]} fontWeight={700}>{fmt(raw)}</text>
              )}
            </g>
          );
        })}
        {maxValue > 0 && (
          <text x={padL} y={padT + 4} fontSize={10} fill={colors.muted}>{fmt(maxValue)}</text>
        )}
      </svg>
    </div>
  );
}
