'use client';

/**
 * ProductDetails — professional product detail view for Admin.
 *
 * Replaces the old RecordFields-dump layout with structured tabs:
 * Overview, Variants, Offers, Media.
 *
 * Preserves existing API calls, moderation actions, and permission checks.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminProduct, moderateAdminProduct, adminRequest } from '../lib/api';
import { useAdminResource } from '../hooks/useAdminTable';
import { useRequirePerms } from '../hooks/useRequirePerms';
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
  formatBoolean,
  statusCell,
  type RelatedColumn,
} from './detail';
import { PreviewImage } from './RecordFields';
import type { KVItem } from './detail';
import styles from './detail/detail.module.css';

// ── Types ──────────────────────────────────────────────────────
type OfferSummary = {
  id: string;
  status: string;
  currency: string;
  basePriceMinor: number | null;
  moq: number;
  storeId: string;
  leadTimeDays: number | null;
};

// ── Moderation Actions ─────────────────────────────────────────
export function ProductModerationActions({
  id,
  status,
  onDone,
}: {
  id: string;
  status: string;
  onDone: (decision: string) => void;
}) {
  const { hasAccess } = useRequirePerms(['admin:merchants:read']);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');

  async function moderate(decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED') {
    if (!hasAccess || pending.current) return;
    if (decision === 'ARCHIVED' && !window.confirm('Archive this product? It will no longer appear in the moderation list.')) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await moderateAdminProduct(id, decision);
      onDone(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation failed');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!hasAccess || status === 'ARCHIVED') return null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {status !== 'ACTIVE' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => moderate('APPROVED')}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: '#1b7a4b', color: '#fff', border: 'none',
              borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            Approve
          </button>
        )}
        {status !== 'REJECTED' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => moderate('REJECTED')}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: '#fff', color: '#b3372f', border: '1px solid #b3372f',
              borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            Reject
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => moderate('ARCHIVED')}
          style={{
            padding: '6px 14px', fontSize: 13, fontWeight: 500,
            background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6',
            borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1, fontFamily: 'inherit',
          }}
        >
          Archive
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#fbeeec', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────
const refs = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean)
    : [];

// ── Main Component ─────────────────────────────────────────────
export default function ProductDetails({
  id,
  fullPage = false,
  returnTo = '/products',
  onChanged,
}: {
  id: string;
  fullPage?: boolean;
  returnTo?: string;
  onChanged?: () => void;
}) {
  const { hasAccess } = useRequirePerms(['admin:merchants:read']);
  const product = useAdminResource<AdminProduct>(`products/${encodeURIComponent(id)}`, hasAccess);
  const previews = useAdminResource<{ previews: Record<string, string> }>(
    `admin/products/${encodeURIComponent(id)}/media-previews`,
    hasAccess,
  );
  const [archived, setArchived] = useState(false);
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [offersError, setOffersError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch offers
  useEffect(() => {
    if (!id) return;
    adminRequest(`products/${encodeURIComponent(id)}/offers`)
      .then((data: unknown) => setOffers(Array.isArray(data) ? (data as OfferSummary[]) : []))
      .catch((err: unknown) => setOffersError(err instanceof Error ? err.message : 'Failed to load offers'));
  }, [id]);

  const handleModeration = useCallback((decision: string) => {
    if (decision === 'ARCHIVED') setArchived(true);
    else product.reload();
    onChanged?.();
  }, [product, onChanged]);

  if (!hasAccess) return null;

  if (archived) {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#16232b', marginBottom: 8 }}>Product archived</h2>
        <p style={{ color: '#5b6b74', marginBottom: 16 }}>This product has been archived and is no longer visible.</p>
        <Link href={returnTo} style={{ color: '#1e6178', fontWeight: 500 }}>← Back to products</Link>
      </div>
    );
  }

  if (product.loading) return <AdminLoadingSkeleton kvRows={8} />;
  if (product.error) return <AdminErrorState title="Unable to load product" message={product.error} onRetry={product.reload} />;

  const value = product.data;
  if (!value) return null;

  const images = [
    ...new Set([
      ...refs(value.images),
      ...value.media.filter(m => m.mediaType === 'IMAGE').map(m => m.url.trim()).filter(Boolean),
    ]),
  ];

  // Build tabs
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'variants', label: 'Variants', count: value.variants.length },
    { key: 'offers', label: 'Offers', count: offers.length },
    { key: 'media', label: 'Media', count: images.length + value.media.length },
  ];

  // Subtitle parts
  const subtitleParts: React.ReactNode[] = [];
  if (value.store?.displayName || value.storeId) {
    subtitleParts.push(
      <AdminEntityLink
        key="store"
        type="store"
        id={value.storeId}
        name={value.store?.displayName || value.storeId}
      />,
    );
  }
  if (value.slug) {
    subtitleParts.push(<span key="slug" style={{ fontFamily: 'monospace', fontSize: 12 }}>{value.slug}</span>);
  }

  // Overview KV items
  const overviewItems: KVItem[] = [
    { key: 'title', label: 'Title', value: value.title },
    { key: 'slug', label: 'Slug', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{value.slug || 'Not set'}</span> },
    { key: 'status', label: 'Status', value: <AdminStatusBadge status={value.status} /> },
    { key: 'condition', label: 'Condition', value: value['condition'] ? <AdminStatusBadge status={String(value['condition'])} /> : 'Not set' },
    { key: 'storeId', label: 'Store', value: value.store ? (
      <AdminEntityLink type="store" id={value.storeId} name={value.store.displayName} />
    ) : value.storeId || 'Not set' },
    { key: 'imageCount', label: 'Image Count', value: String(value.imageCount) },
    { key: 'isAvailable', label: 'Available', value: formatBoolean(value.isAvailable) },
    { key: 'publishedAt', label: 'Published', value: formatDate(value['publishedAt'] as string) },
    { key: 'createdAt', label: 'Created', value: formatDate(value['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(value['updatedAt'] as string) },
    { key: 'id', label: 'Product ID', value: <AdminCopyButton value={id} label="" /> },
  ];

  // Filter out attributes/media/variants/store from the raw record for the technical section
  const technicalItems: KVItem[] = [
    { key: 'id', label: 'Product ID', value: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span> },
    { key: 'storeId', label: 'Store ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{value.storeId}</span>
        <AdminCopyButton value={value.storeId} label="" />
      </span>
    )},
  ];

  // Variant table columns
  const variantColumns: RelatedColumn[] = [
    { key: 'sku', label: 'SKU', sortable: true, render: (_, row) => {
      const sku = row['sku'] as string;
      const vid = row['id'] as string;
      return vid ? <Link href={`/variants/${vid}`} style={{ color: '#1e6178', fontWeight: 500, textDecoration: 'none' }}>{sku || vid}</Link> : sku || '—';
    }},
    { key: 'status', label: 'Status', render: (v) => statusCell(v) },
    { key: 'images', label: 'Images', render: (v) => String(refs(v).length) },
    {
      key: 'stock', label: 'Stock', render: (_, row) => {
        const stock = (row as Record<string, unknown>)['stock'] as { totalAvailable: number; totalOnHand: number; warehouseCount: number } | undefined;
        if (!stock) return <span style={{ color: '#5b6b74' }}>—</span>;
        return <span>{stock.totalOnHand} on hand · {stock.totalAvailable} avail.</span>;
      },
    },
    { key: 'id', label: '', render: (_, row) => {
      const vid = row['id'] as string;
      return vid ? <Link href={`/variants/${vid}`} style={{ color: '#1e6178', fontSize: 12, textDecoration: 'none' }}>View →</Link> : null;
    }, align: 'right' as const },
  ];

  // Offer table columns
  const offerColumns: RelatedColumn[] = [
    { key: 'status', label: 'Status', render: (v) => statusCell(v) },
    { key: 'basePriceMinor', label: 'Price', sortable: true, render: (_, row) => {
      const price = row['basePriceMinor'] as number | null;
      const currency = row['currency'] as string;
      return price != null ? formatCurrency(price, currency) : '—';
    }},
    { key: 'moq', label: 'MOQ', sortable: true, render: (v) => String(v ?? '—') },
    { key: 'leadTimeDays', label: 'Lead Time', render: (v) => v != null ? `${v}d` : '—' },
    { key: 'storeId', label: 'Store', render: (_, row) => {
      const sid = row['storeId'] as string;
      return sid ? <AdminCopyButton value={sid} label="" /> : '—';
    }},
    { key: 'id', label: '', render: (_, row) => {
      const oid = row['id'] as string;
      return oid ? <Link href={`/offers/${oid}`} style={{ color: '#1e6178', fontSize: 12, textDecoration: 'none' }}>View →</Link> : null;
    }, align: 'right' as const },
  ];

  return (
    <div className={styles['detailShell']}>
      {/* Header */}
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog', href: '/products' }, { label: 'Products', href: '/products' }]}
        backLabel="Back to Products"
        backHref={returnTo}
        title={value.title}
        subtitle={<>{subtitleParts.map((part, i) => (<span key={i}>{i > 0 ? <span style={{ color: '#d9e2e6' }}> · </span> : null}{part}</span>))}</>}
        status={value.status}
        entityId={id}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ProductModerationActions id={id} status={value.status} onDone={handleModeration} />
            {!fullPage && (
              <Link
                href={`/products/${id}?returnTo=${encodeURIComponent(returnTo)}`}
                style={{ padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#fff', color: '#1e6178', border: '1px solid #d9e2e6', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                Full page ↗
              </Link>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className={styles['detailContent']}>
        {/* ── Overview ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <AdminDetailSection title="Product Information">
              <AdminKeyValueGrid items={overviewItems} />
            </AdminDetailSection>

            {/* Attributes (if any) */}
            {value['attributes'] && typeof value['attributes'] === 'object' && Object.keys(value['attributes'] as Record<string, unknown>).length > 0 && (
              <AdminDetailSection title="Attributes">
                <AdminKeyValueGrid
                  items={Object.entries(value['attributes'] as Record<string, unknown>).map(([k, v]) => ({
                    key: k,
                    label: k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()),
                    value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? 'Not set'),
                  }))}
                />
              </AdminDetailSection>
            )}

            <AdminDetailSection title="Technical Identifiers" collapsible defaultCollapsed>
              <AdminKeyValueGrid items={technicalItems} columns={1} />
            </AdminDetailSection>
          </>
        )}

        {/* ── Variants ─────────────────────────────────────────── */}
        {activeTab === 'variants' && (
          <AdminDetailSection title={`Variants (${value.variants.length})`}>
            {value.variants.length > 0 ? (
              <AdminRelatedTable
                columns={variantColumns}
                data={value.variants as unknown as Record<string, unknown>[]}
                emptyMessage="No variants found."
              />
            ) : (
              <AdminEmptyState
                title="No variants yet"
                description="This product has no variants configured. Variants are created through Product Studio."
              />
            )}
          </AdminDetailSection>
        )}

        {/* ── Offers ───────────────────────────────────────────── */}
        {activeTab === 'offers' && (
          <AdminDetailSection
            title={`Merchant Offers (${offers.length})`}
            description="Offers represent how merchants sell this product. Pricing, MOQ, and availability are managed here."
          >
            {offersError && (
              <div style={{ padding: '8px 12px', background: '#fbeeec', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {offersError}
              </div>
            )}
            {offers.length > 0 ? (
              <AdminRelatedTable
                columns={offerColumns}
                data={offers as unknown as Record<string, unknown>[]}
                emptyMessage="No merchant offers yet."
              />
            ) : (
              <AdminEmptyState
                title="No merchant offers yet"
                description="Offers are where pricing, MOQ, and availability are managed. They are created by merchants after a product is approved."
              />
            )}
          </AdminDetailSection>
        )}

        {/* ── Media ────────────────────────────────────────────── */}
        {activeTab === 'media' && (
          <>
            <AdminDetailSection title={`Images (${value.imageCount})`}>
              {previews.error && (
                <div style={{ padding: '8px 12px', background: '#fbeeec', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                  Failed to load previews. <button type="button" onClick={previews.reload} style={{ color: '#1e6178', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Retry</button>
                </div>
              )}
              {images.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                  {images.map(reference => (
                    <PreviewImage
                      key={reference + (previews.data?.previews[reference] || '')}
                      reference={reference}
                      url={previews.data?.previews[reference]}
                    />
                  ))}
                </div>
              ) : (
                <AdminEmptyState title="No images" description="This product has no image references." />
              )}
            </AdminDetailSection>

            <AdminDetailSection title={`Media Records (${value.media.length})`}>
              {value.media.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {value.media.map(item => (
                    <div key={item.id as string} style={{ padding: 14, border: '1px solid #d9e2e6', borderRadius: 8, background: '#fff' }}>
                      <AdminKeyValueGrid
                        columns={1}
                        items={[
                          { key: 'type', label: 'Type', value: item.mediaType },
                          { key: 'url', label: 'URL', value: item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1e6178', wordBreak: 'break-all' }}>{item.url}</a> : 'Not set' },
                          { key: 'id', label: 'ID', value: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(item.id)}</span> },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <AdminEmptyState title="No media records" description="No media records are associated with this product." />
              )}
            </AdminDetailSection>
          </>
        )}
      </div>
    </div>
  );
}
