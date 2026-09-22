'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchProfile, fetchMyStores, Store, UserProfile } from '../../lib/api';
import { pickStore, rememberStoreId } from '../../lib/merchant-store';
import { LoadingSpinner, StatusBadge, formatMinor } from '../../components/Shared';
import { useMerchantRealtime } from '../../lib/useMerchantRealtime';
import type { NewOrderEvent } from '../../lib/realtime';

const CARDS = [
  { href: '/merchant/store', title: 'Store Profile', desc: 'Name, description, currency, address & warehouses', icon: '🏬' },
  { href: '/merchant/warehouses', title: 'Warehouses', desc: 'Manage warehouse locations & contacts', icon: '📦' },
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
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [newOrderAlert, setNewOrderAlert] = useState<NewOrderEvent | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          fetchProfile(),
          fetchMyStores().catch(() => [] as Store[]),
        ]);
        setProfile(p);
        setStores(s);
        setActiveId(pickStore(s)?.id || '');
      } catch { /* handled below via hasOrg */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Gap 2: surface incoming orders in real time. The shared hook joins each of
  // this merchant's store rooms and fires whenever a `new_order` broadcast lands
  // for any of them, so the dashboard announces it without a manual refresh.
  useMerchantRealtime((evt) => setNewOrderAlert(evt));

  // A2-1: selecting a store persists the preference, so every merchant tool
  // (orders, catalog, inventory, pricing, store profile) opens on the same one.
  const handleSelectStore = (sid: string) => {
    rememberStoreId(sid);
    setActiveId(sid);
  };

  if (loading) return <LoadingSpinner />;

  const hasOrg = !!profile?.activeOrgId || (profile?.organizations?.length ?? 0) > 0;
  const org = profile?.organizations?.find(o => o.id === profile?.activeOrgId) || profile?.organizations?.[0];
  const store = stores.find(s => s.id === activeId) || pickStore(stores);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Merchant Dashboard</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          {org ? `${org.name}` : 'Your business'}{store ? ` · ${store.displayName}` : ''}
        </p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {/* New order alert (Gap 2) — dismissible, links straight to the order. */}
      {newOrderAlert && (
        <div style={{ background: '#e6f0f3', border: '1px solid #1e6178', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#0f3340', fontSize: 14 }}>New order received</div>
            <div style={{ fontSize: 12, color: '#1e6178', marginTop: 2 }}>
              {newOrderAlert.itemCount} item(s){newOrderAlert.totalMinor > 0 ? ` · ${formatMinor(newOrderAlert.totalMinor, stores.find((s) => s.id === newOrderAlert.storeId)?.currency)}` : ''} —{' '}
              <Link href={`/merchant/orders/${newOrderAlert.orderId}`} style={{ color: '#0f3340', fontWeight: 600, textDecoration: 'underline' }}>View order</Link>
            </div>
          </div>
          <button onClick={() => setNewOrderAlert(null)} aria-label="Dismiss new order alert" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#5b6b74', padding: '2px 6px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Deactivation warning (G16) — mirrors the organization page banner */}
      {org && org.isActive === false && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div>
            <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 14 }}>Organization Deactivated</div>
            <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>Your organization has been deactivated by an administrator. Merchant tools are read-only until it is reactivated. Contact support for assistance.</div>
          </div>
        </div>
      )}

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
          {stores.length > 1 && (
            <div style={{ marginBottom: 20, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#5b6b74', marginBottom: 10 }}>
                Your stores ({stores.length}) — the tools below open on the selected store
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {stores.map(s => {
                  const active = s.id === store?.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStore(s.id)}
                      aria-pressed={active}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px', fontSize: 13, cursor: 'pointer',
                        background: active ? '#e6f0f3' : '#fff',
                        color: '#0f3340',
                        border: `1px solid ${active ? '#0f3340' : '#d9e2e6'}`,
                        borderRadius: 8,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {s.displayName}
                      <StatusBadge status={s.verificationStatus} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
