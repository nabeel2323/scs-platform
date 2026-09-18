'use client';

import { useState, useEffect } from 'react';
import { fetchKpis, KpiResponse } from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

/* ── SVG Icons (Feather-style, 20×20) ───────────────────── */

const s = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const IconUsers    = () => (<svg {...s}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconShield   = () => (<svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>);
const IconClock    = () => (<svg {...s}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>);
const IconBox      = () => (<svg {...s}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>);
const IconDollar   = () => (<svg {...s}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
const IconActivity = () => (<svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>);
const IconXCircle  = () => (<svg {...s}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>);
const IconAlert    = () => (<svg {...s}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>);
const IconTarget   = () => (<svg {...s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>);
const IconRepeat   = () => (<svg {...s}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>);
const IconCheck    = () => (<svg {...s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>);

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
    { label: 'Registered',  value: kpis.activationFunnel.registered,  color: '#0f3340', tint: '#eef4f6' },
    { label: 'Verified',    value: kpis.activationFunnel.verified,    color: '#1e40af', tint: '#e8f1f9' },
    { label: 'Catalog ≥ 20',value: kpis.activationFunnel.catalogReady,color: '#7c3aed', tint: '#f3efff' },
    { label: 'First Order', value: kpis.activationFunnel.firstOrder,  color: '#047857', tint: '#eaf5ef' },
    { label: 'Repeat ×3',   value: kpis.activationFunnel.repeatThree, color: '#065f46', tint: '#eaf5ef' },
  ] : [];

  const maxFunnel = kpis ? Math.max(kpis.activationFunnel.registered, 1) : 1;
  const periodLabel = kpis
    ? `${new Date(kpis.period.from).toLocaleDateString()} — ${new Date(kpis.period.to).toLocaleDateString()}`
    : 'Loading period...';

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6, fontSize: 12, background: 'rgba(255,255,255,0.1)',
    color: '#fff', colorScheme: 'dark' as React.CSSProperties['colorScheme'],
  };

  if (!hasAccess) return <AccessDenied requiredPerms={['admin:kpis:read']} missingPerms={missingPerms} />;

  return (
    <>
      <style>{`
        .dash-kpi:hover    { box-shadow: 0 6px 24px rgba(22,35,43,.10); }
        .funnel-row:hover  { background: #f8fafb; }
      `}</style>

      {/* ── Header Banner ─────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', maxWidth: 1320, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
              KPI Dashboard
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
              {periodLabel}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
            <button onClick={() => load(from, to)} style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, cursor: 'pointer',
            }}>Apply</button>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#5b6b74', fontSize: 14 }}>Loading KPIs...</div>
        ) : !kpis ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#b3372f', fontSize: 14 }}>Failed to load KPIs</div>
        ) : (
          <>
            {/* Revenue & Orders */}
            <SectionTitle>Revenue &amp; Orders</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18, marginBottom: 36 }}>
              <KpiCard icon={<IconDollar />}  label="Total Revenue"        value={`${fmt(kpis.revenue.totalMinor)} SAR`}  accent="#7c3aed" tint="#f3efff" />
              <KpiCard icon={<IconBox />}     label="Total Orders"         value={String(kpis.orders.total)}              accent="#1e40af" tint="#e8f1f9" />
              <KpiCard icon={<IconCheck />}   label="Completed"            value={String(kpis.orders.completed)}          accent="#065f46" tint="#eaf5ef" />
              <KpiCard icon={<IconXCircle />} label="Cancelled / Rejected" value={String(kpis.orders.cancelled)}          accent="#991b1b" tint="#fbeeec" />
              <KpiCard icon={<IconActivity />}label="Completion Rate"      value={pct(kpis.orders.completionRate)}        accent="#047857" tint="#eaf5ef" />
              <KpiCard icon={<IconAlert />}   label="Cancellation Rate"    value={pct(kpis.orders.cancellationRate)}      accent="#991b1b" tint="#fbeeec" />
            </div>

            {/* Conversion */}
            <SectionTitle>Conversion</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18, marginBottom: 36 }}>
              <KpiCard icon={<IconUsers />}  label="Total Users"        value={String(kpis.users.total)}                accent="#0f3340" tint="#eef4f6" />
              <KpiCard icon={<IconShield />} label="Verified Merchants" value={String(kpis.merchants.verified)}          accent="#065f46" tint="#eaf5ef" />
              <KpiCard icon={<IconClock />}  label="Pending Merchants"  value={String(kpis.merchants.pending)}           accent="#b45309" tint="#fdf3e7" />
              <KpiCard icon={<IconTarget />} label="1st Order Conv."    value={pct(kpis.conversion.firstOrderRate)}      accent="#1e40af" tint="#e8f1f9" />
              <KpiCard icon={<IconRepeat />} label="Repeat Order Rate"  value={pct(kpis.conversion.repeatOrderRate)}     accent="#7c3aed" tint="#f3efff" />
            </div>

            {/* Activation Funnel */}
            <div style={{
              background: '#fff', borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)',
              padding: '24px 28px',
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginTop: 0, marginBottom: 24 }}>
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
                          <path d="M6 0v10M2 7l4 4 4-4" stroke="#a0aec0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span style={{ fontSize: 11, color: '#a0aec0', fontWeight: 500 }}>{convRate}% conversion</span>
                      </div>
                    )}
                    <div className="funnel-row" style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '10px 12px', borderRadius: 10,
                      transition: 'background 0.15s ease',
                    }}>
                      {/* Step number badge */}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: step.tint, color: step.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</div>

                      {/* Label + bar */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>{step.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: step.color }}>
                            {step.value.toLocaleString()}
                          </span>
                        </div>
                        <div style={{ height: 10, background: '#f0f4f7', borderRadius: 5, overflow: 'hidden' }}>
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
                  background: '#eef4f6', borderRadius: 10,
                  fontSize: 13, color: '#0f3340',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f3340" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                  </svg>
                  Overall activation rate:&nbsp;
                  <strong>{pct((kpis.activationFunnel.repeatThree / kpis.activationFunnel.registered) * 100)}</strong>
                  <span style={{ color: '#5b6b74' }}>(registered → repeat ×3)</span>
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
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: '#d9e2e6' }} />
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────────── */

function KpiCard({ icon, label, value, accent, tint }: {
  icon: React.ReactNode; label: string; value: string; accent: string; tint: string;
}) {
  return (
    <div className="dash-kpi" style={{
      background: '#fff',
      borderRadius: 12,
      padding: '20px 22px',
      borderLeft: `4px solid ${accent}`,
      boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'box-shadow 0.2s ease',
      cursor: 'default',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: tint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#5b6b74',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4,
        }}>{label}</div>
        <div style={{
          fontSize: 24, fontWeight: 700, color: accent,
          lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{value}</div>
      </div>
    </div>
  );
}
