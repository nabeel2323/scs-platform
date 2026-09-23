'use client';

import { useState, useEffect } from 'react';
import { fetchKpis, KpiResponse } from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import {
  PageHeader, KpiCard,
  IconUsers, IconShield, IconPackage, IconDollar, IconActivity,
  IconXCircle, IconAlertTriangle, IconCheck, IconCheckCircle,
  IconRefresh,
  colors, typeScale, shadows, radii, transitions,
} from '@scs/ui-kit';

/* ── Page ────────────────────────────────────────────────── */

export default function KpiDashboardPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:kpis:read']);

  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = (f?: string, t?: string) => {
    setLoading(true);
    fetchKpis(f || undefined, t || undefined)
      .then(setKpis)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) =>
    (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const funnelSteps = kpis ? [
    { label: 'Registered',  value: kpis.activationFunnel.registered,  color: colors.brand[700], tint: colors.brand[50] },
    { label: 'Verified',    value: kpis.activationFunnel.verified,    color: '#1e40af', tint: colors.infoBg },
    { label: 'Catalog ≥ 20',value: kpis.activationFunnel.catalogReady,color: '#7c3aed', tint: '#f3efff' },
    { label: 'First Order', value: kpis.activationFunnel.firstOrder,  color: '#047857', tint: colors.okBg },
    { label: 'Repeat ×3',   value: kpis.activationFunnel.repeatThree, color: '#065f46', tint: colors.okBg },
  ] : [];

  const maxFunnel = kpis ? Math.max(kpis.activationFunnel.registered, 1) : 1;
  const periodLabel = kpis
    ? `${new Date(kpis.period.from).toLocaleDateString()} — ${new Date(kpis.period.to).toLocaleDateString()}`
    : 'Loading period...';

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: radii.sm, fontSize: typeScale.bodySm.fontSize,
    background: 'rgba(255,255,255,0.1)',
    color: '#fff', colorScheme: 'dark' as React.CSSProperties['colorScheme'],
  };

  if (!hasAccess) return <AccessDenied requiredPerms={['admin:kpis:read']} missingPerms={missingPerms} />;

  return (
    <>
      <style>{`
        .funnel-row:hover  { background: ${colors.bgSubtle}; }
      `}</style>

      {/* ── Header Banner ─────────────────────────────────── */}
      <PageHeader
        title="KPI Dashboard"
        subtitle={periodLabel}
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: typeScale.bodySm.fontSize }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
            <button onClick={() => load(from, to)} style={{
              padding: '6px 16px', fontSize: typeScale.bodySm.fontSize, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: radii.sm, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Apply</button>
          </div>
        }
      />

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: colors.muted, ...typeScale.body }}>Loading KPIs...</div>
        ) : !kpis ? (
          <div style={{ textAlign: 'center', padding: 80, color: colors.err, ...typeScale.body }}>Failed to load KPIs</div>
        ) : (
          <>
            {/* Revenue & Orders */}
            <SectionTitle>Revenue &amp; Orders</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18, marginBottom: 36 }}>
              <KpiCard icon={<IconDollar />}      label="Total Revenue"        value={`${fmt(kpis.revenue.totalMinor)} SAR`}  accent="#7c3aed" tint="#f3efff" />
              <KpiCard icon={<IconPackage />}      label="Total Orders"         value={String(kpis.orders.total)}              accent="#1e40af" tint={colors.infoBg} />
              <KpiCard icon={<IconCheck />}        label="Completed"            value={String(kpis.orders.completed)}          accent="#065f46" tint={colors.okBg} />
              <KpiCard icon={<IconXCircle />}      label="Cancelled / Rejected" value={String(kpis.orders.cancelled)}          accent={colors.err} tint={colors.errBg} />
              <KpiCard icon={<IconActivity />}     label="Completion Rate"      value={pct(kpis.orders.completionRate)}        accent="#047857" tint={colors.okBg} />
              <KpiCard icon={<IconAlertTriangle />} label="Cancellation Rate"   value={pct(kpis.orders.cancellationRate)}      accent={colors.err} tint={colors.errBg} />
            </div>

            {/* Conversion */}
            <SectionTitle>Conversion</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18, marginBottom: 36 }}>
              <KpiCard icon={<IconUsers />}   label="Total Users"        value={String(kpis.users.total)}                accent={colors.brand[700]} tint={colors.brand[50]} />
              <KpiCard icon={<IconShield />}  label="Verified Merchants" value={String(kpis.merchants.verified)}          accent="#065f46" tint={colors.okBg} />
              <KpiCard icon={<IconPackage />}  label="Pending Merchants"  value={String(kpis.merchants.pending)}           accent={colors.warn} tint={colors.warnBg} />
              <KpiCard icon={<IconCheckCircle />} label="1st Order Conv." value={pct(kpis.conversion.firstOrderRate)}      accent="#1e40af" tint={colors.infoBg} />
              <KpiCard icon={<IconRefresh />}   label="Repeat Order Rate" value={pct(kpis.conversion.repeatOrderRate)}     accent="#7c3aed" tint="#f3efff" />
            </div>

            {/* Activation Funnel */}
            <div style={{
              background: colors.surface, borderRadius: radii.lg,
              border: `1px solid ${colors.border}`,
              boxShadow: shadows.md,
              padding: '24px 28px',
            }}>
              <h2 style={{ ...typeScale.h3, color: colors.brand[700], marginTop: 0, marginBottom: 24 }}>
                Activation Funnel
              </h2>

              {funnelSteps.map((step, i) => {
                const widthPct = Math.max((step.value / maxFunnel) * 100, 3);
                const prev = i > 0 ? funnelSteps[i - 1]! : null;
                const convRate = prev && prev.value > 0
                  ? ((step.value / prev.value) * 100).toFixed(1)
                  : null;
                return (
                  <div key={step.label}>
                    {/* Conversion connector between steps */}
                    {convRate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0 2px 34px', marginBottom: 2 }}>
                        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                          <path d="M6 0v10M2 7l4 4 4-4" stroke={colors.disabled} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span style={{ fontSize: typeScale.caption.fontSize, color: colors.disabled, fontWeight: 500 }}>{convRate}% conversion</span>
                      </div>
                    )}
                    <div className="funnel-row" style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '10px 12px', borderRadius: radii.md,
                      transition: `background ${transitions.fast}`,
                    }}>
                      {/* Step number badge */}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: step.tint, color: step.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: typeScale.bodySm.fontSize, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</div>

                      {/* Label + bar */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: typeScale.body.fontSize, fontWeight: 600, color: colors.brand[700] }}>{step.label}</span>
                          <span style={{ fontSize: typeScale.body.fontSize, fontWeight: 600, color: step.color }}>
                            {step.value.toLocaleString()}
                          </span>
                        </div>
                        <div style={{ height: 10, background: colors.bgSubtle, borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${widthPct}%`,
                            background: `linear-gradient(90deg, ${step.color}, ${step.color}cc)`,
                            borderRadius: 5, transition: 'width 0.5s ease', minWidth: 20,
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Overall activation rate */}
              {kpis.activationFunnel.registered > 0 && (
                <div style={{
                  marginTop: 16, padding: '12px 16px',
                  background: colors.brand[50], borderRadius: radii.md,
                  fontSize: typeScale.body.fontSize, color: colors.brand[700],
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <IconCheckCircle size={18} />
                  Overall activation rate:&nbsp;
                  <strong>{pct((kpis.activationFunnel.repeatThree / kpis.activationFunnel.registered) * 100)}</strong>
                  <span style={{ color: colors.muted }}>(registered → repeat ×3)</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Section Title ───────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <h2 style={{ ...typeScale.h4, color: colors.brand[700], margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: colors.border }} />
    </div>
  );
}
