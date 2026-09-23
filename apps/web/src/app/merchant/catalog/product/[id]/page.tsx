'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchProduct, createProduct, updateProduct,
  listVariants, createVariant, updateVariant, bulkVariantOperations,
  listMedia, addMedia, removeMedia, presignMedia, reorderProductMedia,
  fetchStoreCategories, fetchBrands,
  ProductVariant, Category, MediaItem,
} from '../../../../../lib/buyer-api';
import { fetchMyStores } from '../../../../../lib/api';
import { pickStore } from '../../../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner } from '../../../../../components/Shared';
import { PageHeader, Breadcrumb } from '@scs/ui-kit';

const CONDITIONS = ['NEW', 'USED', 'REFURBISHED'];

type Brand = { id: string; name: string; slug: string; logoUrl: string | null };

/**
 * Thumbnail for one media row: prefers the server-resigned `displayUrl`, then
 * the thumb, then a legacy absolute URL. Falls back to the icon when the object
 * is missing so upload previews degrade gracefully instead of tearing.
 */
function MediaThumb({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  const src =
    item.displayUrl ?? item.thumbSrc ??
    (item.url.startsWith('http') ? item.url : undefined);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: 48, height: 36, borderRadius: 4, border: '1px solid #d9e2e6', objectFit: 'cover', flexShrink: 0, background: '#f7f9fa' }}
      />
    );
  }
  return (
    <div style={{
      width: 48, height: 36, borderRadius: 4, border: '1px solid #d9e2e6',
      background: '#f7f9fa', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, overflow: 'hidden',
    }}>🖼</div>
  );
}

export default function ProductEditorPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = String(params?.['id'] || '');
  const isNew = rawId === 'new';
  const id = isNew ? '' : rawId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [storeId, setStoreId] = useState('');

  // Product form
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [condition, setCondition] = useState('NEW');
  const [moq, setMoq] = useState('1');
  const [isAvailable, setIsAvailable] = useState(false);
  const [status, setStatus] = useState('DRAFT');
  const [resubmit, setResubmit] = useState(false);
  const [imagesText, setImagesText] = useState('');

  // SEO fields (Phase 3A)
  const [slug, setSlug] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [seoOpen, setSeoOpen] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Variants
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [vSku, setVSku] = useState('');
  const [vTitle, setVTitle] = useState('');
  const [vUnit, setVUnit] = useState('');
  const [vBarcode, setVBarcode] = useState('');
  const [vWeight, setVWeight] = useState('');
  const [vSaving, setVSaving] = useState(false);
  const [vActionLoading, setVActionLoading] = useState('');

  // Variant edit state
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Media
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaUrl, setMediaUrl] = useState('');
  // Empty string means the image belongs to the master product; a variant id
  // scopes it to that specific variant. Sticky so a merchant can attach a
  // batch of photos to the same variant without re-selecting each time.
  const [mediaVariantId, setMediaVariantId] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reorderLoading, setReorderLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let sid = '';
        if (isNew) {
          const stores = await fetchMyStores();
          sid = pickStore(stores)?.id || '';
        } else {
          const p = await fetchProduct(id) as any;
          sid = p.storeId;
          setTitle(p.title || '');
          setTitleAr(p.titleAr || '');
          setDescription(p.description || '');
          setDescriptionAr(p.descriptionAr || '');
          setCategoryId(p.categoryId || '');
          setBrandId(p.brandId || '');
          setCondition(p.condition || 'NEW');
          setMoq(String(p.moq ?? 1));
          setIsAvailable(!!p.isAvailable);
          setStatus(p.status || 'DRAFT');
          setResubmit((p.status || 'DRAFT') === 'REJECTED');
          setImagesText((p.images || []).map((u: unknown) => String(u)).join('\n'));
          // SEO fields
          setSlug(p.slug || '');
          const meta = (p.metadata || {}) as Record<string, unknown>;
          setMetaTitle(String(meta['metaTitle'] || ''));
          setMetaDescription(String(meta['metaDescription'] || ''));
        }
        setStoreId(sid);

        const [cats, brs] = await Promise.all([
          sid ? fetchStoreCategories(sid).catch(() => [] as Category[]) : Promise.resolve([] as Category[]),
          fetchBrands().catch(() => [] as Brand[]),
        ]);
        setCategories(cats);
        setBrands(brs);

        if (!isNew) {
          const [vs, ms] = await Promise.all([
            listVariants(id).catch(() => [] as ProductVariant[]),
            listMedia(id).catch(() => [] as MediaItem[]),
          ]);
          setVariants(vs);
          setMedia(ms);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load product');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const buildMetadata = () => {
    const meta: Record<string, unknown> = {};
    if (metaTitle.trim()) meta['metaTitle'] = metaTitle.trim();
    if (metaDescription.trim()) meta['metaDescription'] = metaDescription.trim();
    return Object.keys(meta).length > 0 ? meta : undefined;
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    setSavedMsg('');
    const images = imagesText.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      if (isNew) {
        if (!storeId) throw new Error('No store available — complete onboarding first');
        const created = await createProduct({
          storeId,
          title: title.trim(),
          titleAr: titleAr.trim() || undefined,
          description: description.trim() || undefined,
          descriptionAr: descriptionAr.trim() || undefined,
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          condition: condition || undefined,
          moq: moq ? Number(moq) : undefined,
          images,
        });
        await updateProduct(created.id, { isAvailable, metadata: buildMetadata() });
        router.push(`/merchant/catalog/product/${created.id}`);
      } else {
        await updateProduct(id, {
          title: title.trim(),
          titleAr: titleAr.trim() || undefined,
          description: description.trim() || undefined,
          descriptionAr: descriptionAr.trim() || undefined,
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          condition: condition || undefined,
          moq: moq ? Number(moq) : undefined,
          isAvailable,
          status: resubmit ? 'DRAFT' : undefined,
          images,
          slug: slug.trim() || undefined,
          metadata: buildMetadata(),
        });
        setSavedMsg('Product saved');
      }
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateVariant = async () => {
    if (!vSku.trim()) { setError('Variant SKU is required'); return; }
    setVSaving(true);
    setError('');
    try {
      await createVariant(id, {
        sku: vSku.trim(),
        title: vTitle.trim() || undefined,
        unit: vUnit.trim() || undefined,
        barcode: vBarcode.trim() || undefined,
        weightGrams: vWeight ? Number(vWeight) : undefined,
      });
      setVSku(''); setVTitle(''); setVUnit(''); setVBarcode(''); setVWeight('');
      setVariants(await listVariants(id));
    } catch (err: any) {
      setError(err.message || 'Create variant failed');
    } finally {
      setVSaving(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!window.confirm('Delete this variant?')) return;
    setVActionLoading(variantId);
    setError('');
    try {
      await bulkVariantOperations(id, { deleteIds: [variantId] });
      setVariants(await listVariants(id));
    } catch (err: any) {
      setError(err.message || 'Delete variant failed');
    } finally {
      setVActionLoading('');
    }
  };

  const startEditVariant = (v: ProductVariant) => {
    setEditingVariant(v);
    setEditSku(v.sku);
    setEditTitle(v.title || '');
    setEditUnit(v.unit || '');
    setEditBarcode(v.barcode || '');
    setEditWeight(v.weightGrams ? String(v.weightGrams) : '');
    setError('');
  };

  const cancelEditVariant = () => {
    setEditingVariant(null);
    setEditSku(''); setEditTitle(''); setEditUnit(''); setEditBarcode(''); setEditWeight('');
  };

  const handleSaveVariant = async () => {
    if (!editingVariant) return;
    if (!editSku.trim()) { setError('Variant SKU is required'); return; }
    setEditSaving(true);
    setError('');
    try {
      await updateVariant(id, editingVariant.id, {
        sku: editSku.trim(),
        title: editTitle.trim() || undefined,
        unit: editUnit.trim() || undefined,
        barcode: editBarcode.trim() || undefined,
        weightGrams: editWeight ? Number(editWeight) : undefined,
      });
      setVariants(await listVariants(id));
      cancelEditVariant();
    } catch (err: any) {
      setError(err.message || 'Update variant failed');
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleVariant = async (variant: ProductVariant) => {
    setVActionLoading(variant.id);
    setError('');
    try {
      await bulkVariantOperations(id, { toggleActive: [{ id: variant.id, isActive: !variant.isActive }] });
      setVariants(await listVariants(id));
    } catch (err: any) {
      setError(err.message || 'Toggle variant failed');
    } finally {
      setVActionLoading('');
    }
  };

  const handleAddMediaUrl = async () => {
    if (!mediaUrl.trim()) return;
    setMediaSaving(true);
    setError('');
    try {
      await addMedia(id, { url: mediaUrl.trim(), variantId: mediaVariantId || undefined });
      setMediaUrl('');
      setMedia(await listMedia(id));
    } catch (err: any) {
      setError(err.message || 'Add media failed');
    } finally {
      setMediaSaving(false);
    }
  };

  const handleRemoveMedia = async (mediaId: string) => {
    if (!window.confirm('Remove this media?')) return;
    setMediaSaving(true);
    setError('');
    try {
      await removeMedia(id, mediaId);
      setMedia(await listMedia(id));
    } catch (err: any) {
      setError(err.message || 'Remove media failed');
    } finally {
      setMediaSaving(false);
    }
  };

  const handleMoveMedia = async (index: number, direction: -1 | 1) => {
    const newMedia = [...media];
    const target = index + direction;
    if (target < 0 || target >= newMedia.length) return;
    [newMedia[index], newMedia[target]] = [newMedia[target]!, newMedia[index]!];
    setMedia(newMedia);
    setReorderLoading(true);
    try {
      await reorderProductMedia(id, newMedia.map(m => m.id));
    } catch (err: any) {
      setError(err.message || 'Reorder failed');
      setMedia(await listMedia(id));
    } finally {
      setReorderLoading(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const { uploadUrl, storageKey } = await presignMedia({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      // PUT bytes directly to object storage — fail early if the upload
      // doesn't succeed so we never register metadata for a missing object.
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) {
        throw new Error(`Upload to storage failed (${putRes.status}). Check bucket CORS rules.`);
      }
      await addMedia(id, {
        url: storageKey,
        mimeType: file.type || undefined,
        fileSize: file.size,
        variantId: mediaVariantId || undefined,
      });
      setMedia(await listMedia(id));
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header Banner */}
      <PageHeader
        title={isNew ? 'New Product' : 'Edit Product'}
        breadcrumbs={<Breadcrumb items={[{ label: 'Catalog', href: '/merchant/catalog' }, { label: isNew ? 'New Product' : 'Edit' }]} />}
      />
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}
      {savedMsg && <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{savedMsg}</div>}

      {/* Product form */}
      <div style={card}>
        <div style={grid}>
          <label style={label}>Title (English) *
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={input} />
          </label>
          <label style={label}>Title (Arabic)
            <input type="text" value={titleAr} onChange={e => setTitleAr(e.target.value)} style={input} dir="rtl" />
          </label>
          <label style={label}>Category
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={input}>
              <option value="">— None —</option>
              {buildCategoryOptions(categories).map(({ cat, depth }) => (
                <option key={cat.id} value={cat.id}>{'  '.repeat(depth)}{depth > 0 ? '└ ' : ''}{cat.name}</option>
              ))}
            </select>
          </label>
          <label style={label}>Brand
            <select value={brandId} onChange={e => setBrandId(e.target.value)} style={input}>
              <option value="">— None —</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label style={label}>Condition
            <select value={condition} onChange={e => setCondition(e.target.value)} style={input}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={label}>MOQ
            <input type="number" min={1} value={moq} onChange={e => setMoq(e.target.value)} style={input} />
          </label>
          {!isNew && (
            <label style={label}>Status
              <div style={{ ...input, background: '#f7f9fa', fontWeight: 600, color: '#0f3340' }}>{status.replace(/_/g, ' ')}</div>
            </label>
          )}
        </div>

        {!isNew && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f3340', margin: '12px 0' }}>
            <input type="checkbox" checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} />
            Available for purchase
          </label>
        )}
        {!isNew && status === 'REJECTED' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f3340', margin: '12px 0' }}>
            <input type="checkbox" checked={resubmit} onChange={e => setResubmit(e.target.checked)} />
            Resubmit for platform review
          </label>
        )}
        {!isNew && (
          <p style={{ fontSize: 12, color: '#5b6b74', margin: '8px 0' }}>
            Products go live only after platform review — publishing is handled by moderators. Use &quot;Available for purchase&quot; to control whether an approved product can be ordered.
          </p>
        )}

        <label style={label}>Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
        </label>
        <label style={label}>Description (Arabic)
          <textarea value={descriptionAr} onChange={e => setDescriptionAr(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} dir="rtl" />
        </label>
        <label style={label}>Image URLs (one per line)
          <textarea value={imagesText} onChange={e => setImagesText(e.target.value)} rows={3} placeholder="https://…" style={{ ...input, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={handleSave} disabled={saving || !title.trim()} style={primaryBtn}>
            {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
          </button>
          <Link href="/merchant/catalog" style={ghostLink}>Cancel</Link>
        </div>
        {isNew && <p style={{ fontSize: 12, color: '#5b6b74', marginTop: 10 }}>Variants and media can be added after the product is created.</p>}
      </div>

      {/* SEO & URL Section (Phase 3A) */}
      {!isNew && (
        <div style={{ ...card, marginTop: 20 }}>
          <button onClick={() => setSeoOpen(!seoOpen)} style={collapsibleHeader}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#0f3340' }}>SEO & URL</span>
            <span style={{ fontSize: 12, color: '#5b6b74' }}>{seoOpen ? '▲ Collapse' : '▼ Expand'}</span>
          </button>
          {seoOpen && (
            <div style={{ marginTop: 12 }}>
              <label style={label}>Slug
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} style={{ ...input, fontFamily: 'monospace', fontSize: 12 }} placeholder="product-url-slug" />
              </label>
              <label style={label}>Meta Title
                <input type="text" value={metaTitle} onChange={e => setMetaTitle(e.target.value)} maxLength={60} style={input} placeholder="SEO page title" />
                <span style={{ fontSize: 11, color: metaTitle.length > 60 ? '#991b1b' : '#5b6b74', textAlign: 'right' }}>{metaTitle.length}/60</span>
              </label>
              <label style={label}>Meta Description
                <textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} maxLength={160} rows={2} style={{ ...input, resize: 'vertical' }} placeholder="Brief description for search engines" />
                <span style={{ fontSize: 11, color: metaDescription.length > 160 ? '#991b1b' : '#5b6b74', textAlign: 'right' }}>{metaDescription.length}/160</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Variants + Media (edit only) */}
      {!isNew && (
        <>
          {/* Variants Section (Phase 3B — interactive) */}
          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>Variants ({variants.length})</h2>
            {variants.length === 0 ? (
              <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 12 }}>No variants yet.</p>
            ) : (
              <div style={{ ...tableWrap, marginBottom: 12 }}>
                <table style={table}>
                  <thead><tr style={theadRow}>
                    <th style={th}>SKU</th><th style={th}>Title</th><th style={th}>Unit</th>
                    <th style={th}>Barcode</th><th style={th}>Weight (g)</th><th style={th}>Active</th>
                    <th style={th}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {variants.map(v => (
                      <tr key={v.id} style={tbodyRow}>
                        <td style={td}><code style={{ fontSize: 12 }}>{v.sku}</code></td>
                        <td style={td}>{v.title || '—'}</td>
                        <td style={td}>{v.unit || '—'}</td>
                        <td style={td}>{v.barcode || '—'}</td>
                        <td style={td}>{v.weightGrams ?? '—'}</td>
                        <td style={td}>
                          <button
                            onClick={() => handleToggleVariant(v)}
                            disabled={vActionLoading === v.id}
                            style={{
                              ...toggleBtn,
                              background: v.isActive ? '#d1fae5' : '#fee2e2',
                              color: v.isActive ? '#065f46' : '#991b1b',
                            }}
                          >
                            {vActionLoading === v.id ? '…' : v.isActive ? '✓ Active' : '✗ Inactive'}
                          </button>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => startEditVariant(v)} disabled={vActionLoading === v.id} style={editBtn}>
                              Edit
                            </button>
                            <button onClick={() => handleDeleteVariant(v.id)} disabled={vActionLoading === v.id} style={deleteBtn}>
                              {vActionLoading === v.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Inline edit form */}
            {editingVariant && (
              <div style={{ background: '#eff8ff', border: '1px solid #93c5fd', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', margin: '0 0 12px' }}>
                  Editing variant: <code style={{ fontSize: 12 }}>{editingVariant.sku}</code>
                </h3>
                <div style={grid}>
                  <input type="text" placeholder="SKU *" value={editSku} onChange={e => setEditSku(e.target.value)} style={input} />
                  <input type="text" placeholder="Title" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={input} />
                  <input type="text" placeholder="Unit (e.g. KG, PCS)" value={editUnit} onChange={e => setEditUnit(e.target.value)} style={input} />
                  <input type="text" placeholder="Barcode" value={editBarcode} onChange={e => setEditBarcode(e.target.value)} style={input} />
                  <input type="number" placeholder="Weight (g)" value={editWeight} onChange={e => setEditWeight(e.target.value)} style={input} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleSaveVariant} disabled={editSaving || !editSku.trim()} style={primaryBtn}>
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={cancelEditVariant} disabled={editSaving} style={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div style={grid}>
              <input type="text" placeholder="SKU *" value={vSku} onChange={e => setVSku(e.target.value)} style={input} />
              <input type="text" placeholder="Title" value={vTitle} onChange={e => setVTitle(e.target.value)} style={input} />
              <input type="text" placeholder="Unit (e.g. KG, PCS)" value={vUnit} onChange={e => setVUnit(e.target.value)} style={input} />
              <input type="text" placeholder="Barcode" value={vBarcode} onChange={e => setVBarcode(e.target.value)} style={input} />
              <input type="number" placeholder="Weight (g)" value={vWeight} onChange={e => setVWeight(e.target.value)} style={input} />
              <button onClick={handleCreateVariant} disabled={vSaving || !vSku.trim()} style={primaryBtn}>
                {vSaving ? 'Adding…' : '+ Add Variant'}
              </button>
            </div>
          </div>

          {/* Stock Overview (Phase 3D — enhanced with live stock data) */}
          {variants.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <h2 style={sectionTitle}>Stock Overview</h2>
              <div style={{ ...tableWrap }}>
                <table style={table}>
                  <thead><tr style={theadRow}>
                    <th style={th}>SKU</th><th style={th}>Variant</th><th style={th}>On Hand</th><th style={th}>Available</th><th style={th}>Warehouses</th><th style={th}>Inventory</th>
                  </tr></thead>
                  <tbody>
                    {variants.map(v => {
                      const stock = (v as any).stock;
                      return (
                        <tr key={v.id} style={tbodyRow}>
                          <td style={td}><code style={{ fontSize: 12 }}>{v.sku}</code></td>
                          <td style={td}>{v.title || v.sku}</td>
                          <td style={td}>{stock ? stock.totalOnHand : '—'}</td>
                          <td style={td}><strong>{stock ? stock.totalAvailable : '—'}</strong></td>
                          <td style={td}>{stock && stock.warehouseCount > 0 ? stock.warehouseCount : <span style={{ color: '#991b1b', fontSize: 11 }}>Unassigned</span>}</td>
                          <td style={td}>
                            <Link href={`/merchant/inventory?variant=${v.id}`} style={{ fontSize: 12, color: '#1e6178', textDecoration: 'none', fontWeight: 600 }}>
                              View stock →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Media Section (Phase 3C — reorderable) */}
          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>Media ({media.length})</h2>
            {media.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {media.map((m, idx) => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: idx % 2 === 0 ? '#fff' : '#f7f9fa',
                    borderBottom: '1px solid #e2e8f0',
                  }}>
                    <span style={{ fontSize: 11, color: '#5b6b74', width: 20, textAlign: 'center', fontWeight: 600 }}>{idx + 1}</span>
                    <MediaThumb item={m} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {(() => {
                        const v = m.variantId ? variants.find(vv => vv.id === m.variantId) : null;
                        return v ? (
                          <span style={variantChip} title="This image is scoped to a specific variant">
                            🏷 Variant: {v.title || v.sku} · <code style={{ fontSize: 10 }}>{v.sku}</code>
                          </span>
                        ) : (
                          <span style={masterChip} title="This image applies to the whole product">📦 Master product</span>
                        );
                      })()}
                      <div style={{ fontSize: 11, color: '#5b6b74', wordBreak: 'break-all', marginTop: 2 }}>{m.url.length > 60 ? `${m.url.slice(0, 60)}…` : m.url}</div>
                      <div style={{ fontSize: 10, color: '#a0aec0' }}>{m.mediaType}{m.mimeType ? ` · ${m.mimeType}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleMoveMedia(idx, -1)} disabled={idx === 0 || reorderLoading} style={moveBtn} title="Move up">↑</button>
                      <button onClick={() => handleMoveMedia(idx, 1)} disabled={idx === media.length - 1 || reorderLoading} style={moveBtn} title="Move down">↓</button>
                      <button onClick={() => handleRemoveMedia(m.id)} disabled={mediaSaving} style={removeMediaBtn} title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={mediaVariantId}
                onChange={e => setMediaVariantId(e.target.value)}
                aria-label="Associate added media with a variant"
                style={{ ...input, minWidth: 210, maxWidth: 320 }}
              >
                <option value="">📦 Master product (all variants)</option>
                {variants.map(v => (
                  <option key={v.id} value={v.id}>{`${v.title || v.sku} · ${v.sku}`}</option>
                ))}
              </select>
              <input type="text" placeholder="Add image by URL…" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} style={{ ...input, flex: 1, minWidth: 220 }} />
              <button onClick={handleAddMediaUrl} disabled={mediaSaving || !mediaUrl.trim()} style={primaryBtn}>
                {mediaSaving ? 'Adding…' : '+ Add URL'}
              </button>
              <label style={ghostBtn}>
                {uploading ? 'Uploading…' : 'Upload File'}
                <input type="file" accept="image/*" disabled={uploading} style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); e.target.value = ''; }} />
              </label>
            </div>
            <p style={{ fontSize: 11, color: '#5b6b74', margin: '8px 0 0' }}>
              Media added while a variant is selected is attached to that variant; leave it on
              &quot;Master product&quot; to apply the image to the whole listing.
            </p>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 20 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 8 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937', background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const ghostLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, textDecoration: 'none' };
const collapsibleHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const toggleBtn: React.CSSProperties = { padding: '3px 10px', fontSize: 11, fontWeight: 600, border: '1px solid #d9e2e6', borderRadius: 10, cursor: 'pointer' };
const deleteBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#1e6178', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer' };
const moveBtn: React.CSSProperties = { width: 24, height: 24, fontSize: 12, fontWeight: 700, background: '#edf2f7', color: '#0f3340', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
const removeMediaBtn: React.CSSProperties = { width: 24, height: 24, fontSize: 11, fontWeight: 700, background: 'rgba(153,27,27,0.1)', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
const variantChip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#eff8ff', color: '#1e6178', border: '1px solid #93c5fd', marginBottom: 2 };
const masterChip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: '#edf2f7', color: '#5b6b74', border: '1px solid #d9e2e6', marginBottom: 2 };

/** Build hierarchical category options sorted by path. */
function buildCategoryOptions(cats: Category[]): Array<{ cat: Category; depth: number }> {
  return [...cats]
    .map(cat => {
      const segments = (cat.path || '').split('/').filter(Boolean);
      const depth = Math.max(0, segments.length - 1);
      return { cat, depth };
    })
    .sort((a, b) => (a.cat.path || '').localeCompare(b.cat.path || ''));
}
