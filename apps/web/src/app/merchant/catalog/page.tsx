'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  fetchStoreProducts, deleteProduct, bulkProductAction, exportProductsCsv,
  fetchStoreCategories, createCategory, updateCategory, deleteCategory,
  Product, Category,
} from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState, productImageSrc } from '../../../components/Shared';

type Tab = 'products' | 'categories';
const PAGE_SIZE = 20;

export default function MerchantCatalogPage() {
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [noStore, setNoStore] = useState(false);
  const [tab, setTab] = useState<Tab>('products');
  const [error, setError] = useState('');

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pLoading, setPLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [cLoading, setCLoading] = useState(true);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catEditId, setCatEditId] = useState('');
  const [catName, setCatName] = useState('');
  const [catNameAr, setCatNameAr] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  const loadProducts = useCallback(async (sid: string, off = 0, append = false) => {
    setPLoading(true);
    try {
      const data = await fetchStoreProducts(sid, {
        status: statusFilter || undefined,
        categoryId: categoryFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: off,
      });
      const items = data.items as Product[];
      setProducts(prev => append ? [...prev, ...items] : items);
      setTotal(data.total);
      setOffset(off + items.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setPLoading(false);
    }
  }, [statusFilter, categoryFilter, search]);

  const loadCategories = useCallback(async (sid: string) => {
    setCLoading(true);
    try {
      const data = await fetchStoreCategories(sid);
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setCLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (!s) { setNoStore(true); setPLoading(false); setCLoading(false); return; }
        setStoreId(s.id);
        setStoreName(s.displayName);
        await Promise.all([loadProducts(s.id), loadCategories(s.id)]);
      } catch (err: any) {
        setError(err.message || 'Failed to resolve store');
        setPLoading(false);
        setCLoading(false);
      }
    })();
  }, [loadProducts, loadCategories]);

  // Debounced search: reload products when search changes
  useEffect(() => {
    if (!storeId) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSelected(new Set());
      loadProducts(storeId, 0);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [search, statusFilter, categoryFilter, storeId, loadProducts]);

  const handleDeleteProduct = async (id: string, title: string) => {
    if (!window.confirm(`Delete product "${title}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteProduct(id);
      await loadProducts(storeId);
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  // Bulk selection
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  };

  const handleBulkAction = async (action: 'delete' | 'archive' | 'draft') => {
    if (selected.size === 0) return;
    const label = action === 'delete' ? 'delete' : action === 'archive' ? 'archive' : 'set to draft';
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${selected.size} selected product(s)?`)) return;
    setBulkLoading(true);
    setError('');
    try {
      await bulkProductAction(storeId, { ids: Array.from(selected), action });
      setSelected(new Set());
      await loadProducts(storeId);
    } catch (err: any) {
      setError(err.message || `Bulk ${label} failed`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExport = async () => {
    setError('');
    try {
      const csv = await exportProductsCsv(storeId);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-${storeId}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    }
  };

  const loadMore = () => {
    if (storeId) loadProducts(storeId, offset, true);
  };

  const openNewCategory = () => {
    setCatEditId('');
    setCatName('');
    setCatNameAr('');
    setCatDescription('');
    setCatFormOpen(true);
  };

  const openEditCategory = (c: Category) => {
    setCatEditId(c.id);
    setCatName(c.name);
    setCatNameAr(c.nameAr || '');
    setCatDescription('');
    setCatFormOpen(true);
  };

  const resetCatForm = () => {
    setCatFormOpen(false);
    setCatEditId('');
    setCatName('');
    setCatNameAr('');
    setCatDescription('');
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    setCatSaving(true);
    setError('');
    try {
      if (catEditId) {
        await updateCategory(catEditId, {
          name: catName.trim(),
          nameAr: catNameAr.trim() || undefined,
          description: catDescription.trim() || undefined,
        });
      } else {
        await createCategory({
          storeId,
          name: catName.trim(),
          nameAr: catNameAr.trim() || undefined,
          description: catDescription.trim() || undefined,
        });
      }
      resetCatForm();
      await loadCategories(storeId);
    } catch (err: any) {
      setError(err.message || 'Save category failed');
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (c: Category) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    setError('');
    try {
      await deleteCategory(c.id);
      await loadCategories(storeId);
    } catch (err: any) {
      setError(err.message || 'Delete category failed');
    }
  };

  if (noStore) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Product Catalog</h1>
        <EmptyState
          title="No store yet"
          description="Create a store to start managing your catalog."
          action={<Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>}
        />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header Banner */}
        <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Product Catalog</h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
                {storeName ? `${storeName} — ` : ''}{total} products · {categories.length} categories
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tab === 'products' && storeId && (
                <>
                  <button onClick={handleExport} style={headerBtn}>Export CSV</button>
                  <Link href={`/merchant/catalog/product/new?storeId=${storeId}`} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>+ New Product</Link>
                </>
              )}
              {tab === 'categories' && (
                <button onClick={openNewCategory} style={headerBtn}>+ New Category</button>
              )}
            </div>
          </div>
        </div>
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} onRetry={() => storeId && (tab === 'products' ? loadProducts(storeId) : loadCategories(storeId))} />}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
        <button onClick={() => setTab('products')} style={tab === 'products' ? tabActive : tabIdle}>Products</button>
        <button onClick={() => setTab('categories')} style={tab === 'categories' ? tabActive : tabIdle}>Categories</button>
      </div>

      {tab === 'products' ? (
        <>
          {/* Search & Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...input, flex: '1 1 220px', minWidth: 180 }}
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...input, minWidth: 130 }}>
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="REJECTED">Rejected</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...input, minWidth: 150 }}>
              <option value="">All Categories</option>
              {buildCategoryTree(categories).map(({ cat, depth }) => (
                <option key={cat.id} value={cat.id}>{'  '.repeat(depth)}{depth > 0 ? '└ ' : ''}{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12, background: '#eef4f7', border: '1px solid #c5d8e0', borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>{selected.size} selected</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button onClick={() => handleBulkAction('draft')} disabled={bulkLoading} style={bulkBtn}>Set Draft</button>
                <button onClick={() => handleBulkAction('archive')} disabled={bulkLoading} style={bulkBtn}>Archive</button>
                <button onClick={() => handleBulkAction('delete')} disabled={bulkLoading} style={{ ...bulkBtn, color: '#991b1b', borderColor: '#fca5a5' }}>Delete</button>
              </div>
            </div>
          )}

          {pLoading && products.length === 0 ? <LoadingSpinner /> : products.length === 0 ? (
            <EmptyState title="No products found" description={search || statusFilter || categoryFilter ? 'Try adjusting your filters.' : 'Create your first product to start selling.'} />
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#5b6b74', marginBottom: 8 }}>
                Showing {products.length} of {total} products
              </div>
              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr style={theadRow}>
                      <th style={{ ...th, width: 36 }}>
                        <input type="checkbox" checked={products.length > 0 && selected.size === products.length} onChange={toggleSelectAll} />
                      </th>
                      <th style={th}>Product</th>
                      <th style={th}>Status</th>
                      <th style={th}>Available</th>
                      <th style={th}>MOQ</th>
                      <th style={th}>Created</th>
                      <th style={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const imgSrc = productImageSrc(p.images);
                      return (
                        <tr key={p.id} className="tbl-row" style={tbodyRow}>
                          <td style={td}>
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {imgSrc ? (
                                <img src={imgSrc} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#f0f0f0' }} />
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#94a3b8', flexShrink: 0 }}>📦</div>
                              )}
                              <div>
                                <span style={{ fontWeight: 600, color: '#0f3340' }}>{p.title}</span>
                                {p.titleAr && <span style={{ color: '#5b6b74', marginLeft: 8, fontSize: 12 }}>{p.titleAr}</span>}
                              </div>
                            </div>
                          </td>
                          <td style={td}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${statusColor(p.status)}18`, color: statusColor(p.status), fontWeight: 600 }}>
                              {p.status}
                            </span>
                          </td>
                          <td style={td}>{p.isAvailable ? '✓' : '—'}</td>
                          <td style={td}>{p.moq}</td>
                          <td style={td}>{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td style={td}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Link href={`/merchant/catalog/product/${p.id}`} style={editBtn}>Edit</Link>
                              <button onClick={() => handleDeleteProduct(p.id, p.title)} style={deleteBtn}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {products.length < total && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button onClick={loadMore} disabled={pLoading} style={ghostBtn}>
                    {pLoading ? 'Loading…' : `Load More (${total - products.length} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {catFormOpen && (
            <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>
                {catEditId ? 'Edit Category' : 'New Category'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                <input type="text" placeholder="Name (English) *" value={catName} onChange={e => setCatName(e.target.value)} style={input} />
                <input type="text" placeholder="Name (Arabic)" value={catNameAr} onChange={e => setCatNameAr(e.target.value)} style={input} dir="rtl" />
                <input type="text" placeholder="Description" value={catDescription} onChange={e => setCatDescription(e.target.value)} style={input} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveCategory} disabled={catSaving || !catName.trim()} style={primaryBtn}>
                  {catSaving ? 'Saving…' : catEditId ? 'Save Changes' : 'Create Category'}
                </button>
                <button onClick={resetCatForm} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          )}

          {cLoading ? <LoadingSpinner /> : categories.length === 0 ? (
            <EmptyState title="No categories yet" description="Create categories to organize your catalog." />
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>Name</th>
                    <th style={th}>Arabic</th>
                    <th style={th}>Slug</th>
                    <th style={th}>Products</th>
                    <th style={th}>Active</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {buildCategoryTree(categories).map(({ cat, depth }) => (
                    <tr key={cat.id} className="tbl-row" style={tbodyRow}>
                      <td style={td}>
                        <span style={{ paddingLeft: depth * 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {depth > 0 && <span style={{ color: '#94a3b8', fontSize: 11 }}>└</span>}
                          <span style={{ fontWeight: 600, color: '#0f3340' }}>{cat.name}</span>
                        </span>
                        {depth > 0 && (
                          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: depth * 20 + 8 }}>
                            {cat.path.split('/').filter(Boolean).slice(0, -1).join(' > ')}
                          </span>
                        )}
                      </td>
                      <td style={td}>{cat.nameAr || '—'}</td>
                      <td style={td}><code style={{ fontSize: 12, color: '#5b6b74' }}>{cat.slug}</code></td>
                      <td style={td}>{cat.productCount}</td>
                      <td style={td}>{cat.isActive ? '✓' : '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditCategory(cat)} style={editBtn}>Edit</button>
                          <button onClick={() => handleDeleteCategory(cat)} style={deleteBtn}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
        </div>
      </div>
    </>
  );
}

function statusColor(s: string): string {
  const map: Record<string, string> = { DRAFT: '#92400e', ACTIVE: '#065f46', REJECTED: '#991b1b', ARCHIVED: '#5b6b74' };
  return map[s] || '#5b6b74';
}

/** Build a flat list of categories sorted by path for tree display, with depth info. */
function buildCategoryTree(cats: Category[]): Array<{ cat: Category; depth: number }> {
  return [...cats]
    .map(cat => {
      const segments = (cat.path || '').split('/').filter(Boolean);
      const depth = Math.max(0, segments.length - 1);
      return { cat, depth };
    })
    .sort((a, b) => (a.cat.path || '').localeCompare(b.cat.path || ''));
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const headerBtn: React.CSSProperties = { padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const bulkBtn: React.CSSProperties = { padding: '4px 12px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#0f3340', border: '1px solid #c5d8e0', borderRadius: 4, cursor: 'pointer' };
const tabActive: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: '1px solid #0f3340', borderRadius: 6, cursor: 'pointer' };
const tabIdle: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13 };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer', textDecoration: 'none' };
const deleteBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' };
