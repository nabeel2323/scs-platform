'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchPublicStores } from '../../lib/buyer-api';
import { EmptyState, LoadingSpinner } from '../../components/Shared';

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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 8 }}>Stores</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>
        Browse verified wholesalers and suppliers
      </p>

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
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>
                    {store.displayName}
                  </div>
                  {store.description && (
                    <div style={{ fontSize: 13, color: '#5b6b74', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {store.description}
                    </div>
                  )}
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: store.verificationStatus === 'VERIFIED' ? '#d1fae5' : '#fef3c7',
                    color: store.verificationStatus === 'VERIFIED' ? '#065f46' : '#92400e',
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
  );
}

const storeCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: 20,
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 10,
  alignItems: 'flex-start',
};

const storeLogoStyle: React.CSSProperties = {
  flexShrink: 0,
};
