'use client';

import { useState, useEffect, Fragment, useRef } from 'react';
import { fetchAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory } from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

interface Category {
  id: string;
  name: string;
  nameAr?: string;
  slug: string;
  path: string;
  parentId?: string;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
}

export default function AdminCategoriesPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:categories:write']);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', nameAr: '', parentId: '', isActive: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(v), 300);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await fetchAdminCategories();
      setCategories(data as Category[]);
    } catch {
      setError('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Category name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (editingId) {
        await updateAdminCategory(editingId, {
          name: formData.name,
          nameAr: formData.nameAr || undefined,
          parentId: formData.parentId || null,
          isActive: formData.isActive,
        });
      } else {
        await createAdminCategory({
          name: formData.name,
          nameAr: formData.nameAr || undefined,
          parentId: formData.parentId || undefined,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', nameAr: '', parentId: '', isActive: true });
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (cat: Category) => {
    setFormData({
      name: cat.name,
      nameAr: cat.nameAr || '',
      parentId: cat.parentId || '',
      isActive: cat.isActive,
    });
    setEditingId(cat.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      await deleteAdminCategory(id);
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    }
  };

  const topLevelCategories = categories.filter((c) => {
    if (!c.parentId) {
      const matchesSearch = !searchDebounced || c.name.toLowerCase().includes(searchDebounced.toLowerCase()) || c.slug.toLowerCase().includes(searchDebounced.toLowerCase());
      const matchesActive = !activeFilter || (activeFilter === 'active' ? c.isActive : !c.isActive);
      return matchesSearch && matchesActive;
    }
    return false;
  });
  const getChildren = (parentId: string) => {
    const children = categories.filter((c) => c.parentId === parentId);
    if (!searchDebounced && !activeFilter) return children;
    return children.filter(c => {
      const matchesSearch = !searchDebounced || c.name.toLowerCase().includes(searchDebounced.toLowerCase()) || c.slug.toLowerCase().includes(searchDebounced.toLowerCase());
      const matchesActive = !activeFilter || (activeFilter === 'active' ? c.isActive : !c.isActive);
      return matchesSearch && matchesActive;
    });
  };
  const filteredCount = topLevelCategories.reduce((acc, cat) => acc + 1 + getChildren(cat.id).length, 0);

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
        .tbl-last td { border-bottom: none !important; }
      `}</style>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Category Management</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Organize product categories hierarchically — {searchDebounced || activeFilter ? `${filteredCount} matches` : `${categories.length} total`}</p>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingId(null);
              setFormData({ name: '', nameAr: '', parentId: '', isActive: true });
            }}
            style={{
              padding: '8px 20px',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            {showForm ? 'Cancel' : '+ Add Category'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {!hasAccess && <AccessDenied requiredPerms={['catalog:categories:write']} missingPerms={missingPerms} />}
        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {showForm && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 16 }}>
              {editingId ? 'Edit Category' : 'New Category'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Name (English) *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Beverages"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Name (Arabic)</label>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  placeholder="مثال: المشروبات"
                  style={{ ...inputStyle, direction: 'rtl' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Parent Category</label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">None (Top Level)</option>
                  {topLevelCategories
                    .filter((c) => c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f3340', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  Active
                </label>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  background: submitting ? '#5b6b74' : '#0f3340',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0', fontSize: 14, pointerEvents: 'none' }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search by name or slug..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', boxSizing: 'border-box' as const, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['', 'active', 'inactive'] as const).map(f => (
              <button
                key={f || 'all'}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: activeFilter === f ? '#0f3340' : '#d9e2e6',
                  background: activeFilter === f ? '#0f3340' : '#fff',
                  color: activeFilter === f ? '#fff' : '#5b6b74',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {f || 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading categories...</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Arabic</th>
                  <th style={thStyle}>Path</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Products</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {topLevelCategories.map((cat) => (
                  <Fragment key={cat.id}>
                    <tr className="tbl-row" style={{ borderBottom: '1px solid #eef2f5' }}>
                      <td style={tdStyle}>
                        <b>{cat.name}</b>
                      </td>
                      <td style={{ ...tdStyle, direction: 'rtl', textAlign: 'right' }}>{cat.nameAr || '—'}</td>
                      <td style={tdStyle}>
                        <code style={{ fontSize: 11, background: '#f3f5f6', padding: '2px 6px', borderRadius: 3 }}>{cat.path}</code>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: cat.isActive ? '#d1fae5' : '#fee2e2',
                            color: cat.isActive ? '#065f46' : '#991b1b',
                          }}
                        >
                          {cat.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={tdStyle}>{cat.productCount ?? 0}</td>
                      <td style={tdStyle}>
                        <button onClick={() => handleEdit(cat)} style={actionBtn}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(cat.id)} style={{ ...actionBtn, color: '#991b1b' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {getChildren(cat.id).map((child) => (
                      <tr key={child.id} className="tbl-row" style={{ borderBottom: '1px solid #eef2f5', background: '#fafbfc' }}>
                        <td style={{ ...tdStyle, paddingLeft: 32 }}>└ {child.name}</td>
                        <td style={{ ...tdStyle, direction: 'rtl', textAlign: 'right' }}>{child.nameAr || '—'}</td>
                        <td style={tdStyle}>
                          <code style={{ fontSize: 11, background: '#f3f5f6', padding: '2px 6px', borderRadius: 3 }}>{child.path}</code>
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 600,
                              background: child.isActive ? '#d1fae5' : '#fee2e2',
                              color: child.isActive ? '#065f46' : '#991b1b',
                            }}
                          >
                            {child.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={tdStyle}>{child.productCount ?? 0}</td>
                        <td style={tdStyle}>
                          <button onClick={() => handleEdit(child)} style={actionBtn}>
                            Edit
                          </button>
                          <button onClick={() => handleDelete(child.id)} style={{ ...actionBtn, color: '#991b1b' }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {topLevelCategories.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>
                      No categories yet. Click &quot;Add Category&quot; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#0f3340', marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const tdStyle: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const actionBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#0f3340', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 12 };
