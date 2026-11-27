'use client';

/**
 * Merchant Offer Detail Page — professional offer detail view for Admin.
 *
 * Route: /offers/[id]
 * Shows commercial information, inventory, merchant, and canonical product.
 * Reinforces the marketplace hierarchy: Product → Variant → Merchant Offer.
 */
import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
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
  const [inventory, setInventory] = useState<AdminRecord | null>(null);
  const [inventoryVariantId, setInventoryVariantId] = useState<string | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('commercial');
  const [inventoryError, setInventoryError] = useState('');
  const requestVersion = useRef(0);
  const inventoryRequestVersion = useRef(0);

  const variantId = (offer?.['variantId'] as string | null) ?? null;
  const hasCurrentInventory = Boolean(variantId && inventory && inventoryVariantId === variantId);

  useEffect(() => setReady(true), []);

  const load = useCallback(async () => {
    if (!ready || !hasAccess) return;
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await adminRequest<AdminRecord>(`offers/${encodeURIComponent(id)}`);
      if (requestId === requestVersion.current) setOffer(data);
    } catch (err) {
      if (requestId === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to load offer');
      }
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [id, ready, hasAccess]);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  const loadInventory = useCallback(async () => {
    if (activeTab !== 'inventory' || !variantId) return;
    const requestId = ++inventoryRequestVersion.current;
    setInvLoading(true);
    setInventoryError('');
    try {
      const data = await adminRequest<AdminRecord>(
        `inventory/variant/${encodeURIComponent(variantId)}`,
      );
      if (requestId === inventoryRequestVersion.current) {
        setInventory(data);
        setInventoryVariantId(variantId);
      }
    } catch (err) {
      if (requestId === inventoryRequestVersion.current) {
        setInventoryError(err instanceof Error ? err.message : 'Failed to load inventory');
      }
    } finally {
      if (requestId === inventoryRequestVersion.current) setInvLoading(false);
    }
  }, [activeTab, variantId]);

  useEffect(() => {
    void loadInventory();
    return () => {
      inventoryRequestVersion.current += 1;
    };
  }, [loadInventory]);

  if (!ready) return <AdminLoadingSkeleton kvRows={8} />;
  if (!hasAccess)
    return (
      <div style={{ padding: 32, color: '#991b1b' }}>
        Access denied. Required: catalog:offers:govern
      </div>
    );
  if (loading) return <AdminLoadingSkeleton kvRows={8} />;
  if (error) return <AdminErrorState title="Unable to load offer" message={error} onRetry={load} />;
  if (!offer) return null;

  const status = String(offer['status'] || '');
  const productId = offer['productId'] as string;
  const storeId = offer['storeId'] as string;
  const storeName = offer['storeName'] as string | null;
  const productTitle = offer['productTitle'] as string | null;
  const variantSku = offer['variantSku'] as string | null;

  const tabs = [
    { key: 'commercial', label: 'Commercial' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'merchant', label: 'Merchant' },
    { key: 'product', label: 'Canonical Product' },
  ];

  const commercialItems: KVItem[] = [
    {
      key: 'basePriceMinor',
      label: 'Selling Price',
      value: formatCurrency(offer['basePriceMinor'] as number, offer['currency'] as string),
    },
    { key: 'currency', label: 'Currency', value: String(offer['currency'] || 'Not set') },
    { key: 'moq', label: 'Minimum Order Qty', value: String(offer['moq'] ?? '—') },
    {
      key: 'leadTimeDays',
      label: 'Lead Time',
      value: offer['leadTimeDays'] != null ? `${offer['leadTimeDays']} days` : '—',
    },
    {
      key: 'isAvailable',
      label: 'Availability',
      value: formatBoolean(offer['isAvailable'] as boolean),
    },
    { key: 'status', label: 'Status', value: <AdminStatusBadge status={status} /> },
    { key: 'activatedAt', label: 'Activated', value: formatDate(offer['activatedAt'] as string) },
    { key: 'createdAt', label: 'Created', value: formatDate(offer['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(offer['updatedAt'] as string) },
    {
      key: 'id',
      label: 'Offer ID',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
          <AdminCopyButton value={id} label="" />
        </span>
      ),
    },
  ];

  const merchantItems: KVItem[] = [
    {
      key: 'storeId',
      label: 'Store',
      value: storeId ? (
        storeName ? (
          <AdminEntityLink type="store" id={storeId} name={storeName} />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{storeId}</span>
            <AdminCopyButton value={storeId} label="" />
          </span>
        )
      ) : (
        'Not set'
      ),
    },
  ];

  const productItems: KVItem[] = [
    {
      key: 'productId',
      label: 'Product',
      value: productId ? (
        productTitle ? (
          <AdminEntityLink type="product" id={productId} name={productTitle} showIcon />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{productId}</span>
            <AdminCopyButton value={productId} label="" />
          </span>
        )
      ) : (
        'Not set'
      ),
    },
    {
      key: 'variantId',
      label: 'Variant',
      value: variantId ? (
        variantSku ? (
          <AdminEntityLink type="variant" id={variantId} name={variantSku} showIcon />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{variantId}</span>
            <AdminCopyButton value={variantId} label="" />
          </span>
        )
      ) : (
        'Not set'
      ),
    },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[
          { label: 'Catalog', href: '/offers' },
          { label: 'Offers', href: '/offers' },
        ]}
        backLabel="Back to Offers"
        backHref="/offers"
        title={productTitle || variantSku || 'Merchant Offer'}
        subtitle={
          <>
            {storeName && (
              <span>
                Sold by: <strong>{storeName}</strong>
              </span>
            )}
            {variantSku && (
              <>
                <span style={{ color: '#d9e2e6' }}> · </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{variantSku}</span>
              </>
            )}
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

        {activeTab === 'inventory' && (
          <AdminDetailSection
            title="Inventory & Stock"
            description="Stock levels for this offer's variant across warehouses."
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => void loadInventory()}
                disabled={invLoading || !variantId}
                style={{
                  padding: '5px 10px',
                  border: '1px solid #d9e2e6',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: invLoading || !variantId ? 'wait' : 'pointer',
                  fontSize: 12,
                }}
              >
                {invLoading ? 'Refreshing…' : 'Refresh inventory'}
              </button>
            </div>
            {invLoading && !hasCurrentInventory && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>
                Loading inventory data…
              </div>
            )}
            {invLoading && hasCurrentInventory && (
              <div role="status" style={{ padding: '6px 0', color: '#6b7280', fontSize: 12 }}>
                Refreshing inventory… showing the last successful result.
              </div>
            )}
            {inventoryError &&
              (hasCurrentInventory ? (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: 6,
                    background: '#fef2f2',
                    color: '#991b1b',
                    fontSize: 12,
                  }}
                >
                  <span>{inventoryError} Showing the last successfully loaded inventory.</span>
                  <button type="button" onClick={() => void loadInventory()}>
                    Retry inventory
                  </button>
                </div>
              ) : (
                <AdminErrorState
                  title="Unable to load inventory"
                  message={inventoryError}
                  onRetry={loadInventory}
                />
              ))}
            {!invLoading && !inventoryError && !hasCurrentInventory && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>
                {variantId
                  ? 'No inventory data available for this variant.'
                  : 'This offer is not linked to a specific variant.'}
              </div>
            )}
            {hasCurrentInventory && inventory && (
              <AdminKeyValueGrid
                items={[
                  {
                    key: 'totalAvailable',
                    label: 'Total Available',
                    value: String(inventory['totalAvailable'] ?? inventory['available'] ?? '—'),
                  },
                  {
                    key: 'totalOnHand',
                    label: 'Total On Hand',
                    value: String(inventory['totalOnHand'] ?? inventory['onHand'] ?? '—'),
                  },
                  {
                    key: 'warehouseCount',
                    label: 'Warehouses',
                    value: String(inventory['warehouseCount'] ?? '—'),
                  },
                  {
                    key: 'variantId',
                    label: 'Variant ID',
                    value: (
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {variantId || '—'}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'product' && (
          <AdminDetailSection
            title="Canonical Product"
            description="This is the underlying catalog product that this merchant offer sells. Product data is shared across all merchant offers."
          >
            <AdminKeyValueGrid items={productItems} />
            {/* Visual hierarchy indicator */}
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                background: '#f7f9fa',
                borderRadius: 8,
                border: '1px solid #e5ecf0',
                fontSize: 13,
                color: '#5b6b74',
              }}
            >
              <strong style={{ color: '#0f3340' }}>Marketplace hierarchy:</strong>
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
                <span>Product {productId ? `(canonical)` : ''}</span>
                <br />
                <span>
                  &nbsp;&nbsp;→ Variant{' '}
                  {variantId ? `(${variantSku || variantId.slice(0, 12)})` : ''}
                </span>
                <br />
                <span>
                  &nbsp;&nbsp;&nbsp;&nbsp;→ Merchant Offer{' '}
                  <span style={{ color: '#1e6178', fontWeight: 600 }}>(this entity)</span>
                </span>
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
  return (
    <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}>
      <OfferDetailContent id={id} />
    </Suspense>
  );
}
