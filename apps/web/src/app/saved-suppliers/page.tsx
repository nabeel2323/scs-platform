'use client';

import { useState, useEffect } from 'react';
import { fetchSavedSuppliers, removeSavedSupplier, SavedSupplier } from '../../lib/buyer-api';
import Link from 'next/link';

/**
 * Saved Suppliers (§21.3) — the store-level analog of Favorites.
 * Retailers bookmark the suppliers they source from repeatedly.
 */
export default function SavedSuppliersPage() {
  const [saved, setSaved] = useState<SavedSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setSaved(await fetchSavedSuppliers());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (storeId: string) => {
    try {
      await removeSavedSupplier(storeId);
      setSaved((s) => s.filter((x) => x.storeId !== storeId));
    } catch {
      /* ignore */
    }
  };

  const nameOf = (s: SavedSupplier) =>
    (s.store?.['displayName'] as string) || (s.store?.['name'] as string) || 'Supplier';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Saved Suppliers</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>{saved.length} suppliers saved</p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>
          Loading saved suppliers...
        </div>
      ) : saved.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#5b6b74' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>☆</div>
          <p>No saved suppliers yet. Open a store and click “Save Supplier” to bookmark it.</p>
          <Link href="/stores" style={{ color: '#0f3340', fontWeight: 600, fontSize: 14 }}>
            Browse Stores →
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {saved.map((s) => (
            <div
              key={s.id}
              style={{
                background: '#fff',
                border: '1px solid #d9e2e6',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <Link
                href={`/stores/${(s.store?.['slug'] as string) || s.storeId}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>
                  {nameOf(s)}
                </div>
                {Boolean(s.store?.['verificationStatus']) && (
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>
                    {String(s.store?.['verificationStatus'])}
                  </div>
                )}
              </Link>
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Link
                  href={`/stores/${(s.store?.['slug'] as string) || s.storeId}`}
                  style={{
                    fontSize: 13,
                    color: '#0f3340',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  View →
                </Link>
                <button
                  onClick={() => handleRemove(s.storeId)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    background: '#fef2f2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
