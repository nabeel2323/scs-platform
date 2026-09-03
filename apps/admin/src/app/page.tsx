'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchKpis, KpiResponse } from '../lib/api';

export default function AdminHomePage() {
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKpis().then(setKpis).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 28 }}>Platform overview &amp; quick access</p>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <KpiCard label="Total Users" value={loading ? '—' : String(kpis?.users.total ?? 0)} color="#0f3340" />
        <KpiCard label="Verified Merchants" value={loading ? '—' : String(kpis?.merchants.verified ?? 0)} color="#065f46" />
        <KpiCard label="Pending Merchants" value={loading ? '—' : String(kpis?.merchants.pending ?? 0)} color="#92400e" />
        <KpiCard label="Total Orders" value={loading ? '—' : String(kpis?.orders.total ?? 0)} color="#1e40af" />
        <KpiCard label="Revenue" value={loading ? '—' : `${fmt(kpis?.revenue.totalMinor ?? 0)} SAR`} color="#7c3aed" />
        <KpiCard label="Completion Rate" value={loading ? '—' : `${kpis?.orders.completionRate ?? 0}%`} color="#047857" />
      </div>

      {/* Quick Links */}
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Quick Access</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Link href="/orders" style={cardStyle}>
          <b>Order Monitor</b>
          <span>Track all platform orders, filter by status</span>
        </Link>
        <Link href="/merchants" style={cardStyle}>
          <b>Merchant Directory</b>
          <span>Browse all stores &amp; verification status</span>
        </Link>
        <Link href="/verification" style={cardStyle}>
          <b>Verification Queue</b>
          <span>Review pending merchant applications</span>
        </Link>
        <Link href="/kpis" style={cardStyle}>
          <b>KPI Dashboard</b>
          <span>Activation funnel, conversion &amp; revenue</span>
        </Link>
        <Link href="/audit" style={cardStyle}>
          <b>Audit Log</b>
          <span>System-wide activity trail</span>
        </Link>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'block',
  padding: '20px 24px',
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 10,
  textDecoration: 'none',
  boxShadow: '0 1px 2px rgba(22,35,43,.06),0 4px 14px rgba(22,35,43,.05)',
};
