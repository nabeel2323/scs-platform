'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchStoreProducts, deleteProduct,
  fetchStoreCategories, createCategory, updateCategory, deleteCategory,
  Product, Category,
} from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';

type Tab = 'products' | 'categories';

export default function MerchantCatalogPage() {
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [noStore, setNoStore] = useState(false);
  const [tab, setTab] = useState<Tab>('products');
  const [error, setError] = useState('');

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [pLoading, setPLoading] = useState(true);

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [cLoading, setCLoading] = useState(true);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catEditId, setCatEditId] = useState('');
  const [catName, setCatName] = useState('');
  const [catNameAr, setCatNameAr] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  const loadProducts = useCallback(async (sid: string) => {
    setPLoading(true);
    try {
      const data = await fetchStoreProducts(sid, { limit: 200 });
      setProducts(data.items as Product[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setPLoading(false);
    }
  }, []);

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
                {storeName ? `${storeName} — ` : ''}{products.length} products · {categories.length} categories
              </p>
            </div>
            {tab === 'products' && storeId && (
              <Link href={`/merchant/catalog/product/new?storeId=${storeId}`} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>+ New Product</Link>
            )}
            {tab === 'categories' && (
              <button onClick={openNewCategory} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Category</button>
            )}
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
        pLoading ? <LoadingSpinner /> : products.length === 0 ? (
          <EmptyState title="No products yet" description="Create your first product to start selling." />
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr style={theadRow}>
                  <th style={th}>Product</th>
                  <th style={th}>Status</th>
                  <th style={th}>Available</th>
                  <th style={th}>MOQ</th>
                  <th style={th}>Created</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} style={tbodyRow}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: '#0f3340' }}>{p.title}</span>
                      {p.titleAr && <span style={{ color: '#5b6b74', marginLeft: 8, fontSize: 12 }}>{p.titleAr}</span>}
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
                ))}
              </tbody>
            </table>
          </div>
        )
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
                  {categories.map(c => (
                    <tr key={c.id} style={tbodyRow}>
                      <td style={td}><span style={{ fontWeight: 600, color: '#0f3340' }}>{c.name}</span></td>
                      <td style={td} >{c.nameAr || '—'}</td>
                      <td style={td}><code style={{ fontSize: 12, color: '#5b6b74' }}>{c.slug}</code></td>
                      <td style={td}>{c.productCount}</td>
                      <td style={td}>{c.isActive ? '✓' : '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditCategory(c)} style={editBtn}>Edit</button>
                          <button onClick={() => handleDeleteCategory(c)} style={deleteBtn}>Delete</button>
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

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
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
