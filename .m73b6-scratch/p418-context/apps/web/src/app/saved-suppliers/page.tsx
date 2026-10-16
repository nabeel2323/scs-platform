'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchSavedSuppliers, removeSavedSupplier, SavedSupplier } from '../../lib/buyer-api';
import { useAuth } from '../../components/AuthProvider';
import Link from 'next/link';
import { PageHeader, colors, radii } from '@scs/ui-kit';

/**
 * Saved Suppliers (§21.3) — the store-level analog of Favorites.
 * Retailers bookmark the suppliers they source from repeatedly.
 */
export default function SavedSuppliersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [saved, setSaved] = useState<SavedSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login?redirect=/saved-suppliers');
      return;
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setSaved(await fetchSavedSuppliers());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (authLoading || !user) return <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading...</div>;

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
      <PageHeader title="Saved Suppliers" subtitle={`${saved.length} suppliers saved`} />
      <div style={{ padding: '20px 24px 48px' }}>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>
          Loading saved suppliers...
        </div>
      ) : saved.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>☆</div>
          <p>No saved suppliers yet. Open a store and click “Save Supplier” to bookmark it.</p>
          <Link href="/stores" style={{ color: colors.brand[700], fontWeight: 600, fontSize: 14 }}>
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
                border: '1px solid ${colors.border}',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <Link
                href={`/stores/${(s.store?.['slug'] as string) || s.storeId}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>
                  {nameOf(s)}
                </div>
                {Boolean(s.store?.['verificationStatus']) && (
                  <div style={{ fontSize: 12, color: colors.muted }}>
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
                    color: colors.brand[700],
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
                    background: colors.errBg,
                    color: colors.err,
                    border: `1px solid ${colors.errBorder}`,
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
