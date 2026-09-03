'use client';

import { useState, useEffect } from 'react';
import { fetchFavorites, removeFavorite, Favorite } from '../../lib/buyer-api';
import Link from 'next/link';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setFavorites(await fetchFavorites()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (productId: string) => {
    try {
      await removeFavorite(productId);
      setFavorites(f => f.filter(fav => fav.productId !== productId));
    } catch { /* ignore */ }
  };

  const fmt = (n: number) => (n / 100).toFixed(2);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Favorites</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>{favorites.length} items saved</p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading favorites...</div>
      ) : favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#5b6b74' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>♡</div>
          <p>No favorites yet. Browse products and click the heart icon to save items.</p>
          <Link href="/search" style={{ color: '#0f3340', fontWeight: 600, fontSize: 14 }}>Browse Products →</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {favorites.map(fav => (
            <div key={fav.id} style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16 }}>
              {fav.product && (
                <>
                  <Link href={`/products/${fav.productId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>{fav.product.title}</div>
                    <div style={{ fontSize: 12, color: '#5b6b74' }}>MOQ: {fav.product.moq}</div>
                  </Link>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href={`/products/${fav.productId}`} style={{ fontSize: 13, color: '#0f3340', fontWeight: 600, textDecoration: 'none' }}>View →</Link>
                    <button onClick={() => handleRemove(fav.productId)}
                      style={{ padding: '4px 10px', fontSize: 11, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>
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
  );
}
