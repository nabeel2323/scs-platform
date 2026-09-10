'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchKpis, KpiResponse } from '../lib/api';

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

/* ── Dashboard Page ──────────────────────────────────────── */

export default function AdminHomePage() {
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKpis().then(setKpis).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
  const now = new Date();

  return (
    <>
      <style>{`
        .dash-kpi:hover   { box-shadow: 0 6px 24px rgba(22,35,43,.10); }
        .dash-quick:hover  { box-shadow: 0 6px 24px rgba(22,35,43,.10); transform: translateY(-2px); }
        .dash-quick:hover .dash-arrow { stroke: #0f3340; }
      `}</style>

      {/* ── Header Banner ─────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', maxWidth: 1320 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
              Dashboard
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
              Platform overview &amp; quick access
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18, marginBottom: 40 }}>
          <KpiCard icon={<IconUsers />}    label="Total Users"         value={loading ? '—' : String(kpis?.users.total ?? 0)}                accent="#0f3340" tint="#eef4f6" />
          <KpiCard icon={<IconShield />}   label="Verified Merchants"  value={loading ? '—' : String(kpis?.merchants.verified ?? 0)}          accent="#1b7a4b" tint="#eaf5ef" />
          <KpiCard icon={<IconClock />}    label="Pending Merchants"   value={loading ? '—' : String(kpis?.merchants.pending ?? 0)}           accent="#b45309" tint="#fdf3e7" />
          <KpiCard icon={<IconBox />}      label="Total Orders"        value={loading ? '—' : String(kpis?.orders.total ?? 0)}                accent="#1d5fa8" tint="#e8f1f9" />
          <KpiCard icon={<IconDollar />}   label="Revenue"             value={loading ? '—' : `${fmt(kpis?.revenue.totalMinor ?? 0)} SAR`}    accent="#7c3aed" tint="#f3efff" />
          <KpiCard icon={<IconActivity />} label="Completion Rate"     value={loading ? '—' : `${kpis?.orders.completionRate ?? 0}%`}         accent="#047857" tint="#eaf5ef" />
        </div>

        {/* Quick Access */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', margin: 0 }}>Quick Access</h2>
          <div style={{ flex: 1, height: 1, background: '#d9e2e6' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14 }}>
          <QuickLink href="/users"        emoji="👥" title="User Management"    desc="Manage users, roles & permissions" />
          <QuickLink href="/orders"       emoji="📦" title="Order Monitor"      desc="Track all platform orders, filter by status" />
          <QuickLink href="/merchants"    emoji="🏪" title="Merchant Directory"  desc="Browse all stores & verification status" />
          <QuickLink href="/verification" emoji="✓"  title="Verification Queue"  desc="Review pending merchant applications" />
          <QuickLink href="/kpis"         emoji="📊" title="KPI Dashboard"       desc="Activation funnel, conversion & revenue" />
          <QuickLink href="/audit"        emoji="📋" title="Audit Log"           desc="System-wide activity trail" />
        </div>
      </div>
    </>
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

/* ── Quick Link Card ─────────────────────────────────────── */

function QuickLink({ href, emoji, title, desc }: {
  href: string; emoji: string; title: string; desc: string;
}) {
  return (
    <Link href={href} className="dash-quick" style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      textDecoration: 'none',
      boxShadow: '0 1px 3px rgba(22,35,43,.04)',
      transition: 'box-shadow 0.2s ease, transform 0.2s ease',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: '#f2f7f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#5b6b74', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <svg className="dash-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#b0bec5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, transition: 'stroke 0.2s ease' }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
