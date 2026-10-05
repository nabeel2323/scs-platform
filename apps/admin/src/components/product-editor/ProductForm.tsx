'use client';

/**
 * ProductForm — shared admin product create/edit form (PHASE 4 P3).
 *
 * Supports:
 * - Create mode: initializes clean defaults, always creates DRAFT
 * - Edit mode: loads existing product + attributes + variants + media
 * - Typed attribute editor from product type schema
 * - Read-only variant display
 * - Media management (add/remove/reorder)
 * - Optimistic locking conflict UX (409)
 * - Unsaved changes protection (beforeunload)
 * - Arabic RTL fields
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  adminCreateProduct, adminUpdateProduct, adminGetProductAttributeValues, adminSetProductAttributeValues,
  adminRequest, AdminApiError, AdminProduct,
  fetchAdminCategories, fetchAdminBrands, fetchProductTypes, fetchProductTypeSchema,
  type ProductTypeSchema, type AdminCategory, type AdminBrand, type ProductType,
} from '../../lib/api';
import styles from './product-form.module.css';

// ── Types ──────────────────────────────────────────────────────

interface ProductFormData {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  slug: string;
  condition: string;
  categoryId: string;
  brandId: string;
  productTypeId: string;
  gtin: string;
  ean: string;
  mpn: string;
}

interface ProductFormProps {
  mode: 'create' | 'edit';
  productId?: string;
}

interface AttrValue {
  attributeDefinitionId: string;
  value: string;
}

const EMPTY_FORM: ProductFormData = {
  title: '', titleAr: '', description: '', descriptionAr: '',
  slug: '', condition: 'NEW', categoryId: '', brandId: '', productTypeId: '',
  gtin: '', ean: '', mpn: '',
};

// CSS class helper — avoids noPropertyAccessFromIndexSignature errors
const s = (name: string) => styles[name] ?? name;

// ── Component ──────────────────────────────────────────────────

export default function ProductForm({ mode, productId }: ProductFormProps) {
  const router = useRouter();

  // Core state
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<ProductFormData>(EMPTY_FORM);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Conflict state (P3.10)
  const [conflict, setConflict] = useState<{ currentUpdatedAt: string } | null>(null);

  // Typed attributes
  const [typeSchema, setTypeSchema] = useState<ProductTypeSchema | null>(null);
  const [attrValues, setAttrValues] = useState<AttrValue[]>([]);
  const [initialAttrValues, setInitialAttrValues] = useState<AttrValue[]>([]);

  // Variants (read-only)
  const [variants, setVariants] = useState<Array<Record<string, unknown>>>([]);

  // Media
  const [media, setMedia] = useState<Array<{ id: string; mediaType: string; url: string; sortOrder: number }>>([]);

  // Reference data
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    const formChanged = JSON.stringify(form) !== JSON.stringify(initialForm);
    const attrsChanged = JSON.stringify(attrValues) !== JSON.stringify(initialAttrValues);
    return formChanged || attrsChanged;
  }, [form, initialForm, attrValues, initialAttrValues]);

  // beforeunload protection (P3.9)
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Load data for edit mode ──────────────────────────────────
  useEffect(() => {
    if (mode !== 'edit' || !productId) return;
    let cancelled = false;
    (async () => {
      try {
        const [prod, cats, brs, types] = await Promise.all([
          adminRequest<AdminProduct>(`products/${encodeURIComponent(productId)}`),
          fetchAdminCategories(),
          fetchAdminBrands(),
          fetchProductTypes(),
        ]);
        if (cancelled) return;
        setProduct(prod);
        setCategories(cats);
        setBrands(brs);
        setProductTypes(types);

        const formData: ProductFormData = {
          title: (prod.title as string) || '',
          titleAr: (prod['titleAr'] as string) || (prod['title_ar'] as string) || '',
          description: (prod['description'] as string) || '',
          descriptionAr: (prod['descriptionAr'] as string) || (prod['description_ar'] as string) || '',
          slug: (prod.slug as string) || '',
          condition: (prod['condition'] as string) || 'NEW',
          categoryId: (prod['categoryId'] as string) || (prod['category_id'] as string) || '',
          brandId: (prod['brandId'] as string) || (prod['brand_id'] as string) || '',
          productTypeId: (prod['productTypeId'] as string) || (prod['product_type_id'] as string) || '',
          gtin: (prod['gtin'] as string) || '',
          ean: (prod['ean'] as string) || '',
          mpn: (prod['mpn'] as string) || '',
        };
        setForm(formData);
        setInitialForm(formData);

        // Load variants
        try {
          const vars = await adminRequest<Array<Record<string, unknown>>>(`products/${encodeURIComponent(productId)}/variants`);
          if (!cancelled) setVariants(vars || []);
        } catch { /* no variants */ }

        // Load media
        try {
          const med = await adminRequest<Array<{ id: string; mediaType: string; url: string; sortOrder: number }>>(`products/${encodeURIComponent(productId)}/media`);
          if (!cancelled) setMedia(med || []);
        } catch { /* no media */ }

        // Load typed attributes
        try {
          const attrs = await adminGetProductAttributeValues(productId);
          if (!cancelled) {
            const mapped: AttrValue[] = attrs.map(a => ({
              attributeDefinitionId: a.attributeDefinitionId,
              value: a.valueText ?? a.optionValue ?? a.valueNumber ?? String(a.valueBoolean ?? ''),
            }));
            setAttrValues(mapped);
            setInitialAttrValues(mapped);
          }
        } catch { /* no attributes */ }

        // Load product type schema if type is set
        const ptId = formData.productTypeId;
        if (ptId) {
          try {
            const schema = await fetchProductTypeSchema(ptId);
            if (!cancelled) setTypeSchema(schema);
          } catch { /* schema unavailable */ }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load product');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, productId]);

  // ── Load reference data for create mode ──────────────────────
  useEffect(() => {
    if (mode !== 'create') return;
    Promise.all([fetchAdminCategories(), fetchAdminBrands(), fetchProductTypes()])
      .then(([cats, brs, types]) => { setCategories(cats); setBrands(brs); setProductTypes(types); })
      .catch(() => {});
  }, [mode]);

  // ── Load product type schema when type changes ──────────────
  useEffect(() => {
    if (!form.productTypeId) { setTypeSchema(null); return; }
    fetchProductTypeSchema(form.productTypeId)
      .then(setTypeSchema)
      .catch(() => setTypeSchema(null));
  }, [form.productTypeId]);

  // ── Field update helper ──────────────────────────────────────
  const updateField = useCallback(<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Save handler ─────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    setConflict(null);

    try {
      if (mode === 'create') {
        const result = await adminCreateProduct({
          title: form.title,
          titleAr: form.titleAr || undefined,
          slug: form.slug || undefined,
          description: form.description || undefined,
          descriptionAr: form.descriptionAr || undefined,
          condition: form.condition || undefined,
          categoryId: form.categoryId || undefined,
          brandId: form.brandId || undefined,
          productTypeId: form.productTypeId || undefined,
          gtin: form.gtin || undefined,
          ean: form.ean || undefined,
          mpn: form.mpn || undefined,
        });
        const newId = (result as { id: string }).id;
        if (newId && form.productTypeId && attrValues.length > 0) {
          await adminSetProductAttributeValues(newId, attrValues.map(a => ({
            attributeDefinitionId: a.attributeDefinitionId,
            value: a.value || null,
          })));
        }
        setSuccessMsg('Product created successfully as DRAFT.');
        setInitialForm(form);
        setInitialAttrValues(attrValues);
        if (newId) router.push(`/products/${newId}/edit`);
      } else if (mode === 'edit' && productId && product) {
        const updatedAt = (product['updatedAt'] as string) || (product['updated_at'] as string);
        await adminUpdateProduct(productId, {
          title: form.title,
          titleAr: form.titleAr || undefined,
          description: form.description || undefined,
          descriptionAr: form.descriptionAr || undefined,
          slug: form.slug || undefined,
          condition: form.condition || undefined,
          categoryId: form.categoryId || undefined,
          brandId: form.brandId || undefined,
          productTypeId: form.productTypeId || null,
          gtin: form.gtin || null,
          ean: form.ean || null,
          mpn: form.mpn || null,
          updatedAt,
        });
        if (form.productTypeId && attrValues.length > 0) {
          await adminSetProductAttributeValues(productId, attrValues.map(a => ({
            attributeDefinitionId: a.attributeDefinitionId,
            value: a.value || null,
          })));
        }
        const refreshed = await adminRequest<AdminProduct>(`products/${encodeURIComponent(productId)}`);
        setProduct(refreshed);
        setInitialForm(form);
        setInitialAttrValues(attrValues);
        setSuccessMsg('Product saved successfully.');
      }
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setConflict({ currentUpdatedAt: (err.body['currentUpdatedAt'] as string) || '' });
      } else {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }, [mode, form, attrValues, productId, product, router]);

  // ── Conflict reload ──────────────────────────────────────────
  const handleConflictReload = useCallback(async () => {
    if (!productId) return;
    setConflict(null);
    setError('');
    try {
      const prod = await adminRequest<AdminProduct>(`products/${encodeURIComponent(productId)}`);
      setProduct(prod);
      const formData: ProductFormData = {
        title: (prod.title as string) || '',
        titleAr: (prod['titleAr'] as string) || (prod['title_ar'] as string) || '',
        description: (prod['description'] as string) || '',
        descriptionAr: (prod['descriptionAr'] as string) || (prod['description_ar'] as string) || '',
        slug: (prod.slug as string) || '',
        condition: (prod['condition'] as string) || 'NEW',
        categoryId: (prod['categoryId'] as string) || (prod['category_id'] as string) || '',
        brandId: (prod['brandId'] as string) || (prod['brand_id'] as string) || '',
        productTypeId: (prod['productTypeId'] as string) || (prod['product_type_id'] as string) || '',
        gtin: (prod['gtin'] as string) || '',
        ean: (prod['ean'] as string) || '',
        mpn: (prod['mpn'] as string) || '',
      };
      setForm(formData);
      setInitialForm(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload');
    }
  }, [productId]);

  const handleConflictDiscard = useCallback(() => {
    setConflict(null);
    router.push(productId ? `/products/${productId}` : '/products');
  }, [router, productId]);

  // ── Attribute value update ───────────────────────────────────
  const updateAttrValue = useCallback((attrId: string, value: string) => {
    setAttrValues(prev => {
      const existing = prev.find(a => a.attributeDefinitionId === attrId);
      if (existing) {
        return prev.map(a => a.attributeDefinitionId === attrId ? { ...a, value } : a);
      }
      return [...prev, { attributeDefinitionId: attrId, value }];
    });
  }, []);

  // ── Loading / error states ───────────────────────────────────
  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#5b6b74' }}>Loading product…</div>;
  }

  if (mode === 'edit' && error && !product) {
    return (
      <div className={s('content')} style={{ padding: 24 }}>
        <div className={s('errorBanner')}>{error}</div>
        <Link href="/products" style={{ color: '#1e6178' }}>← Back to products</Link>
      </div>
    );
  }

  const status = product ? ((product.status as string) || 'DRAFT') : 'DRAFT';
  const hasVariantsOrOffers = variants.length > 0;

  return (
    <div className={s('shell')}>
      {/* Header */}
      <div className={s('header')}>
        <div style={{ marginBottom: 8 }}>
          <Link href="/products" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Products</Link>
        </div>
        <h1>
          {mode === 'create' ? 'Create Product' : `Edit: ${product?.title || productId}`}
          {isDirty && <span className={s('dirtyIndicator')} title="Unsaved changes" />}
        </h1>
        <p>{mode === 'create' ? 'New canonical product — will be created as DRAFT' : `Status: ${status}`}</p>
      </div>

      <div className={s('content')}>
        {/* Conflict banner (P3.10) */}
        {conflict && (
          <div className={s('conflictBanner')} role="alert">
            <h3>⚠ Edit Conflict Detected</h3>
            <p>Another user changed this product while you were editing. Your changes cannot be saved automatically.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={s('btnPrimary')} onClick={handleConflictReload}>Reload</button>
              <button type="button" className={s('btnSecondary')} onClick={handleConflictDiscard}>Discard &amp; Leave</button>
            </div>
          </div>
        )}

        {error && !conflict && <div className={s('errorBanner')} role="alert">{error}</div>}
        {successMsg && <div className={s('successBanner')}>{successMsg}</div>}

        {/* ── Identity Section ─────────────────────────────────── */}
        <div className={s('section')}>
          <h2 className={s('sectionTitle')}>Identity</h2>
          <div className={s('fieldGrid')}>
            <div className={s('field')}>
              <label htmlFor="title">Title<span className={s('required')}>*</span></label>
              <input id="title" value={form.title} onChange={e => updateField('title', e.target.value)} required placeholder="Product title" />
            </div>
            <div className={s('field')}>
              <label htmlFor="titleAr">Title (Arabic)</label>
              <input id="titleAr" dir="rtl" value={form.titleAr} onChange={e => updateField('titleAr', e.target.value)} placeholder="عنوان المنتج" />
            </div>
            <div className={s('field')}>
              <label htmlFor="slug">Slug<span className={s('required')}>*</span></label>
              <input id="slug" value={form.slug} onChange={e => updateField('slug', e.target.value)} placeholder="product-slug" />
            </div>
            <div className={s('field')}>
              <label htmlFor="condition">Condition</label>
              <select id="condition" value={form.condition} onChange={e => updateField('condition', e.target.value)}>
                <option value="NEW">New</option>
                <option value="USED">Used</option>
                <option value="REFURBISHED">Refurbished</option>
              </select>
            </div>
          </div>
          <div className={s('fieldGrid')} style={{ marginTop: 14 }}>
            <div className={s('field')}>
              <label htmlFor="description">Description</label>
              <textarea id="description" value={form.description} onChange={e => updateField('description', e.target.value)} rows={3} placeholder="Product description" />
            </div>
            <div className={s('field')}>
              <label htmlFor="descriptionAr">Description (Arabic)</label>
              <textarea id="descriptionAr" dir="rtl" value={form.descriptionAr} onChange={e => updateField('descriptionAr', e.target.value)} rows={3} placeholder="وصف المنتج" />
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Identifiers</h3>
            <div className={s('fieldGrid')}>
              <div className={s('field')}>
                <label htmlFor="gtin">GTIN</label>
                <input id="gtin" value={form.gtin} onChange={e => updateField('gtin', e.target.value)} placeholder="Global Trade Item Number" />
                <span className={s('help')}>Unique across products</span>
              </div>
              <div className={s('field')}>
                <label htmlFor="ean">EAN</label>
                <input id="ean" value={form.ean} onChange={e => updateField('ean', e.target.value)} placeholder="European Article Number" />
                <span className={s('help')}>Unique across products</span>
              </div>
              <div className={s('field')}>
                <label htmlFor="mpn">MPN</label>
                <input id="mpn" value={form.mpn} onChange={e => updateField('mpn', e.target.value)} placeholder="Manufacturer Part Number" />
                <span className={s('help')}>Not unique</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Classification Section ───────────────────────────── */}
        <div className={s('section')}>
          <h2 className={s('sectionTitle')}>Classification</h2>
          <div className={s('fieldGrid')}>
            <div className={s('field')}>
              <label htmlFor="categoryId">Category</label>
              <select id="categoryId" value={form.categoryId} onChange={e => updateField('categoryId', e.target.value)}>
                <option value="">Select category…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className={s('field')}>
              <label htmlFor="brandId">Brand</label>
              <select id="brandId" value={form.brandId} onChange={e => updateField('brandId', e.target.value)}>
                <option value="">Select brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className={s('field')}>
              <label htmlFor="productTypeId">Product Type</label>
              <select
                id="productTypeId"
                value={form.productTypeId}
                onChange={e => {
                  if (hasVariantsOrOffers && mode === 'edit' && form.productTypeId && e.target.value !== form.productTypeId) {
                    setError('Cannot change product type: this product has variants or merchant offers. Remove them first.');
                    return;
                  }
                  updateField('productTypeId', e.target.value);
                  setAttrValues([]);
                  setInitialAttrValues([]);
                }}
              >
                <option value="">Select product type…</option>
                {productTypes.filter(pt => pt.status === 'PUBLISHED').map(pt => <option key={pt.id} value={pt.id}>{pt.name} ({pt.code})</option>)}
              </select>
              {hasVariantsOrOffers && mode === 'edit' && (
                <span className={s('help')} style={{ color: '#b3372f' }}>Cannot change: product has variants/offers</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Attributes Section (P3.5) ────────────────────────── */}
        {typeSchema && (
          <div className={s('section')}>
            <h2 className={s('sectionTitle')}>
              Attributes <span className={s('badge') + ' ' + s('badgeOptional')}>{typeSchema.attributes.length} attributes</span>
            </h2>
            <p className={s('sectionSubtitle')}>From product type: {typeSchema.name}</p>
            {typeSchema.groups.map(group => {
              const groupAttrs = typeSchema.attributes.filter(a => !!a.definition).sort((a, b) => a.displayOrder - b.displayOrder);
              if (groupAttrs.length === 0) return null;
              return (
                <div key={group.id} className={s('attrGroup')}>
                  <div className={s('attrGroupTitle')}>{group.name}</div>
                  <div className={s('fieldGrid')}>
                    {groupAttrs.map(attr => {
                      const def = attr.definition;
                      if (!def) return null;
                      const currentVal = attrValues.find(a => a.attributeDefinitionId === attr.attributeDefinitionId)?.value || '';
                      return renderAttrField(attr.attributeDefinitionId, def.type, def.name, currentVal, attr.isRequired, attr.options || [], (v) => updateAttrValue(attr.attributeDefinitionId, v));
                    })}
                  </div>
                </div>
              );
            })}
            {typeSchema.groups.length === 0 && typeSchema.attributes.filter(a => a.definition).length > 0 && (
              <div className={s('fieldGrid')}>
                {typeSchema.attributes.map(attr => {
                  const def = attr.definition;
                  if (!def) return null;
                  const currentVal = attrValues.find(a => a.attributeDefinitionId === attr.attributeDefinitionId)?.value || '';
                  return renderAttrField(attr.attributeDefinitionId, def.type, def.name, currentVal, attr.isRequired, attr.options || [], (v) => updateAttrValue(attr.attributeDefinitionId, v));
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Variants Section (P3.6, read-only) ───────────────── */}
        <div className={s('section')}>
          <h2 className={s('sectionTitle')}>
            Variants <span className={s('badge') + ' ' + s('badgeOptional')}>Read-only</span>
          </h2>
          {variants.length > 0 ? (
            <table className={s('variantTable')}>
              <thead><tr><th>SKU</th><th>Title</th><th>Active</th></tr></thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={String(v['id'] || i)}>
                    <td>{String(v['sku'] || '—')}</td>
                    <td>{String(v['title'] || '—')}</td>
                    <td>{v['isActive'] === false ? 'Inactive' : 'Active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#5b6b74', fontSize: 13 }}>
              {mode === 'create' ? 'Variants can be added after product creation.' : 'No variants yet.'}
            </p>
          )}
        </div>

        {/* ── Media Section (P3.7) ─────────────────────────────── */}
        <div className={s('section')}>
          <h2 className={s('sectionTitle')}>Media</h2>
          {media.length > 0 ? (
            <div className={s('mediaGrid')}>
              {[...media].sort((a, b) => a.sortOrder - b.sortOrder).map(item => (
                <div key={item.id} className={s('mediaItem')}>
                  {item.mediaType === 'IMAGE' ? (
                    <img src={item.url} alt="" loading="lazy" />
                  ) : (
                    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f9fa', borderRadius: 4 }}>
                      <span style={{ fontSize: 12, color: '#5b6b74' }}>{item.mediaType}</span>
                    </div>
                  )}
                  <div className={s('mediaActions')}>
                    <button type="button" onClick={() => setMedia(prev => prev.filter(m => m.id !== item.id))}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#5b6b74', fontSize: 13 }}>No media attached to this product.</p>
          )}
        </div>

        {/* ── Review Section (P3.8) ────────────────────────────── */}
        <div className={s('section')}>
          <h2 className={s('sectionTitle')}>Review / Publish</h2>
          <div>
            <div className={s('reviewItem')}><span>Title</span><span>{form.title ? '✓' : <span className={s('badge') + ' ' + s('badgeMissing')}>Missing</span>}</span></div>
            <div className={s('reviewItem')}><span>Slug</span><span>{form.slug ? '✓' : <span className={s('badge') + ' ' + s('badgeMissing')}>Missing</span>}</span></div>
            <div className={s('reviewItem')}><span>Category</span><span>{form.categoryId ? '✓' : <span className={s('badge') + ' ' + s('badgeOptional')}>Optional</span>}</span></div>
            <div className={s('reviewItem')}><span>Product Type</span><span>{form.productTypeId ? '✓' : <span className={s('badge') + ' ' + s('badgeOptional')}>Optional</span>}</span></div>
            {typeSchema && typeSchema.attributes.filter(a => a.isRequired).map(attr => {
              const hasValue = attrValues.some(a => a.attributeDefinitionId === attr.attributeDefinitionId && a.value);
              return (
                <div key={attr.attributeDefinitionId} className={s('reviewItem')}>
                  <span>{attr.definition?.name || 'Attribute'} (required)</span>
                  <span>{hasValue ? '✓' : <span className={s('badge') + ' ' + s('badgeMissing')}>Missing</span>}</span>
                </div>
              );
            })}
          </div>
          {mode === 'create' && (
            <div className={s('warningBanner')} style={{ marginTop: 12 }}>
              Product will be created as <strong>DRAFT</strong>. Publishing occurs after creation through moderation.
            </div>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────── */}
        <div className={s('actions')}>
          <button type="button" className={s('btnPrimary')} disabled={saving || !form.title || !form.slug} onClick={handleSave}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create Product' : 'Save Changes'}
          </button>
          <Link href={productId ? `/products/${productId}` : '/products'} className={s('btnSecondary')}>Cancel</Link>
          {isDirty && <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}

// ── Attribute field renderer ───────────────────────────────────

function renderAttrField(
  attrId: string, type: string, label: string, value: string, isRequired: boolean,
  options: Array<{ id: string; value: string; label: string | null }>, onChange: (value: string) => void,
) {
  const lbl = <label htmlFor={`attr-${attrId}`}>{label}{isRequired && <span className={s('required')}>*</span>}</label>;

  if (options.length > 0) {
    return (<div key={attrId} className={s('field')}>{lbl}<select id={`attr-${attrId}`} value={value} onChange={e => onChange(e.target.value)}><option value="">Select…</option>{options.map(o => <option key={o.id} value={o.value}>{o.label || o.value}</option>)}</select></div>);
  }
  if (type === 'BOOLEAN') {
    return (<div key={attrId} className={s('field')}>{lbl}<select id={`attr-${attrId}`} value={value} onChange={e => onChange(e.target.value)}><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></select></div>);
  }
  if (type === 'INTEGER' || type === 'DECIMAL') {
    return (<div key={attrId} className={s('field')}>{lbl}<input id={`attr-${attrId}`} type="number" value={value} onChange={e => onChange(e.target.value)} step={type === 'INTEGER' ? '1' : 'any'} /></div>);
  }
  if (type === 'DATE') {
    return (<div key={attrId} className={s('field')}>{lbl}<input id={`attr-${attrId}`} type="date" value={value} onChange={e => onChange(e.target.value)} /></div>);
  }
  if (type === 'DATETIME') {
    return (<div key={attrId} className={s('field')}>{lbl}<input id={`attr-${attrId}`} type="datetime-local" value={value} onChange={e => onChange(e.target.value)} /></div>);
  }
  if (type === 'LONG_TEXT') {
    return (<div key={attrId} className={s('field')}>{lbl}<textarea id={`attr-${attrId}`} value={value} onChange={e => onChange(e.target.value)} rows={3} /></div>);
  }
  const inputType = type === 'COLOR' ? 'color' : type === 'URL' ? 'url' : 'text';
  return (<div key={attrId} className={s('field')}>{lbl}<input id={`attr-${attrId}`} type={inputType} value={value} onChange={e => onChange(e.target.value)} /></div>);
}
