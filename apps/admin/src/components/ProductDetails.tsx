'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { AdminProduct, moderateAdminProduct, adminRequest } from '../lib/api';
import { useAdminResource } from '../hooks/useAdminTable';
import { useRequirePerms } from '../hooks/useRequirePerms';
import { ErrorNotice, PreviewImage, RecordFields } from './RecordFields';
import styles from './management.module.css';

type OfferSummary = { id: string; status: string; currency: string; basePriceMinor: number | null; moq: number; storeId: string; leadTimeDays: number | null };

export function ProductModerationActions({ id, status, onDone }: { id: string; status: string; onDone: (decision: string) => void }) {
  const { hasAccess } = useRequirePerms(['admin:merchants:read']);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  async function moderate(decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED') {
    if (!hasAccess || pending.current) return;
    if (decision === 'ARCHIVED' && !window.confirm('Archive this product? It will no longer appear in the moderation list.')) return;
    pending.current = true; setBusy(true); setError('');
    try { await moderateAdminProduct(id, decision); onDone(decision); }
    catch (err) { setError(err instanceof Error ? err.message : 'Moderation failed'); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!hasAccess || status === 'ARCHIVED') return null;
  return <div>
    <div className={styles['actions']}>
      <button type="button" data-moderation="APPROVED" disabled={busy || status === 'ACTIVE'} onClick={() => moderate('APPROVED')}>Approve</button>
      <button type="button" data-moderation="REJECTED" disabled={busy || status === 'REJECTED'} onClick={() => moderate('REJECTED')}>Reject</button>
      <button type="button" disabled={busy} onClick={() => moderate('ARCHIVED')}>Archive</button>
    </div>
    <ErrorNotice message={error} />
  </div>;
}

const refs = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean) : [];

export default function ProductDetails({ id, fullPage = false, returnTo = '/products', onChanged }: {
  id: string; fullPage?: boolean; returnTo?: string; onChanged?: () => void;
}) {
  const { hasAccess } = useRequirePerms(['admin:merchants:read']);
  const product = useAdminResource<AdminProduct>(`products/${encodeURIComponent(id)}`, hasAccess);
  const previews = useAdminResource<{ previews: Record<string, string> }>(`admin/products/${encodeURIComponent(id)}/media-previews`, hasAccess);
  const [archived, setArchived] = useState(false);
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [offersError, setOffersError] = useState('');
  useEffect(() => {
    if (!id) return;
    adminRequest(`products/${encodeURIComponent(id)}/offers`)
      .then((data: unknown) => setOffers(Array.isArray(data) ? data as OfferSummary[] : []))
      .catch((err: unknown) => setOffersError(err instanceof Error ? err.message : 'Failed to load offers'));
  }, [id]);
  if (!hasAccess) return null;
  if (archived) return <div className={styles['notice']}>Product archived. <Link href={returnTo}>Back to products</Link></div>;
  if (product.loading) return <p role="status">Loading product details…</p>;
  if (product.error) return <ErrorNotice message={product.error} retry={product.reload} />;
  const value = product.data;
  if (!value) return null;
  const images = [...new Set([...refs(value.images), ...value.media.filter(m => m.mediaType === 'IMAGE').map(m => m.url.trim()).filter(Boolean)])];
  return <section>
    <div className={styles['toolbar']}>
      <ProductModerationActions id={id} status={value.status} onDone={decision => {
        if (decision === 'ARCHIVED') setArchived(true); else product.reload();
        onChanged?.();
      }} />
      {!fullPage && <Link href={`/products/${id}?returnTo=${encodeURIComponent(returnTo)}`}>Open full page ↗</Link>}
    </div>
    <h3>{value.title}</h3>
    <p>{value.store?.displayName || value.storeId} {value.store?.slug && ` /${value.store.slug}`}</p>
    <RecordFields record={value} omit={['store', 'media', 'variants', 'moq', 'isAvailable', 'attributes']} />
    {offersError && <ErrorNotice message={offersError} />}
    <h3>Merchant Offers ({offers.length})</h3>
    {offers.length > 0 ? (
      <div style={{ display: 'grid', gap: 8 }}>
        {offers.map(offer => (
          <div key={offer.id} className={styles['card']} style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
              <span><strong>Status:</strong> {offer.status}</span>
              <span><strong>Price:</strong> {offer.basePriceMinor != null ? `${(offer.basePriceMinor / 100).toFixed(2)} ${offer.currency}` : '—'}</span>
              <span><strong>MOQ:</strong> {offer.moq}</span>
              {offer.leadTimeDays != null && <span><strong>Lead time:</strong> {offer.leadTimeDays}d</span>}
            </div>
          </div>
        ))}
      </div>
    ) : <p>No merchant offers yet. Offers are where pricing, MOQ, and availability are managed.</p>}
    <h3>Store</h3>
    {value.store ? <RecordFields record={value.store} /> : <p>Store information unavailable.</p>}
    <h3>Images ({value.imageCount})</h3>
    <p className={styles['muted']}>Counts describe stored image references; failed or missing uploads can still be listed.</p>
    <ErrorNotice message={previews.error} retry={previews.reload} />
    <div className={styles['gallery']}>
      {images.map(reference => <PreviewImage key={reference + (previews.data?.previews[reference] || '')} reference={reference} url={previews.data?.previews[reference]} />)}
    </div>
    {!images.length && <p>No images.</p>}
    <h3>Variants ({value.variants.length})</h3>
    {value.variants.map(variant => {
      const stock = (variant as any).stock as { totalAvailable: number; totalOnHand: number; warehouseCount: number } | undefined;
      return <section key={variant.id} className={styles['card']}>
        <RecordFields record={variant} omit={['stock']} />
        {stock && (
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}>
            <span><strong>On Hand:</strong> {stock.totalOnHand}</span>
            <span><strong>Available:</strong> {stock.totalAvailable}</span>
            <span><strong>Warehouses:</strong> {stock.warehouseCount}</span>
          </div>
        )}
        <div className={styles['gallery']}>{refs(variant.images).map(reference => <PreviewImage key={reference} reference={reference} url={previews.data?.previews[reference]} />)}</div>
      </section>;
    })}
    {!value.variants.length && <p>No variants.</p>}
    <h3>Media records ({value.media.length})</h3>
    {value.media.map(item => <section key={item.id} className={styles['card']}><RecordFields record={item} /></section>)}
    {!value.media.length && <p>No media records.</p>}
  </section>;
}
