'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthCard } from '../components/AuthCard';
import { MerchantRegistrationCard } from '../components/MerchantRegistrationCard';
import { useAuth } from '../components/AuthProvider';
import { isMerchantRole } from '../lib/auth';

/* ── Home Page ───────────────────────────────────────────── */

export default function HomePage() {
  const [now, setNow] = useState<Date | null>(null);
  const { user } = useAuth();
  // Merchant tooling only renders for merchant roles (audit A1-1) — the
  // registration CTA below self-hides for users who are already onboarded.
  const isMerchant = isMerchantRole(user?.role);

  useEffect(() => {
    setNow(new Date());
  }, []);

  return (
    <>
      <style>{`
        .home-quick:hover  { box-shadow: 0 6px 24px rgba(22,35,43,.10); transform: translateY(-2px); }
        .home-quick:hover .home-arrow { stroke: #0f3340; }
      `}</style>

      {/* ── Header Banner ─────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '36px 24px 28px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', maxWidth: 1080, margin: '0 auto' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
              Smart Commerce Platform
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '8px 0 0' }}>
              B2B-first marketplace — retailer &amp; merchant portal
            </p>
          </div>
          {now && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 24px 48px', maxWidth: 1080, margin: '0 auto' }}>

        {/* Primary Actions */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', margin: 0 }}>Quick Access</h2>
          <div style={{ flex: 1, height: 1, background: '#d9e2e6' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 32 }}>
          <QuickLink href="/search"   emoji="🔍" title="Search Products"   desc="Browse catalog with filters" />
          <QuickLink href="/stores"   emoji="🏪" title="Browse Stores"     desc="Discover wholesalers near you" />
          <QuickLink href="/cart"     emoji="🛒" title="Cart"              desc="Multi-supplier checkout" />
          <QuickLink href="/orders"   emoji="📦" title="My Orders"         desc="Track & reorder" />
        </div>

        {/* Secondary Actions */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', margin: 0 }}>More</h2>
          <div style={{ flex: 1, height: 1, background: '#d9e2e6' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <QuickLink href="/notifications"     emoji="🔔" title="Notifications"     desc="Order updates & alerts" />
          {isMerchant && (
            <QuickLink href="/merchant/orders" emoji="📋" title="Merchant Orders"   desc="Manage incoming orders" />
          )}
          <QuickLink href="/reviews"           emoji="⭐" title="Reviews & Disputes" desc="Rate stores or open disputes" />
          <QuickLink href="/favorites"         emoji="❤️" title="Saved Suppliers"    desc="Your favorite wholesalers" />
          <MerchantRegistrationCard />
          <AuthCard />
        </div>
      </div>
    </>
  );
}

/* ── Quick Link Card ─────────────────────────────────────── */

function QuickLink({ href, emoji, title, desc }: {
  href: string; emoji: string; title: string; desc: string;
}) {
  return (
    <Link href={href} className="home-quick" style={{
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
      <svg className="home-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#b0bec5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, transition: 'stroke 0.2s ease' }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
