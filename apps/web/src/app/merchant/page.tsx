'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchProfile, fetchMyStores, Store, UserProfile } from '../../lib/api';
import { LoadingSpinner, StatusBadge } from '../../components/Shared';

const CARDS = [
  { href: '/merchant/store', title: 'Store Profile', desc: 'Name, description, currency, address & warehouses', icon: '🏬' },
  { href: '/merchant/catalog', title: 'Catalog', desc: 'Products, variants, media & categories', icon: '📦' },
  { href: '/merchant/orders', title: 'Orders', desc: 'Incoming orders — accept & fulfil', icon: '🧾' },
  { href: '/merchant/customers', title: 'Customers', desc: 'Buyers, revenue & order stats', icon: '👥' },
  { href: '/merchant/inventory', title: 'Inventory', desc: 'Stock levels per warehouse & adjustments', icon: '📊' },
  { href: '/merchant/pricing', title: 'Pricing', desc: 'Price lists & volume tiers', icon: '🏷️' },
  { href: '/merchant/import', title: 'Import', desc: 'Bulk product import jobs', icon: '⬆️' },
  { href: '/merchant/organization', title: 'Organization', desc: 'Business details & members', icon: '🏢' },
];

export default function MerchantDashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          fetchProfile(),
          fetchMyStores().catch(() => [] as Store[]),
        ]);
        setProfile(p);
        setStores(s);
      } catch { /* handled below via hasOrg */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const hasOrg = !!profile?.activeOrgId || (profile?.organizations?.length ?? 0) > 0;
  const org = profile?.organizations?.find(o => o.id === profile?.activeOrgId) || profile?.organizations?.[0];
  const store = stores[0];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Merchant Dashboard</h1>
        <p style={{ color: '#5b6b74', fontSize: 14 }}>
          {org ? `${org.name}` : 'Your business'}{store ? ` · ${store.displayName}` : ''}
        </p>
      </div>

      {!hasOrg ? (
        <div style={ctaCard}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Register your business</h2>
          <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16, maxWidth: 420 }}>
            Create an organization to unlock store, catalog, order and customer management.
          </p>
          <Link href="/merchant/register" style={primaryLink}>Get Started</Link>
        </div>
      ) : !store ? (
        <div style={ctaCard}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏬</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Onboard your store</h2>
          <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16, maxWidth: 420 }}>
            Your organization <strong>{org?.name}</strong> is ready. Create a store to start managing your catalog and orders.
          </p>
          <Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 14, color: '#0f3340', fontWeight: 600 }}>{store.displayName}</span>
            <StatusBadge status={store.verificationStatus} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {CARDS.map(c => (
              <Link key={c.href} href={c.href} style={card}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: '#5b6b74', lineHeight: 1.4 }}>{c.desc}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ctaCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 12,
  padding: 32,
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const primaryLink: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  background: '#0f3340',
  color: '#fff',
  borderRadius: 8,
  textDecoration: 'none',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 12,
  padding: 20,
  textDecoration: 'none',
  transition: 'box-shadow 0.15s ease',
};
