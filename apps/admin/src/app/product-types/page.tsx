'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ProductType, ProductTypeSchema, AdminCategory,
  fetchProductTypes, fetchProductTypeSchema, createProductType, publishProductType,
  fetchAdminCategories,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { SkeletonTable } from '@scs/ui-kit';
import DetailDialog from '../../components/DetailDialog';
import styles from '../../components/management.module.css';

/* ── Page ──────────────────────────────────────────────────── */

export default function ProductTypesPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:product-types:manage']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const [types, setTypes] = useState<ProductType[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Dialogs
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ProductType | null>(null);
  const [schema, setSchema] = useState<ProductTypeSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [typeData, catData] = await Promise.all([
        fetchProductTypes({
          categoryId: categoryFilter || undefined,
          status: statusFilter || undefined,
        }),
        fetchAdminCategories(),
      ]);
      setTypes(typeData);
      setCategories(catData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load product types');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => { if (ready && hasAccess) load(); }, [ready, hasAccess, load]);

  // Load schema when a product type is selected
  useEffect(() => {
    if (!selected) { setSchema(null); return; }
    setSchemaLoading(true);
    fetchProductTypeSchema(selected.id)
      .then(setSchema)
      .catch(() => setSchema(null))
      .finally(() => setSchemaLoading(false));
  }, [selected]);

  const handlePublish = async (id: string) => {
    if (!window.confirm('Publish this product type? It will become available for merchants.')) return;
    try {
      await publishProductType(id);
      load();
      if (selected?.id === id) setSelected(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    }
  };

  const categoryById = new Map(categories.map(c => [c.id, c]));

  if (!ready) return <p style={{ padding: 32 }}>Loading…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:product-types:manage']} missingPerms={missingPerms} />;

  return (
    <div className={styles['shell']}>
      <header className={styles['header']}>
        <h1>Product Types</h1>
        <p>{types.length} type{types.length !== 1 ? 's' : ''} — templates defining attributes and variant dimensions for products</p>
      </header>

      <div className={styles['content']}>
        {/* Toolbar */}
        <div className={styles['toolbar']}>
          <label>Category
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Status
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="DEPRECATED">DEPRECATED</option>
            </select>
          </label>
          <button type="button" onClick={load}>Refresh</button>
          <button type="button" onClick={() => setCreating(true)}>Create product type</button>
        </div>

        {error && <div className={styles['error']}>{error} <button type="button" onClick={load} style={{ marginLeft: 8 }}>Retry</button></div>}
        {loading ? <SkeletonTable rows={4} cols={7} /> : (
          <div className={styles['tableWrap']}>
            <table>
              <caption style={{ textAlign: 'left', padding: 12 }}>Product Types — {types.length} results</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Variant Dims</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.map(pt => (
                  <tr key={pt.id} onClick={e => {
                    if (e.target instanceof Element && !e.target.closest('button,a,input,select')) {
                      setSelected(pt);
                    }
                  }}>
                    <td><code style={{ fontSize: 12, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{pt.code}</code></td>
                    <td>
                      {pt.name}
                      {pt.nameAr && <small className={styles['muted']} dir="rtl">{pt.nameAr}</small>}
                    </td>
                    <td>{pt.categoryId ? (categoryById.get(pt.categoryId)?.name ?? pt.categoryId) : '—'}</td>
                    <td>v{pt.version}</td>
                    <td><TypeStatusBadge status={pt.status} /></td>
                    <td>{pt.variantDimensions?.length ?? 0}</td>
                    <td><time dateTime={pt.updatedAt}>{new Date(pt.updatedAt).toLocaleDateString()}</time></td>
                    <td>
                      <div className={styles['actions']}>
                        <button type="button" onClick={() => setSelected(pt)}>View</button>
                        {pt.status === 'DRAFT' && (
                          <button type="button" onClick={() => handlePublish(pt.id)}>Publish</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!types.length && <tr><td colSpan={8}>No product types found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Create dialog */}
        {creating && (
          <DetailDialog title="New Product Type" onClose={() => setCreating(false)}>
            <ProductTypeForm
              categories={categories}
              onDone={() => { setCreating(false); load(); }}
              onCancel={() => setCreating(false)}
            />
          </DetailDialog>
        )}

        {/* Detail / schema dialog */}
        {selected && (
          <DetailDialog title={`Product Type — ${selected.name}`} onClose={() => setSelected(null)}>
            {schemaLoading ? <p role="status">Loading schema…</p> : (
              <ProductTypeDetail
                productType={selected}
                schema={schema}
                categories={categories}
                onPublish={() => handlePublish(selected.id)}
              />
            )}
          </DetailDialog>
        )}
      </div>
    </div>
  );
}

/* ── Badges ────────────────────────────────────────────────── */

function TypeStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: '#fef3c7', fg: '#92400e' },
    PUBLISHED: { bg: '#dcfce7', fg: '#166534' },
    DEPRECATED: { bg: '#fee2e2', fg: '#991b1b' },
  };
  const c = colors[status] ?? colors['DRAFT']!;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}

/* ── Scope badges for attribute display ────────────────────── */

function ScopeTag({ scope }: { scope: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    PRODUCT: { bg: '#e0f2fe', fg: '#0369a1' },
    VARIANT: { bg: '#fef3c7', fg: '#92400e' },
    OFFER: { bg: '#ede9fe', fg: '#5b21b6' },
  };
  const c = colors[scope] ?? { bg: '#f0f4f6', fg: '#16232b' };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: c.bg, color: c.fg }}>
      {scope}
    </span>
  );
}

/* ── Create Form ───────────────────────────────────────────── */

function ProductTypeForm({ categories, onDone, onCancel }: {
  categories: AdminCategory[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!code.trim()) { setFormError('Code is required'); return; }
    if (!name.trim()) { setFormError('Name is required'); return; }
    setBusy(true);
    setFormError(null);
    try {
      await createProductType({
        code: code.trim(),
        name: name.trim(),
        nameAr: nameAr || undefined,
        description: description || undefined,
        categoryId: categoryId || null,
      });
      onDone();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create product type');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {formError && <div className={styles['error']}>{formError}</div>}
      <div className={styles['fields']}>
        <div>
          <dt>Code *</dt>
          <dd>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. laptop" maxLength={100} />
            <small className={styles['muted']}>Unique identifier. Use snake_case.</small>
          </dd>
        </div>
        <div>
          <dt>Name *</dt>
          <dd><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Laptop" maxLength={200} /></dd>
        </div>
        <div>
          <dt>Name (Arabic)</dt>
          <dd><input value={nameAr} onChange={e => setNameAr(e.target.value)} dir="rtl" placeholder="مثال: حاسوب محمول" maxLength={200} /></dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">— None —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={1000} /></dd>
        </div>
      </div>
      <div className={styles['actions']} style={{ marginTop: 20 }}>
        <button type="button" disabled={busy} onClick={handleSave}>
          {busy ? 'Creating…' : 'Create Draft'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Detail View ───────────────────────────────────────────── */

function ProductTypeDetail({ productType, schema, categories, onPublish }: {
  productType: ProductType;
  schema: ProductTypeSchema | null;
  categories: AdminCategory[];
  onPublish: () => void;
}) {
  const pt = productType;
  const category = categories.find(c => c.id === pt.categoryId);

  return (
    <div>
      {/* Metadata */}
      <div className={styles['fields']}>
        <div>
          <dt>ID</dt>
          <dd><code style={{ fontSize: 12 }}>{pt.id}</code></dd>
        </div>
        <div>
          <dt>Code</dt>
          <dd><code style={{ fontSize: 12 }}>{pt.code}</code></dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{pt.name}</dd>
        </div>
        <div>
          <dt>Name (Arabic)</dt>
          <dd dir="rtl">{pt.nameAr ?? '—'}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{category?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>v{pt.version}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd><TypeStatusBadge status={pt.status} /></dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{pt.publishedAt ? <time dateTime={pt.publishedAt}>{new Date(pt.publishedAt).toLocaleString()}</time> : '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd><time dateTime={pt.createdAt}>{new Date(pt.createdAt).toLocaleString()}</time></dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{pt.description ?? '—'}</dd>
        </div>
      </div>

      {/* Variant Dimensions */}
      {pt.variantDimensions && pt.variantDimensions.length > 0 && (
        <div style={{ margin: '16px 0' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Variant Dimensions</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pt.variantDimensions.map(dim => (
              <span key={dim} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 6,
                background: '#fef3c7', color: '#92400e', fontWeight: 500,
              }}>
                {dim}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles['actions']} style={{ margin: '16px 0' }}>
        {pt.status === 'DRAFT' && (
          <button type="button" onClick={onPublish}>Publish</button>
        )}
      </div>

      {/* Schema — attributes assigned to this type */}
      {schema && schema.attributes.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Assigned Attributes ({schema.attributes.length})
          </h3>
          <div className={styles['tableWrap']}>
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Attribute</th>
                  <th scope="col">Type</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Required</th>
                  <th scope="col">Filterable</th>
                  <th scope="col">Comparable</th>
                </tr>
              </thead>
              <tbody>
                {schema.attributes.map((attr, i) => (
                  <tr key={attr.attributeDefinitionId}>
                    <td>{attr.displayOrder ?? i + 1}</td>
                    <td>
                      {attr.definition?.name ?? attr.attributeDefinitionId}
                      {attr.definition?.unit && <small className={styles['muted']}>({attr.definition.unit})</small>}
                    </td>
                    <td>{attr.definition?.type ?? '—'}</td>
                    <td>{attr.definition?.scope ? <ScopeTag scope={attr.definition.scope} /> : '—'}</td>
                    <td>{attr.isRequired ? 'Yes' : 'No'}</td>
                    <td>{attr.isFilterable ? 'Yes' : 'No'}</td>
                    <td>{attr.isComparable ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {schema && schema.groups.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Attribute Groups ({schema.groups.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {schema.groups.map(g => (
              <span key={g.id} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 6,
                background: '#e0f2fe', color: '#0369a1', fontWeight: 500,
              }}>
                {g.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
