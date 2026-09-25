'use client';

/**
 * Merchant Offer Detail Page — professional offer detail view for Admin.
 *
 * Route: /offers/[id]
 * Shows commercial information, inventory, merchant, and canonical product.
 * Reinforces the marketplace hierarchy: Product → Variant → Merchant Offer.
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
  formatDate,
  formatCurrency,
  formatBoolean,
  type KVItem,
} from '../../../components/detail';

function OfferDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['catalog:offers:govern']);
  const [ready, setReady] = useState(false);
  const [offer, setOffer] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('commercial');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    adminRequest<AdminRecord>(`offers/${encodeURIComponent(id)}`)
      .then(data => { setOffer(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load offer'); setLoading(false); });
  }, [id, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={8} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: catalog:offers:govern</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={8} />;
  if (error) return <AdminErrorState title="Unable to load offer" message={error} />;
  if (!offer) return null;

  const status = String(offer['status'] || '');
  const productId = offer['productId'] as string;
  const variantId = offer['variantId'] as string | null;
  const storeId = offer['storeId'] as string;
  const storeName = offer['storeName'] as string | null;
  const productTitle = offer['productTitle'] as string | null;
  const variantSku = offer['variantSku'] as string | null;

  const tabs = [
    { key: 'commercial', label: 'Commercial' },
    { key: 'merchant', label: 'Merchant' },
    { key: 'product', label: 'Canonical Product' },
  ];

  const commercialItems: KVItem[] = [
    { key: 'basePriceMinor', label: 'Selling Price', value: formatCurrency(offer['basePriceMinor'] as number, offer['currency'] as string) },
    { key: 'currency', label: 'Currency', value: String(offer['currency'] || 'Not set') },
    { key: 'moq', label: 'Minimum Order Qty', value: String(offer['moq'] ?? '—') },
    { key: 'leadTimeDays', label: 'Lead Time', value: offer['leadTimeDays'] != null ? `${offer['leadTimeDays']} days` : '—' },
    { key: 'isAvailable', label: 'Availability', value: formatBoolean(offer['isAvailable'] as boolean) },
    { key: 'status', label: 'Status', value: <AdminStatusBadge status={status} /> },
    { key: 'activatedAt', label: 'Activated', value: formatDate(offer['activatedAt'] as string) },
    { key: 'createdAt', label: 'Created', value: formatDate(offer['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(offer['updatedAt'] as string) },
    { key: 'id', label: 'Offer ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  const merchantItems: KVItem[] = [
    { key: 'storeId', label: 'Store', value: storeId ? (
      storeName ? <AdminEntityLink type="store" id={storeId} name={storeName} /> : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{storeId}</span>
          <AdminCopyButton value={storeId} label="" />
        </span>
      )
    ) : 'Not set' },
  ];

  const productItems: KVItem[] = [
    { key: 'productId', label: 'Product', value: productId ? (
      productTitle ? <AdminEntityLink type="product" id={productId} name={productTitle} showIcon /> : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{productId}</span>
          <AdminCopyButton value={productId} label="" />
        </span>
      )
    ) : 'Not set' },
    { key: 'variantId', label: 'Variant', value: variantId ? (
      variantSku ? <AdminEntityLink type="variant" id={variantId} name={variantSku} showIcon /> : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{variantId}</span>
          <AdminCopyButton value={variantId} label="" />
        </span>
      )
    ) : 'Not set' },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog', href: '/offers' }, { label: 'Offers', href: '/offers' }]}
        backLabel="Back to Offers"
        backHref="/offers"
        title={productTitle || variantSku || 'Merchant Offer'}
        subtitle={
          <>
            {storeName && <span>Sold by: <strong>{storeName}</strong></span>}
            {variantSku && <><span style={{ color: '#d9e2e6' }}> · </span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{variantSku}</span></>}
          </>
        }
        status={status}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'commercial' && (
          <AdminDetailSection title="Commercial Information">
            <AdminKeyValueGrid items={commercialItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'merchant' && (
          <AdminDetailSection title="Merchant & Store">
            <AdminKeyValueGrid items={merchantItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'product' && (
          <AdminDetailSection
            title="Canonical Product"
            description="This is the underlying catalog product that this merchant offer sells. Product data is shared across all merchant offers."
          >
            <AdminKeyValueGrid items={productItems} />
            {/* Visual hierarchy indicator */}
            <div style={{
              marginTop: 16, padding: '12px 16px', background: '#f7f9fa', borderRadius: 8,
              border: '1px solid #e5ecf0', fontSize: 13, color: '#5b6b74',
            }}>
              <strong style={{ color: '#0f3340' }}>Marketplace hierarchy:</strong>
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
                <span>Product {productId ? `(canonical)` : ''}</span>
                <br />
                <span>&nbsp;&nbsp;→ Variant {variantId ? `(${variantSku || variantId.slice(0, 12)})` : ''}</span>
                <br />
                <span>&nbsp;&nbsp;&nbsp;&nbsp;→ Merchant Offer <span style={{ color: '#1e6178', fontWeight: 600 }}>(this entity)</span></span>
              </div>
            </div>
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function OfferDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}><OfferDetailContent id={id} /></Suspense>;
}
