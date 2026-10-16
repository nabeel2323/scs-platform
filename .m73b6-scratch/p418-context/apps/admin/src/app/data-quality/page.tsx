'use client';

import { useState, useEffect } from 'react';
import { fetchDataQualityMetrics, DataQualityMetrics } from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import {
  PageHeader,
  colors, typeScale, radii, shadows,
} from '@scs/ui-kit';

// ── Metric card config ───────────────────────────────────────────

interface MetricCard {
  key: keyof Omit<DataQualityMetrics, 'totalProducts'>;
  label: string;
  description: string;
  severity: 'error' | 'warn' | 'info';
}

const METRIC_CARDS: MetricCard[] = [
  { key: 'missingImages', label: 'Missing Images', description: 'Products without any media entries', severity: 'error' },
  { key: 'missingDescription', label: 'Missing Description', description: 'Products with empty or null description', severity: 'warn' },
  { key: 'missingCategory', label: 'No Category', description: 'Products not assigned to any category', severity: 'warn' },
  { key: 'missingBrand', label: 'No Brand', description: 'Products without a brand association', severity: 'info' },
  { key: 'orphanedVariants', label: 'Orphaned Variants', description: 'Variants whose parent product is deleted', severity: 'error' },
  { key: 'incompleteOffers', label: 'Incomplete Offers', description: 'Merchant offers with no active price', severity: 'error' },
];

const severityStyles: Record<MetricCard['severity'], { bg: string; border: string; text: string; barColor: string }> = {
  error: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', barColor: '#ef4444' },
  warn: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', barColor: '#f59e0b' },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', barColor: '#3b82f6' },
};

// ── Page ─────────────────────────────────────────────────────────

export default function DataQualityPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:product-types:manage']);
  const [metrics, setMetrics] = useState<DataQualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchDataQualityMetrics()
      .then(setMetrics)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load metrics'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:product-types:manage']} missingPerms={missingPerms} />;

  const total = metrics?.totalProducts ?? 0;
  const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';

  // Overall health score: 100% minus weighted penalties
  const healthScore = metrics ? Math.max(0, Math.round(
    100 -
    (metrics.missingImages / Math.max(total, 1)) * 30 -
    (metrics.missingDescription / Math.max(total, 1)) * 15 -
    (metrics.missingCategory / Math.max(total, 1)) * 15 -
    (metrics.missingBrand / Math.max(total, 1)) * 10 -
    (metrics.orphanedVariants / Math.max(total, 1)) * 20 -
    (metrics.incompleteOffers / Math.max(total, 1)) * 10
  )) : null;

  const healthColor = healthScore !== null
    ? healthScore >= 80 ? colors.ok
    : healthScore >= 50 ? colors.warn
    : colors.err
    : colors.muted;

  return (
    <>
      <PageHeader
        title="Data Quality"
        subtitle="Catalog completeness and data hygiene metrics"
      />
      <div style={{ padding: '20px 24px 48px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Error state */}
        {error && (
          <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: radii.md, marginBottom: 20, color: '#991b1b', ...typeScale.bodySm }}>
            {error}
            <button onClick={load} style={{ marginLeft: 12, background: 'none', border: '1px solid #991b1b', borderRadius: radii.sm, padding: '2px 10px', cursor: 'pointer', color: '#991b1b', fontSize: 12 }}>
              Retry
            </button>
          </div>
        )}

        {/* Health score banner */}
        {metrics && (
          <div style={{
            padding: '20px 24px', marginBottom: 24,
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: radii.lg, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
            boxShadow: shadows.sm,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              border: `4px solid ${healthColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, color: healthColor,
              flexShrink: 0,
            }}>
              {healthScore}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ ...typeScale.h2, color: colors.ink, marginBottom: 4 }}>Catalog Health Score</div>
              <div style={{ ...typeScale.bodySm, color: colors.muted }}>
                {total.toLocaleString()} active products tracked.
                {healthScore !== null && healthScore < 80 && ' Focus on the highlighted issues below to improve data quality.'}
                {healthScore !== null && healthScore >= 80 && ' Catalog quality is good. Keep monitoring for regressions.'}
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              style={{
                padding: '8px 18px', ...typeScale.button, color: '#fff',
                background: colors.brand[700], border: 'none', borderRadius: radii.sm,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !metrics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {METRIC_CARDS.map(mc => (
              <div key={mc.key} style={{ height: 120, background: colors.bgSubtle, borderRadius: radii.md, border: `1px solid ${colors.border}` }} />
            ))}
          </div>
        )}

        {/* Metric cards grid */}
        {metrics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {METRIC_CARDS.map(mc => {
              const value = metrics[mc.key];
              const percentage = pct(value);
              const styles = severityStyles[mc.severity];
              const barWidth = total > 0 ? Math.min((value / total) * 100, 100) : 0;
              return (
                <div
                  key={mc.key}
                  style={{
                    padding: '18px 20px',
                    background: styles.bg,
                    border: `1px solid ${styles.border}`,
                    borderRadius: radii.md,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ ...typeScale.bodySm, fontWeight: 600, color: styles.text }}>{mc.label}</div>
                      <div style={{ ...typeScale.caption, color: colors.muted, marginTop: 2 }}>{mc.description}</div>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: styles.text, lineHeight: 1 }}>{value.toLocaleString()}</div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth}%`, background: styles.barColor, borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ ...typeScale.caption, color: colors.muted }}>
                    {percentage}% of {total.toLocaleString()} products
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Responsive: stack cards on mobile */}
        <style>{`
          @media (max-width: 768px) {
            .dq-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </>
  );
}
