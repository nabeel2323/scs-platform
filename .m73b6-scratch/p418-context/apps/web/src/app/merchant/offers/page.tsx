'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchMerchantOffers, createMerchantOffer, proposeOffer, withdrawOffer,
  Offer, CreateOfferInput, fetchStoreProducts, Product,
  fetchMerchantOfferAnalytics, OfferAnalyticsRow,
  fetchMerchantOfferTrend, OfferTrendPoint,
} from '../../../lib/buyer-api';
import { fetchMyStores, Store } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState, formatMinor } from '../../../components/Shared';
import { PageHeader, colors, typeScale, radii } from '@scs/ui-kit';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: colors.bgSubtle, fg: colors.muted },
  PROPOSED: { bg: colors.infoBg ?? '#e3f2fd', fg: colors.info ?? '#1565c0' },
  ACTIVE: { bg: colors.okBg, fg: colors.ok },
  SUSPENDED: { bg: colors.warnBg, fg: colors.warn },
  REJECTED: { bg: colors.errBg, fg: colors.err },
  WITHDRAWN: { bg: colors.bgSubtle, fg: colors.disabled },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS['DRAFT']!;
  return <span style={{ padding: '2px 8px', borderRadius: radii.sm, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg }}>{status}</span>;
}

export default function MerchantOffersPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  // PHASE 16: per-offer sales performance keyed by offerId so the table can
  // enrich each row with orders/units/revenue without a second join.
  const [analyticsByOffer, setAnalyticsByOffer] = useState<Record<string, OfferAnalyticsRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  // PHASE 18: time-series trend state. `trendOfferId=''` means store-wide.
  const [trendPoints, setTrendPoints] = useState<OfferTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week'>('day');
  const [trendDays, setTrendDays] = useState<number>(90);
  const [trendOfferId, setTrendOfferId] = useState<string>('');
  const [trendMetric, setTrendMetric] = useState<'units' | 'revenue' | 'orders'>('revenue');

  // Create form state
  const [formProductId, setFormProductId] = useState('');
  const [formVariantId, setFormVariantId] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formMoq, setFormMoq] = useState('1');
  const [formLeadTime, setFormLeadTime] = useState('');
  const [formCurrency, setFormCurrency] = useState('SAR');
  const [creating, setCreating] = useState(false);

  const loadOffers = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [data, analytics] = await Promise.all([
        fetchMerchantOffers(storeId, filterStatus || undefined),
        // Non-fatal: fall back silently to zero-sales rows if the analytics
        // call fails (e.g., a stale build without the endpoint).
        fetchMerchantOfferAnalytics(storeId).catch(() => [] as OfferAnalyticsRow[]),
      ]);
      setOffers(data);
      const map: Record<string, OfferAnalyticsRow> = {};
      for (const row of analytics) map[row.offerId] = row;
      setAnalyticsByOffer(map);
    } catch (err: any) {
      setError(err.message || 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, [storeId, filterStatus]);

  useEffect(() => {
    fetchMyStores().then(s => {
      setStores(s);
      const picked = pickStore(s);
      if (picked) setStoreId(picked.id);
    }).catch(() => setError('Failed to load stores'));
  }, []);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  // PHASE 18: refresh the trend series whenever the store, granularity, window,
  // or offer filter changes. Errors are isolated so a slow trend endpoint can't
  // block the main offers table from rendering.
  const loadTrend = useCallback(async () => {
    if (!storeId) { setTrendPoints([]); return; }
    setTrendLoading(true);
    setTrendError('');
    try {
      const data = await fetchMerchantOfferTrend({
        storeId,
        offerId: trendOfferId || undefined,
        granularity: trendGranularity,
        days: trendDays,
      });
      setTrendPoints(data);
    } catch (err: any) {
      setTrendError(err?.message || 'Failed to load trend');
      setTrendPoints([]);
    } finally {
      setTrendLoading(false);
    }
  }, [storeId, trendOfferId, trendGranularity, trendDays]);

  useEffect(() => { loadTrend(); }, [loadTrend]);

  useEffect(() => {
    if (!storeId) return;
    fetchStoreProducts(storeId).then(res => setProducts(res.items as Product[])).catch(() => {});
  }, [storeId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProductId || !formPrice) return;
    setCreating(true);
    setError('');
    try {
      const input: CreateOfferInput = {
        storeId,
        productId: formProductId,
        variantId: formVariantId || undefined,
        basePriceMinor: Math.round(Number(formPrice) * 100),
        currency: formCurrency,
        moq: Number(formMoq) || 1,
        leadTimeDays: formLeadTime ? Number(formLeadTime) : undefined,
      };
      await createMerchantOffer(input);
      setShowCreate(false);
      setFormProductId(''); setFormVariantId(''); setFormPrice(''); setFormMoq('1'); setFormLeadTime('');
      await loadOffers();
    } catch (err: any) {
      setError(err.message || 'Failed to create offer');
    } finally {
      setCreating(false);
    }
  }

  async function handlePropose(id: string) {
    try { await proposeOffer(id); await loadOffers(); } catch (e: any) { setError(e.message); }
  }
  async function handleWithdraw(id: string) {
    try { await withdrawOffer(id); await loadOffers(); } catch (e: any) { setError(e.message); }
  }

  /**
   * PHASE 21: client-side CSV export of the offers + analytics table exactly
   * as currently rendered (respects the store and status filters already
   * applied server-side, so no separate query is issued). Reuses the RFC 4180
   * escaping pattern introduced in Phase 20 so product titles containing
   * commas/quotes don't shift columns.
   */
  function handleExportAnalyticsCsv() {
    if (offers.length === 0) return;
    const escapeCsv = (v: string | number | null | undefined): string => {
      if (v == null) return '';
      const s = String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'offerId,status,productTitle,variantSku,variantTitle,currency,basePriceMinor,moq,leadTimeDays,ordersCount,unitsSold,revenueMinor,createdAt';
    const productTitleById: Record<string, string> = {};
    for (const p of products) productTitleById[p.id] = p.title;
    const lines = offers.map(o => {
      const a = analyticsByOffer[o.id];
      const productTitle = a?.productTitle ?? productTitleById[o.productId] ?? '';
      return [
        o.id,
        o.status,
        escapeCsv(productTitle),
        escapeCsv(a?.variantSku ?? null),
        escapeCsv(a?.variantTitle ?? null),
        o.currency,
        o.basePriceMinor ?? '',
        o.moq,
        o.leadTimeDays ?? '',
        a?.ordersCount ?? 0,
        a?.unitsSold ?? 0,
        a?.revenueMinor ?? 0,
        o.createdAt,
      ].join(',');
    });
    const csv = [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const statusTag = filterStatus ? `-${filterStatus.toLowerCase()}` : '';
    a.download = `merchant-offers-analytics-${storeId.slice(0, 8)}${statusTag}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200 }}>
      <PageHeader title="My Offers" subtitle="Manage your product offers for the marketplace" />
      {error && <ErrorBanner message={error} />}

      {/* Store selector + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: '6px 12px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 14 }}>
          <option value="">Select store…</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 12px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 14 }}>
          <option value="">All statuses</option>
          {['DRAFT', 'PROPOSED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'WITHDRAWN'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* PHASE 21: export the currently-visible offers+analytics rows */}
        <button
          type="button"
          onClick={handleExportAnalyticsCsv}
          disabled={offers.length === 0}
          style={{ ...actionBtn, opacity: offers.length === 0 ? 0.5 : 1 }}
          aria-label="Download offers analytics CSV"
        >
          Download CSV
        </button>
        <button onClick={() => setShowCreate(!showCreate)} style={{ marginLeft: 'auto', padding: '8px 16px', background: colors.brand[700], color: '#fff', border: 'none', borderRadius: radii.sm, cursor: 'pointer', ...typeScale.button }}>
          {showCreate ? 'Cancel' : '+ New Offer'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ marginBottom: 24, padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.bgSubtle }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>
              Product
              <select value={formProductId} onChange={e => setFormProductId(e.target.value)} required style={inputStyle}>
                <option value="">Select…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Variant (optional)
              <input value={formVariantId} onChange={e => setFormVariantId(e.target.value)} placeholder="UUID" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Price (major units)
              <input type="number" step="0.01" min="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Currency
              <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)} style={inputStyle}>
                {['SAR', 'AED', 'USD', 'EUR', 'KWD', 'BHD', 'OMR', 'QAR'].map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              MOQ
              <input type="number" min="1" value={formMoq} onChange={e => setFormMoq(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Lead time (days)
              <input type="number" min="0" value={formLeadTime} onChange={e => setFormLeadTime(e.target.value)} placeholder="Optional" style={inputStyle} />
            </label>
          </div>
          <button type="submit" disabled={creating} style={{ marginTop: 12, padding: '8px 20px', background: colors.ok, color: '#fff', border: 'none', borderRadius: radii.sm, cursor: creating ? 'wait' : 'pointer' }}>
            {creating ? 'Creating…' : 'Create Offer'}
          </button>
        </form>
      )}

      {/* PHASE 18: Sales trend panel — per-bucket orders/units/revenue across
          either the whole store or a single selected offer. Renders an inline
          SVG bar chart with no external chart library. */}
      <TrendPanel
        points={trendPoints}
        loading={trendLoading}
        error={trendError}
        currency={offers[0]?.currency ?? 'SAR'}
        offers={offers}
        products={products}
        granularity={trendGranularity}
        onGranularity={setTrendGranularity}
        days={trendDays}
        onDays={setTrendDays}
        offerId={trendOfferId}
        onOfferId={setTrendOfferId}
        metric={trendMetric}
        onMetric={setTrendMetric}
      />

      {/* Offers table */}
      {loading ? <LoadingSpinner /> : offers.length === 0 ? <EmptyState title="No offers" description="Create an offer to get started." /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                {['Status', 'Product', 'Price', 'MOQ', 'Lead Time', 'Orders', 'Units', 'Revenue', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: colors.muted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map(o => {
                const a = analyticsByOffer[o.id];
                return (
                <tr key={o.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '8px 12px' }}><StatusBadge status={o.status} /></td>
                  <td style={{ padding: '8px 12px' }}>
                    <span>{products.find(p => p.id === o.productId)?.title ?? o.productId.slice(0, 8) + '…'}</span>
                    {o.variantId && <small style={{ display: 'block', color: colors.muted }}>Variant: {o.variantId.slice(0, 8)}…</small>}
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{formatMinor(o.basePriceMinor, o.currency)}</td>
                  <td style={{ padding: '8px 12px' }}>{o.moq}</td>
                  <td style={{ padding: '8px 12px' }}>{o.leadTimeDays ? `${o.leadTimeDays}d` : '—'}</td>
                  {/* PHASE 16: performance columns sourced from order_items + offer_snapshot */}
                  <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{a?.ordersCount ?? 0}</td>
                  <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{a?.unitsSold ?? 0}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatMinor(a?.revenueMinor ?? 0, o.currency)}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {o.status === 'DRAFT' && <button onClick={() => handlePropose(o.id)} style={actionBtn}>Propose</button>}
                    {(o.status === 'PROPOSED' || o.status === 'ACTIVE') && <button onClick={() => handleWithdraw(o.id)} style={actionBtn}>Withdraw</button>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: colors.muted, fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 14, background: colors.surface };
const actionBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: radii.sm, cursor: 'pointer', background: colors.surface };

/**
 * PHASE 18: inline SVG bar chart of sales trend per time bucket. Kept in-file
 * to avoid pulling a chart library. Renders 0..N buckets as evenly-spaced bars
 * scaled to the max metric value, and a summary line for peak bucket.
 */
function TrendPanel(props: {
  points: OfferTrendPoint[];
  loading: boolean;
  error: string;
  currency: string;
  offers: Offer[];
  products: Product[];
  granularity: 'day' | 'week';
  onGranularity: (g: 'day' | 'week') => void;
  days: number;
  onDays: (n: number) => void;
  offerId: string;
  onOfferId: (id: string) => void;
  metric: 'units' | 'revenue' | 'orders';
  onMetric: (m: 'units' | 'revenue' | 'orders') => void;
}) {
  const { points, loading, error, currency, offers, products, granularity, onGranularity, days, onDays, offerId, onOfferId, metric, onMetric } = props;
  const productTitleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of products) m[p.id] = p.title;
    return m;
  }, [products]);
  const { values, maxValue, peak } = useMemo(() => {
    const vals = points.map(p =>
      metric === 'units' ? p.unitsSold : metric === 'orders' ? p.ordersCount : p.revenueMinor,
    );
    const max = vals.length ? Math.max(...vals) : 0;
    let peakIdx = -1; let peakVal = 0;
    vals.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakIdx = i; } });
    const peakPoint = peakIdx >= 0 ? points[peakIdx] : undefined;
    return {
      values: vals,
      maxValue: max,
      peak: peakPoint ? { bucket: peakPoint.bucket, value: peakVal } : null,
    };
  }, [points, metric]);

  const width = 720; const height = 160; const padL = 8; const padR = 8; const padT = 10; const padB = 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const n = values.length;
  const barW = n > 0 ? Math.max(2, chartW / n - 2) : 0;
  const fmt = (v: number) =>
    metric === 'revenue' ? formatMinor(v, currency) : v.toLocaleString();

  // PHASE 20: client-side CSV export of the currently-visible trend series.
  // Serializes to the same shape the server returned (bucket, orders, units,
  // revenue) with an optional currency column so a mixed-currency store stays
  // unambiguous when the file is opened in a spreadsheet.
  const downloadCsv = () => {
    if (points.length === 0) return;
    const header = 'bucket,ordersCount,unitsSold,revenueMinor,currency';
    const lines = points.map(p => `${p.bucket},${p.ordersCount},${p.unitsSold},${p.revenueMinor},${currency}`);
    const csv = [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const scope = offerId ? `offer-${offerId.slice(0, 8)}` : 'store-wide';
    a.download = `offer-trend-${scope}-${granularity}-${points[0]?.bucket ?? ''}_${points[points.length - 1]?.bucket ?? ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section style={{ marginBottom: 24, padding: 16, border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.surface }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: colors.brand[700], fontWeight: 700 }}>Sales Trend</h3>
        <select value={offerId} onChange={e => onOfferId(e.target.value)} style={inputStyle} aria-label="Offer filter">
          <option value="">Store-wide</option>
          {offers.map(o => (
            <option key={o.id} value={o.id}>
              {(productTitleById[o.productId] ?? o.productId.slice(0, 8)) + ` · ${o.status}`}
            </option>
          ))}
        </select>
        <select value={granularity} onChange={e => onGranularity(e.target.value as 'day' | 'week')} style={inputStyle} aria-label="Granularity">
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
        </select>
        <select value={String(days)} onChange={e => onDays(Number(e.target.value))} style={inputStyle} aria-label="Window">
          {[30, 90, 180, 365].map(d => <option key={d} value={d}>Last {d}d</option>)}
        </select>
        <select value={metric} onChange={e => onMetric(e.target.value as 'units' | 'revenue' | 'orders')} style={inputStyle} aria-label="Metric">
          <option value="revenue">Revenue</option>
          <option value="units">Units</option>
          <option value="orders">Orders</option>
        </select>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={n === 0}
          style={{ ...actionBtn, opacity: n === 0 ? 0.5 : 1 }}
          aria-label="Download trend CSV"
        >
          Download CSV
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.muted }}>
          {loading ? 'Loading…' : `${n} bucket${n === 1 ? '' : 's'}`}
          {peak && !loading ? ` · peak ${peak.bucket} = ${fmt(peak.value)}` : ''}
        </span>
      </div>

      {error && <div style={{ color: colors.err, fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {n === 0 && !loading ? (
        <div style={{ fontSize: 13, color: colors.muted, padding: '24px 0', textAlign: 'center' }}>No sales in this range.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg width={width} height={height} role="img" aria-label="Sales trend bar chart">
            {/* baseline */}
            <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke={colors.border} strokeWidth={1} />
            {points.map((point, i) => {
              const v = values[i] ?? 0;
              const h = maxValue > 0 ? (v / maxValue) * chartH : 0;
              const x = padL + i * (barW + 2);
              const y = padT + (chartH - h);
              const tip = `${point.bucket} · orders ${point.ordersCount} · units ${point.unitsSold} · ${metric === 'revenue' ? formatMinor(point.revenueMinor, currency) : point[metric === 'units' ? 'unitsSold' : 'ordersCount']}`;
              return (
                <g key={point.bucket + i}>
                  <rect x={x} y={y} width={barW} height={h} fill={colors.brand[500] ?? colors.brand[700]} opacity={0.85}>
                    <title>{tip}</title>
                  </rect>
                  {/* Sparse x-axis labels: first, middle, last only */}
                  {(i === 0 || i === n - 1 || (n > 6 && i === Math.floor(n / 2))) && (
                    <text x={x + barW / 2} y={padT + chartH + 14} fontSize={10} textAnchor="middle" fill={colors.muted}>{point.bucket.slice(5)}</text>
                  )}
                </g>
              );
            })}
            {/* max value label */}
            {maxValue > 0 && (
              <text x={padL} y={padT + 4} fontSize={10} fill={colors.muted}>{fmt(maxValue)}</text>
            )}
          </svg>
        </div>
      )}
    </section>
  );
}
