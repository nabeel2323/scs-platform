'use client';

/**
 * Variant Detail Page — professional variant detail view for Admin.
 *
 * Route: /variants/[id]
 * Shows variant configuration, offers, and media.
 * Reinforces: Product → Variant → Merchant Offer hierarchy.
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
  AdminRelatedTable,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  formatCurrency,
  statusCell,
  type KVItem,
} from '../../../components/detail';

function VariantDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['admin:merchants:read']);
  const [ready, setReady] = useState(false);
  const [variant, setVariant] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('configuration');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    adminRequest<AdminRecord>(`variants/${encodeURIComponent(id)}`)
      .then(data => { setVariant(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load variant'); setLoading(false); });
  }, [id, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied.</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load variant" message={error} />;
  if (!variant) return null;

  const productId = variant['productId'] as string;
  const productTitle = variant['productTitle'] as string | null;
  const sku = variant['sku'] as string | null;
  const status = variant['status'] as string | null;
  const attributes = variant['attributes'] as Record<string, unknown> | null;

  const tabs = [
    { key: 'configuration', label: 'Configuration' },
    { key: 'technical', label: 'Technical' },
  ];

  // Build attribute KV items from the variant's attributes object
  const attrItems: KVItem[] = attributes
    ? Object.entries(attributes).map(([k, v]) => ({
        key: k,
        label: k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()),
        value: typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? 'Not set'),
      }))
    : [];

  const configItems: KVItem[] = [
    { key: 'sku', label: 'SKU', value: sku ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sku}</span>
        <AdminCopyButton value={sku} label="" />
      </span>
    ) : 'Not set' },
    { key: 'status', label: 'Status', value: status ? <AdminStatusBadge status={status} /> : 'Not set' },
    { key: 'productId', label: 'Parent Product', value: productId ? (
      productTitle ? <AdminEntityLink type="product" id={productId} name={productTitle} showIcon /> : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{productId}</span>
          <AdminCopyButton value={productId} label="" />
        </span>
      )
    ) : 'Not set' },
  ];

  const technicalItems: KVItem[] = [
    { key: 'id', label: 'Variant ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
    { key: 'productId', label: 'Product ID', value: productId ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{productId}</span>
        <AdminCopyButton value={productId} label="" />
      </span>
    ) : 'Not set' },
    { key: 'createdAt', label: 'Created', value: formatDate(variant['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(variant['updatedAt'] as string) },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[
          { label: 'Catalog', href: '/products' },
          { label: 'Products', href: '/products' },
          ...(productId && productTitle ? [{ label: productTitle, href: `/products/${productId}` }] : []),
        ]}
        backLabel={productTitle ? `Back to ${productTitle}` : 'Back to Products'}
        backHref={productId ? `/products/${productId}` : '/products'}
        title={sku || 'Variant'}
        subtitle={<span style={{ fontFamily: 'monospace', fontSize: 12, color: '#5b6b74' }}>Variant</span>}
        status={status || undefined}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'configuration' && (
          <>
            <AdminDetailSection title="Variant Identity">
              <AdminKeyValueGrid items={configItems} />
            </AdminDetailSection>

            {attrItems.length > 0 && (
              <AdminDetailSection title="Variant Attributes">
                <AdminKeyValueGrid items={attrItems} />
              </AdminDetailSection>
            )}

            {/* Hierarchy indicator */}
            <div style={{
              padding: '12px 16px', background: '#f7f9fa', borderRadius: 8,
              border: '1px solid #e5ecf0', fontSize: 13, color: '#5b6b74',
            }}>
              <strong style={{ color: '#0f3340' }}>Marketplace hierarchy:</strong>
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
                <span>Product {productTitle ? `(${productTitle})` : '(canonical)'}</span>
                <br />
                <span>&nbsp;&nbsp;→ Variant <span style={{ color: '#1e6178', fontWeight: 600 }}>({sku || id.slice(0, 12)} — this entity)</span></span>
                <br />
                <span>&nbsp;&nbsp;&nbsp;&nbsp;→ Merchant Offers</span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'technical' && (
          <AdminDetailSection title="Technical Identifiers">
            <AdminKeyValueGrid items={technicalItems} columns={1} />
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function VariantDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><VariantDetailContent id={id} /></Suspense>;
}
