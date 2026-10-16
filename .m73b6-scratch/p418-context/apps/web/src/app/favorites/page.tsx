'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchFavorites, removeFavorite, Favorite } from '../../lib/buyer-api';
import { useAuth } from '../../components/AuthProvider';
import Link from 'next/link';
import { PageHeader, colors, radii } from '@scs/ui-kit';

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login?redirect=/favorites');
      return;
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setFavorites(await fetchFavorites()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (authLoading || !user) return <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading...</div>;

  const handleRemove = async (productId: string) => {
    try {
      await removeFavorite(productId);
      setFavorites(f => f.filter(fav => fav.productId !== productId));
    } catch { /* ignore */ }
  };

  const fmt = (n: number) => (n / 100).toFixed(2);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Favorites" subtitle={`${favorites.length} items saved`} />
      <div style={{ padding: '20px 24px 48px' }}>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading favorites...</div>
      ) : favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>♡</div>
          <p>No favorites yet. Browse products and click the heart icon to save items.</p>
          <Link href="/search" style={{ color: colors.brand[700], fontWeight: 600, fontSize: 14 }}>Browse Products →</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {favorites.map(fav => (
            <div key={fav.id} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16 }}>
              {fav.product && (
                <>
                  <Link href={`/products/${fav.productId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>{fav.product.title}</div>
                    <div style={{ fontSize: 12, color: colors.muted }}>MOQ: {fav.product.moq}</div>
                  </Link>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href={`/products/${fav.productId}`} style={{ fontSize: 13, color: colors.brand[700], fontWeight: 600, textDecoration: 'none' }}>View →</Link>
                    <button onClick={() => handleRemove(fav.productId)}
                      style={{ padding: '4px 10px', fontSize: 11, background: colors.errBg, color: colors.err, border: `1px solid ${colors.errBorder}`, borderRadius: 4, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
