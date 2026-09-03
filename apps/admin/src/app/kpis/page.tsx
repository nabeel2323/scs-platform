'use client';

import { useState, useEffect } from 'react';
import { fetchKpis, KpiResponse } from '../../lib/api';

export default function KpiDashboardPage() {
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

  const fmt = (n: number) => (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const funnelSteps = kpis ? [
    { label: 'Registered', value: kpis.activationFunnel.registered, color: '#0f3340' },
    { label: 'Verified', value: kpis.activationFunnel.verified, color: '#1e40af' },
    { label: 'Catalog ≥ 20', value: kpis.activationFunnel.catalogReady, color: '#7c3aed' },
    { label: 'First Order', value: kpis.activationFunnel.firstOrder, color: '#047857' },
    { label: 'Repeat ×3', value: kpis.activationFunnel.repeatThree, color: '#065f46' },
  ] : [];

  const maxFunnel = kpis ? Math.max(kpis.activationFunnel.registered, 1) : 1;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>KPI Dashboard</h1>
          <p style={{ color: '#5b6b74', fontSize: 14, margin: 0 }}>
            {kpis ? `${new Date(kpis.period.from).toLocaleDateString()} — ${new Date(kpis.period.to).toLocaleDateString()}` : 'Loading period...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 12 }} />
          <span style={{ color: '#5b6b74', fontSize: 12 }}>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 12 }} />
          <button onClick={() => load(from, to)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Apply</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#5b6b74' }}>Loading KPIs...</div>
      ) : !kpis ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#991b1b' }}>Failed to load KPIs</div>
      ) : (
        <>
          {/* Revenue & Orders */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
            <MetricCard title="Total Revenue" value={`${fmt(kpis.revenue.totalMinor)} SAR`} color="#7c3aed" />
            <MetricCard title="Total Orders" value={String(kpis.orders.total)} color="#1e40af" />
            <MetricCard title="Completed" value={String(kpis.orders.completed)} color="#065f46" />
            <MetricCard title="Cancelled / Rejected" value={String(kpis.orders.cancelled)} color="#991b1b" />
            <MetricCard title="Completion Rate" value={pct(kpis.orders.completionRate)} color="#047857" />
            <MetricCard title="Cancellation Rate" value={pct(kpis.orders.cancellationRate)} color="#991b1b" />
          </div>

          {/* Conversion */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
            <MetricCard title="Total Users" value={String(kpis.users.total)} color="#0f3340" />
            <MetricCard title="Verified Merchants" value={String(kpis.merchants.verified)} color="#065f46" />
            <MetricCard title="Pending Merchants" value={String(kpis.merchants.pending)} color="#92400e" />
            <MetricCard title="1st Order Conv." value={pct(kpis.conversion.firstOrderRate)} color="#1e40af" />
            <MetricCard title="Repeat Order Rate" value={pct(kpis.conversion.repeatOrderRate)} color="#7c3aed" />
          </div>

          {/* Activation Funnel */}
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginTop: 0, marginBottom: 20 }}>Activation Funnel</h2>
            {funnelSteps.map((step, i) => {
              const widthPct = Math.max((step.value / maxFunnel) * 100, 2);
              const prev = i > 0 ? funnelSteps[i - 1]! : null;
              const convRate = prev && prev.value > 0
                ? ((step.value / prev.value) * 100).toFixed(1)
                : null;
              return (
                <div key={step.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>{step.label}</span>
                    <span style={{ fontSize: 13, color: '#5b6b74' }}>
                      {step.value.toLocaleString()}
                      {convRate && <span style={{ fontSize: 11, color: '#a0aec0', marginLeft: 8 }}>({convRate}% from prev)</span>}
                    </span>
                  </div>
                  <div style={{ height: 28, background: '#f0f4f7', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${widthPct}%`, background: step.color, borderRadius: 6, transition: 'width 0.5s ease', minWidth: 30, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                      <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{step.value}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {kpis.activationFunnel.registered > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0f7ff', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
                Overall activation rate: <strong>{pct((kpis.activationFunnel.repeatThree / kpis.activationFunnel.registered) * 100)}</strong> (registered → repeat ×3)
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
