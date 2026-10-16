'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthCard } from '../components/AuthCard';
import { MerchantRegistrationCard } from '../components/MerchantRegistrationCard';
import { useAuth } from '../components/AuthProvider';
import { isMerchantRole } from '../lib/auth';
import {
  PageHeader, QuickLink,
  IconSearch, IconStore, IconShoppingCart, IconPackage,
  IconBell, IconClipboard, IconHeart,
  colors, typeScale,
} from '@scs/ui-kit';

/* ── Home Page ───────────────────────────────────────────── */

export default function HomePage() {
  const [now, setNow] = useState<Date | null>(null);
  const { user } = useAuth();
  const isMerchant = isMerchantRole(user?.role);

  useEffect(() => {
    setNow(new Date());
  }, []);

  return (
    <>
      {/* ── Header Banner ─────────────────────────────────── */}
      <PageHeader
        title="Smart Commerce Platform"
        subtitle="B2B-first marketplace — retailer & merchant portal"
        trailing={now ? (
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ fontSize: typeScale.caption.fontSize, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ) : undefined}
      />

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 24px 48px', maxWidth: 1080, margin: '0 auto' }}>

        {/* Primary Actions */}
        <SectionTitle>Quick Access</SectionTitle>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 32 }}>
          <Link href="/search" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconSearch size={20} />} title="Search Products" desc="Browse catalog with filters" /></Link>
          <Link href="/stores" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconStore size={20} />} title="Browse Stores" desc="Discover wholesalers near you" /></Link>
          <Link href="/cart" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconShoppingCart size={20} />} title="Cart" desc="Multi-supplier checkout" /></Link>
          <Link href="/orders" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconPackage size={20} />} title="My Orders" desc="Track & reorder" /></Link>
        </div>

        {/* Secondary Actions */}
        <SectionTitle>More</SectionTitle>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <Link href="/notifications" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconBell size={20} />} title="Notifications" desc="Order updates & alerts" /></Link>
          {isMerchant && (
            <Link href="/merchant/orders" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconClipboard size={20} />} title="Merchant Orders" desc="Manage incoming orders" /></Link>
          )}
          <Link href="/reviews" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconHeart size={20} />} title="Reviews & Disputes" desc="Rate stores or open disputes" /></Link>
          <Link href="/favorites" style={{ textDecoration: 'none', color: 'inherit' }}><QuickLink icon={<IconHeart size={20} />} title="Saved Suppliers" desc="Your favorite wholesalers" /></Link>
          <MerchantRegistrationCard />
          <AuthCard />
        </div>
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
