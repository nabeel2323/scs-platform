'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useProductComparison, useCompareList } from '../../hooks/useProductComparison';
import ProductComparison from '../../components/ProductComparison';
import { PageHeader, colors, typeScale, radii } from '@scs/ui-kit';
import Link from 'next/link';

function ComparePageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { ids, remove, clear } = useCompareList();

  // Merge URL params with persisted list
  const urlIds = params.get('ids')?.split(',').filter(Boolean) ?? [];
  const allIds = Array.from(new Set([...urlIds, ...ids])).slice(0, 4);

  const { products, loading, error, sharedAttributes, compatible } = useProductComparison(allIds);

  const handleRemove = (id: string) => {
    remove(id);
    // Also update URL if present
    const next = allIds.filter(x => x !== id);
    router.push(next.length > 0 ? `/compare?ids=${next.join(',')}` : '/compare', { scroll: false });
  };

  return (
    <div>
      <PageHeader title="Compare Products" subtitle="Side-by-side comparison of selected products" />

      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Compare list chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>Comparing ({allIds.length}/4):</span>
          {allIds.map(id => {
            const p = products.find(x => x.id === id);
            return (
              <span key={id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: radii.sm, fontSize: 12,
                background: colors.bgSubtle, border: `1px solid ${colors.border}`,
              }}>
                {p ? p.title.slice(0, 30) + (p.title.length > 30 ? '…' : '') : id.slice(0, 8) + '…'}
                <button
                  onClick={() => handleRemove(id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.muted, fontSize: 14, padding: 0, lineHeight: 1 }}
                  aria-label="Remove from comparison"
                >
                  ✕
                </button>
              </span>
            );
          })}
          {allIds.length > 0 && (
            <button
              onClick={() => { clear(); router.push('/compare', { scroll: false }); }}
              style={{ padding: '4px 10px', fontSize: 12, color: colors.err, background: 'none', border: `1px solid ${colors.errBorder}`, borderRadius: radii.sm, cursor: 'pointer' }}
            >
              Clear All
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: 12, color: colors.err, background: colors.errBg, borderRadius: radii.sm, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: colors.muted }}>Loading products for comparison…</div>
        ) : products.length < 2 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ color: colors.muted, marginBottom: 16 }}>
              Add at least 2 products to compare. Browse products or search to find items.
            </p>
            <Link
              href="/search"
              style={{
                display: 'inline-block', padding: '10px 20px', background: colors.brand[700],
                color: '#fff', borderRadius: radii.sm, textDecoration: 'none', fontWeight: 600, fontSize: 13,
              }}
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md, overflow: 'hidden' }}>
            <ProductComparison
              products={products}
              sharedAttributes={sharedAttributes}
              compatible={compatible}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>Loading…</div>}>
      <ComparePageContent />
    </Suspense>
  );
}
