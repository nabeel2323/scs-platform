'use client';

/**
 * Brand Detail Page — professional brand detail view for Admin.
 *
 * Route: /brands/[id]
 * Shows brand identity, metadata, and related products.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminRequest, type AdminRecord } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  type KVItem,
} from '../../../components/detail';

function BrandDetailContent({ id }: { id: string }) {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:brands:manage']);
  const [ready, setReady] = useState(false);
  const [brand, setBrand] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    adminRequest<AdminRecord>(`brands/${encodeURIComponent(id)}`)
      .then(data => { setBrand(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load brand'); setLoading(false); });
  }, [id, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: catalog:brands:manage</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load brand" message={error} />;
  if (!brand) return null;

  const items: KVItem[] = [
    { key: 'name', label: 'Name (English)', value: String(brand['name'] || 'Not set') },
    { key: 'nameAr', label: 'Name (Arabic)', value: brand['nameAr'] ? <span dir="rtl">{String(brand['nameAr'])}</span> : 'Not set' },
    { key: 'slug', label: 'Slug', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{String(brand['slug'] || 'Not set')}</span> },
    { key: 'isActive', label: 'Status', value: <AdminStatusBadge status={brand['isActive'] !== false ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'description', label: 'Description', value: brand['description'] ? String(brand['description']) : 'Not set' },
    { key: 'logoUrl', label: 'Logo URL', value: brand['logoUrl'] ? (
      <a href={String(brand['logoUrl'])} target="_blank" rel="noopener noreferrer" style={{ color: '#1e6178', wordBreak: 'break-all' }}>
        {String(brand['logoUrl']).length > 48 ? String(brand['logoUrl']).slice(0, 48) + '…' : String(brand['logoUrl'])}
      </a>
    ) : 'Not set' },
    { key: 'createdAt', label: 'Created', value: formatDate(brand['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(brand['updatedAt'] as string) },
    { key: 'id', label: 'Brand ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog', href: '/brands' }, { label: 'Brands', href: '/brands' }]}
        backLabel="Back to Brands"
        backHref="/brands"
        title={String(brand['name'] || 'Brand')}
        status={brand['isActive'] !== false ? 'ACTIVE' : 'INACTIVE'}
        entityId={id}
      />
      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AdminDetailSection title="Brand Information">
          <AdminKeyValueGrid items={items} />
        </AdminDetailSection>

        {brand['logoUrl'] != null && String(brand['logoUrl']) && (
          <AdminDetailSection title="Logo Preview">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img
                src={String(brand['logoUrl'])}
                alt={`${String(brand['name'])} logo`}
                style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, border: '1px solid #d9e2e6', objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span style={{ fontSize: 13, color: '#5b6b74' }}>Logo loaded from URL above</span>
            </div>
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function BrandDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><BrandDetailContent id={id} /></Suspense>;
}
