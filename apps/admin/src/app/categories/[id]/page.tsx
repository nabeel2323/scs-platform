'use client';

/**
 * Category Detail Page — professional category detail view for Admin.
 *
 * Route: /categories/[id]
 * Shows category hierarchy, metadata, and related products.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminRequest, type AdminRecord } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminEntityLink,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  type KVItem,
} from '../../../components/detail';

function CategoryDetailContent({ id }: { id: string }) {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:categories:write']);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<AdminRecord | null>(null);
  const [children, setChildren] = useState<AdminRecord[]>([]);
  const [productTypes, setProductTypes] = useState<AdminRecord[]>([]);
  const [ptLoading, setPtLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    setError('');
    Promise.all([
      adminRequest<AdminRecord>(`categories/${encodeURIComponent(id)}`),
      adminRequest<{ data: AdminRecord[]; total: number }>(`admin/categories?parentId=${encodeURIComponent(id)}&limit=50&sortBy=name&sortDir=asc`),
    ])
      .then(([cat, childRes]) => {
        setCategory(cat);
        setChildren(childRes?.data || []);
        setLoading(false);
      })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load category'); setLoading(false); });
  }, [id, ready, hasAccess]);

  // Load product types when the tab is activated
  useEffect(() => {
    if (activeTab !== 'productTypes' || !id) return;
    setPtLoading(true);
    // API returns a plain array (not paginated), so handle both formats
    adminRequest<AdminRecord[] | { data: AdminRecord[]; total: number }>(`product-types?categoryId=${encodeURIComponent(id)}&limit=50`)
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setProductTypes(list);
        setPtLoading(false);
      })
      .catch(() => { setPtLoading(false); });
  }, [activeTab, id]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: catalog:categories:write</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load category" message={error} />;
  if (!category) return null;

  const parentId = category['parentId'] as string | null;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'hierarchy', label: 'Hierarchy', count: children.length },
    { key: 'productTypes', label: 'Product Types' },
  ];

  const overviewItems: KVItem[] = [
    { key: 'name', label: 'Name (English)', value: String(category['name'] || 'Not set') },
    { key: 'nameAr', label: 'Name (Arabic)', value: category['nameAr'] ? <span dir="rtl">{String(category['nameAr'])}</span> : 'Not set' },
    { key: 'slug', label: 'Slug', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{String(category['slug'] || 'Not set')}</span> },
    { key: 'path', label: 'Full Path', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{String(category['path'] || 'Not set')}</span> },
    { key: 'isActive', label: 'Status', value: <AdminStatusBadge status={category['isActive'] !== false ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'parentId', label: 'Parent', value: parentId ? (
      <AdminEntityLink type="category" id={parentId} name={String(category['parentName'] || parentId)} />
    ) : 'Root category' },
    { key: 'sortOrder', label: 'Sort Order', value: String(category['sortOrder'] ?? '0') },
    { key: 'productCount', label: 'Products', value: String(category['productCount'] ?? '—') },
    { key: 'storeId', label: 'Scope', value: category['storeId'] ? `Store-scoped` : 'Global' },
    { key: 'createdAt', label: 'Created', value: formatDate(category['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(category['updatedAt'] as string) },
    { key: 'id', label: 'Category ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog', href: '/categories' }, { label: 'Categories', href: '/categories' }]}
        backLabel="Back to Categories"
        backHref="/categories"
        title={String(category['name'] || 'Category')}
        subtitle={category['path'] ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#5b6b74' }}>{String(category['path'])}</span> : undefined}
        status={category['isActive'] !== false ? 'ACTIVE' : 'INACTIVE'}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <AdminDetailSection title="Category Information">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'hierarchy' && (
          <>
            {/* Parent chain */}
            {parentId && (
              <AdminDetailSection title="Parent Category">
                <AdminEntityLink type="category" id={parentId} name={String(category['parentName'] || parentId)} showIcon />
              </AdminDetailSection>
            )}

            {/* Children */}
            <AdminDetailSection title={`Child Categories (${children.length})`}>
              {children.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {children.map(child => (
                    <Link
                      key={child.id}
                      href={`/categories/${child.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', border: '1px solid #d9e2e6', borderRadius: 8,
                        textDecoration: 'none', color: '#16232b', transition: 'background 0.12s',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500 }}>{String(child['name'])}</span>
                        {child['path'] != null && String(child['path']) && <span style={{ marginLeft: 8, fontSize: 12, color: '#5b6b74', fontFamily: 'monospace' }}>{String(child['path'])}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AdminStatusBadge status={child['isActive'] !== false ? 'ACTIVE' : 'INACTIVE'} />
                        <span style={{ fontSize: 12, color: '#5b6b74' }}>{String(child['productCount'] ?? 0)} products</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <AdminEmptyState title="No child categories" description="This category has no subcategories." />
              )}
            </AdminDetailSection>
          </>
        )}

        {activeTab === 'productTypes' && (
          <AdminDetailSection title="Product Types">
            {ptLoading && <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading product types…</div>}
            {!ptLoading && productTypes.length === 0 && (
              <AdminEmptyState title="No product types" description="No product types are configured for this category." />
            )}
            {productTypes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {productTypes.map(pt => (
                  <Link
                    key={pt.id}
                    href={`/product-types/${pt.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', border: '1px solid #d9e2e6', borderRadius: 8,
                      textDecoration: 'none', color: '#16232b', transition: 'background 0.12s',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>{String(pt['name'] || pt['nameEn'] || 'Unnamed')}</span>
                      {pt['slug'] ? <span style={{ marginLeft: 8, fontSize: 12, color: '#5b6b74', fontFamily: 'monospace' }}>{String(pt['slug'])}</span> : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AdminStatusBadge status={pt['isPublished'] ? 'PUBLISHED' : 'DRAFT'} />
                      {pt['productCount'] != null && <span style={{ fontSize: 12, color: '#5b6b74' }}>{String(pt['productCount'])} products</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function CategoryDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><CategoryDetailContent id={id} /></Suspense>;
}
