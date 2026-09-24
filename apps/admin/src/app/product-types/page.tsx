'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProductType, fetchProductTypes } from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { SkeletonTable } from '@scs/ui-kit';
import styles from '../../components/management.module.css';

/**
 * Phase 2 stub — basic Product Types list.
 * Phase 3 will enrich this with category filter, status filter, and click-through to builder.
 */
export default function ProductTypesPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:product-types:manage']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const [types, setTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProductTypes();
      setTypes(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load product types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && hasAccess) load(); }, [ready, hasAccess, load]);

  if (!ready) return <p style={{ padding: 32 }}>Loading…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:product-types:manage']} missingPerms={missingPerms} />;

  return (
    <div className={styles['shell']}>
      <header className={styles['header']}>
        <h1>Product Types</h1>
        <p>{types.length} type{types.length !== 1 ? 's' : ''} — templates that define the attributes and variant dimensions for products</p>
      </header>

      <div className={styles['content']}>
        <div className={styles['toolbar']}>
          <button type="button" onClick={load}>Refresh</button>
        </div>

        {error && <div className={styles['error']}>{error} <button type="button" onClick={load} style={{ marginLeft: 8 }}>Retry</button></div>}
        {loading ? <SkeletonTable rows={4} cols={6} /> : (
          <div className={styles['tableWrap']}>
            <table>
              <caption style={{ textAlign: 'left', padding: 12 }}>Product Types — {types.length} results</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Variant Dims</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {types.map(pt => (
                  <tr key={pt.id}>
                    <td><code style={{ fontSize: 12, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{pt.code}</code></td>
                    <td>
                      {pt.name}
                      {pt.nameAr && <small className={styles['muted']} dir="rtl">{pt.nameAr}</small>}
                    </td>
                    <td>v{pt.version}</td>
                    <td><TypeStatusBadge status={pt.status} /></td>
                    <td>{pt.variantDimensions?.length ?? 0}</td>
                    <td><time dateTime={pt.updatedAt}>{new Date(pt.updatedAt).toLocaleDateString()}</time></td>
                  </tr>
                ))}
                {!types.length && <tr><td colSpan={6}>No product types found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TypeStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: '#fef3c7', fg: '#92400e' },
    PUBLISHED: { bg: '#dcfce7', fg: '#166534' },
    DEPRECATED: { bg: '#fee2e2', fg: '#991b1b' },
  };
  const c = colors[status] ?? colors['DRAFT']!;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}
