'use client';

import { useState, useEffect } from 'react';
import { fetchAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory } from '../../lib/api';

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', nameAr: '', parentId: '', isActive: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
          parentId: formData.parentId || undefined,
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

  const topLevelCategories = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Category Management</h1>
          <p style={{ color: '#5b6b74', fontSize: 14 }}>Organize product categories hierarchically</p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setFormData({ name: '', nameAr: '', parentId: '', isActive: true });
          }}
          style={{
            padding: '8px 16px',
            background: '#0f3340',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Add Category'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24, marginBottom: 24 }}>
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading categories...</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f0f4f7', borderBottom: '1px solid #d9e2e6' }}>
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
                <>
                  <tr key={cat.id} style={{ borderBottom: '1px solid #eef2f5' }}>
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
                    <tr key={child.id} style={{ borderBottom: '1px solid #eef2f5', background: '#fafbfc' }}>
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
                </>
              ))}
              {topLevelCategories.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>
                    No categories yet. Click "Add Category" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#0f3340', marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };
const thStyle: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.5px' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', color: '#1f2937' };
const actionBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#0f3340', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 12 };
