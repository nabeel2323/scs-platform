'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchPublicStores } from '../../lib/buyer-api';
import { EmptyState, LoadingSpinner } from '../../components/Shared';
import { PageHeader, colors, radii } from '@scs/ui-kit';

interface StoreItem {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  verificationStatus: string;
  address: Record<string, unknown>;
  createdAt: string;
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicStores({ limit: 50 })
      .then(data => setStores(data as StoreItem[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="Stores" subtitle="Browse verified wholesalers and suppliers" />
      <div style={{ padding: '20px 24px 48px' }}>

      {stores.length === 0 ? (
        <EmptyState title="No stores yet" description="Stores will appear here once merchants onboard." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {stores.map(store => (
            <Link key={store.id} href={`/stores/${store.slug || store.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={storeCardStyle}>
                <div style={storeLogoStyle}>
                  {store.logoUrl ? (
                    <img src={store.logoUrl} alt={store.displayName} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                      🏪
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>
                    {store.displayName}
                  </div>
                  {store.description && (
                    <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {store.description}
                    </div>
                  )}
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: store.verificationStatus === 'VERIFIED' ? colors.okBg : colors.warnBg,
                    color: store.verificationStatus === 'VERIFIED' ? colors.ok : colors.warn,
                  }}>
                    {store.verificationStatus}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

const storeCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: 20,
  background: '#fff',
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  alignItems: 'flex-start',
};

const storeLogoStyle: React.CSSProperties = {
  flexShrink: 0,
};
