'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchProduct, createProduct, updateProduct,
  listVariants, createVariant,
  listMedia, addMedia, presignMedia,
  fetchStoreCategories, fetchBrands,
  ProductVariant, Category, MediaItem,
} from '../../../../../lib/buyer-api';
import { fetchMyStores } from '../../../../../lib/api';
import { LoadingSpinner, ErrorBanner } from '../../../../../components/Shared';

const CONDITIONS = ['NEW', 'USED', 'REFURBISHED'];
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

type Brand = { id: string; name: string; slug: string; logoUrl: string | null };

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
  const [imagesText, setImagesText] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Variants (edit only)
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [vSku, setVSku] = useState('');
  const [vTitle, setVTitle] = useState('');
  const [vUnit, setVUnit] = useState('');
  const [vBarcode, setVBarcode] = useState('');
  const [vWeight, setVWeight] = useState('');
  const [vSaving, setVSaving] = useState(false);

  // Media (edit only)
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let sid = '';
        if (isNew) {
          const stores = await fetchMyStores();
          sid = stores[0]?.id || '';
        } else {
          const p = await fetchProduct(id);
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
          setImagesText((p.images || []).map(u => String(u)).join('\n'));
        }
        setStoreId(sid);

        const [cats, brs] = await Promise.all([
          sid ? fetchStoreCategories(sid).catch(() => []) : Promise.resolve([] as Category[]),
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
        // status/isAvailable are not accepted on create — apply via update
        await updateProduct(created.id, { status, isAvailable });
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
          status,
          images,
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

  const handleAddMediaUrl = async () => {
    if (!mediaUrl.trim()) return;
    setMediaSaving(true);
    setError('');
    try {
      await addMedia(id, { url: mediaUrl.trim() });
      setMediaUrl('');
      setMedia(await listMedia(id));
    } catch (err: any) {
      setError(err.message || 'Add media failed');
    } finally {
      setMediaSaving(false);
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
      try {
        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
      } catch { /* dev storage is stubbed — ignore upload failure, still record media */ }
      await addMedia(id, { url: storageKey, mimeType: file.type || undefined, fileSize: file.size });
      setMedia(await listMedia(id));
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <Link href="/merchant/catalog" style={{ fontSize: 13, color: '#5b6b74', textDecoration: 'none' }}>← Back to Catalog</Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', margin: '8px 0 16px' }}>
        {isNew ? 'New Product' : 'Edit Product'}
      </h1>

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
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
              <select value={status} onChange={e => setStatus(e.target.value)} style={input}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>

        {!isNew && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f3340', margin: '12px 0' }}>
            <input type="checkbox" checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} />
            Available for purchase
          </label>
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

      {/* Variants + Media (edit only) */}
      {!isNew && (
        <>
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
                  </tr></thead>
                  <tbody>
                    {variants.map(v => (
                      <tr key={v.id} style={tbodyRow}>
                        <td style={td}><code style={{ fontSize: 12 }}>{v.sku}</code></td>
                        <td style={td}>{v.title || '—'}</td>
                        <td style={td}>{v.unit || '—'}</td>
                        <td style={td}>{v.barcode || '—'}</td>
                        <td style={td}>{v.weightGrams ?? '—'}</td>
                        <td style={td}>{v.isActive ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>Media ({media.length})</h2>
            {media.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {media.map(m => (
                  <div key={m.id} style={{ width: 96, textAlign: 'center' }}>
                    <div style={{ width: 96, height: 72, borderRadius: 6, border: '1px solid #d9e2e6', background: '#f7f9fa center/cover no-repeat', backgroundImage: m.url.startsWith('http') ? `url(${m.url})` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#a0aec0', overflow: 'hidden' }}>
                      {!m.url.startsWith('http') && '🖼'}
                    </div>
                    <div style={{ fontSize: 10, color: '#5b6b74', marginTop: 4, wordBreak: 'break-all' }}>{m.mediaType}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
          </div>
        </>
      )}
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
const tableWrap: React.CSSProperties = { border: '1px solid #d9e2e6', borderRadius: 8, overflow: 'hidden' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: '#f0f4f7', borderBottom: '1px solid #d9e2e6' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #eef2f5' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '8px 12px', color: '#1f2937' };
