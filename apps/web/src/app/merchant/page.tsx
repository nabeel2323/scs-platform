'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchProfile, fetchMyStores, Store, UserProfile } from '../../lib/api';
import { pickStore, rememberStoreId } from '../../lib/merchant-store';
import { LoadingSpinner, StatusBadge, formatMinor } from '../../components/Shared';
import { useMerchantRealtime } from '../../lib/useMerchantRealtime';
import type { NewOrderEvent } from '../../lib/realtime';
import {
  PageHeader, Card,
  colors, typeScale, radii, shadows, transitions,
} from '@scs/ui-kit';

const CARDS = [
  { href: '/merchant/store', title: 'Store Profile', desc: 'Name, description, currency, address & warehouses', icon: '🏬' },
  { href: '/merchant/warehouses', title: 'Warehouses', desc: 'Manage warehouse locations & contacts', icon: '📦' },
  { href: '/merchant/catalog', title: 'Catalog', desc: 'Products, variants, media & categories', icon: '📦' },
  { href: '/merchant/orders', title: 'Orders', desc: 'Incoming orders — accept & fulfil', icon: '🧾' },
  { href: '/merchant/customers', title: 'Customers', desc: 'Buyers, revenue & order stats', icon: '👥' },
  { href: '/merchant/inventory', title: 'Inventory', desc: 'Stock levels per warehouse & adjustments', icon: '📊' },
  { href: '/merchant/pricing', title: 'Pricing', desc: 'Price lists & volume tiers', icon: '🏷️' },
  { href: '/merchant/import', title: 'Import', desc: 'Bulk product import jobs', icon: '⬆️' },
  { href: '/merchant/requests', title: 'Catalog Requests', desc: 'Request new categories, brands or attributes', icon: '📋' },
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
      <PageHeader
        title="Merchant Dashboard"
        subtitle={`${org ? org.name : 'Your business'}${store ? ` · ${store.displayName}` : ''}`}
      />
      <div style={{ padding: '20px 24px 48px' }}>

      {/* New order alert (Gap 2) — dismissible, links straight to the order. */}
      {newOrderAlert && (
        <div style={{ background: colors.brand[50], border: `1px solid ${colors.brand[500]}`, borderRadius: radii.md, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: typeScale.body.fontSize, fontWeight: 600, lineHeight: typeScale.body.lineHeight, color: colors.brand[700] }}>New order received</div>
            <div style={{ ...typeScale.bodySm, color: colors.brand[500], marginTop: 2 }}>
              {newOrderAlert.itemCount} item(s){newOrderAlert.totalMinor > 0 ? ` · ${formatMinor(newOrderAlert.totalMinor, stores.find((s) => s.id === newOrderAlert.storeId)?.currency)}` : ''} —{' '}
              <Link href={`/merchant/orders/${newOrderAlert.orderId}`} style={{ color: colors.brand[700], fontWeight: 600, textDecoration: 'underline' }}>View order</Link>
            </div>
          </div>
          <button onClick={() => setNewOrderAlert(null)} aria-label="Dismiss new order alert" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: colors.muted, padding: '2px 6px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Deactivation warning (G16) — mirrors the organization page banner */}
      {org && org.isActive === false && (
        <div style={{ background: colors.errBg, border: `1px solid ${colors.err}`, borderRadius: radii.md, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div>
            <div style={{ fontSize: typeScale.body.fontSize, fontWeight: 600, lineHeight: typeScale.body.lineHeight, color: colors.err }}>Organization Deactivated</div>
            <div style={{ ...typeScale.bodySm, color: colors.err, marginTop: 2 }}>Your organization has been deactivated by an administrator. Merchant tools are read-only until it is reactivated. Contact support for assistance.</div>
          </div>
        </div>
      )}

      {!hasOrg ? (
        <Card style={ctaCard}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <h2 style={{ ...typeScale.h2, color: colors.brand[700], marginBottom: 8 }}>Register your business</h2>
          <p style={{ ...typeScale.body, color: colors.muted, marginBottom: 16, maxWidth: 420 }}>
            Create an organization to unlock store, catalog, order and customer management.
          </p>
          <Link href="/merchant/register" style={primaryLink}>Get Started</Link>
        </Card>
      ) : !store ? (
        <Card style={ctaCard}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏬</div>
          <h2 style={{ ...typeScale.h2, color: colors.brand[700], marginBottom: 8 }}>Onboard your store</h2>
          <p style={{ ...typeScale.body, color: colors.muted, marginBottom: 16, maxWidth: 420 }}>
            Your organization <strong>{org?.name}</strong> is ready. Create a store to start managing your catalog and orders.
          </p>
          <Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>
        </Card>
      ) : (
        <>
          {stores.length > 1 && (
            <Card style={{ marginBottom: 20, padding: 16 }}>
              <div style={{ ...typeScale.bodySm, fontWeight: 600, color: colors.muted, marginBottom: 10 }}>
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
                        padding: '6px 12px', ...typeScale.bodySm, cursor: 'pointer',
                        background: active ? colors.brand[50] : colors.surface,
                        color: colors.brand[700],
                        border: `1px solid ${active ? colors.brand[700] : colors.border}`,
                        borderRadius: radii.md,
                        fontWeight: active ? 600 : 400,
                        transition: `background ${transitions.fast}`,
                      }}
                    >
                      {s.displayName}
                      <StatusBadge status={s.verificationStatus} />
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ ...typeScale.body, fontWeight: 600, color: colors.brand[700] }}>{store.displayName}</span>
            <StatusBadge status={store.verificationStatus} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {CARDS.map(c => (
              <Link key={c.href} href={c.href} style={card}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
                <div style={{ ...typeScale.h4, color: colors.brand[700], marginBottom: 4 }}>{c.title}</div>
                <div style={{ ...typeScale.bodySm, color: colors.muted, lineHeight: 1.4 }}>{c.desc}</div>
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
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  padding: 32,
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const primaryLink: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  ...typeScale.button,
  background: colors.brand[700],
  color: '#fff',
  borderRadius: radii.md,
  textDecoration: 'none',
};

const card: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  padding: 20,
  textDecoration: 'none',
  transition: `box-shadow ${transitions.fast}`,
};
