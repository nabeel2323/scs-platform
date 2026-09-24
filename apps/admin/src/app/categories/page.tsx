'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminCategory,
  AdminProductTypeSummary,
  fetchAdminCategories,
  fetchCategoryProductTypes,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import CategoryTree from '../../components/CategoryTree';

/**
 * PHASE 10: Category Taxonomy Manager.
 *
 * Two-panel layout:
 * - Left: searchable tree view (CategoryTree) with inline actions
 * - Right: detail panel showing selected category metadata, associated product
 *   types, and governance actions (rename, move, disable/enable, delete)
 */

function CategoriesPageContent() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:categories:write']);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminCategory | null>(null);
  const [productTypes, setProductTypes] = useState<AdminProductTypeSummary[]>([]);
  const [ptLoading, setPtLoading] = useState(false);

  // ── Create dialog state ──────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Rename dialog state ──────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  // ── Move dialog state ────────────────────────────────────────
  const [moving, setMoving] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string>('');
  const [moveBusy, setMoveBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cats = await fetchAdminCategories({ all: true, includeInactive: true });
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (hasAccess) load(); }, [hasAccess, load]);

  // Load product types when selection changes
  useEffect(() => {
    if (!selected) { setProductTypes([]); return; }
    setPtLoading(true);
    fetchCategoryProductTypes(selected.id)
      .then(setProductTypes)
      .catch(() => setProductTypes([]))
      .finally(() => setPtLoading(false));
  }, [selected]);

  const handleSelect = useCallback((cat: AdminCategory) => {
    setSelected(cat);
    setRenaming(false);
    setMoving(false);
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setCreateParentId(parentId);
    setNewName('');
    setNewNameAr('');
    setCreateError('');
    setCreating(true);
  }, []);

  const handleAddRoot = useCallback(() => {
    setCreateParentId(null);
    setNewName('');
    setNewNameAr('');
    setCreateError('');
    setCreating(true);
  }, []);

  const submitCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreateBusy(true);
    setCreateError('');
    try {
      const created = await createAdminCategory({
        name: newName.trim(),
        nameAr: newNameAr.trim() || undefined,
        parentId: createParentId ?? undefined,
      });
      setCreating(false);
      await load();
      setSelected(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setCreateBusy(false);
    }
  }, [newName, newNameAr, createParentId, load]);

  const handleToggleActive = useCallback(async (cat: AdminCategory) => {
    const action = cat.isActive ? 'disable' : 'enable';
    if (!window.confirm(`${action === 'disable' ? 'Disable' : 'Enable'} "${cat.name}"?`)) return;
    try {
      await updateAdminCategory(cat.id, { isActive: !cat.isActive });
      await load();
      setSelected(prev => prev?.id === cat.id ? { ...prev, isActive: !prev.isActive } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} category`);
    }
  }, [load]);

  const handleDelete = useCallback(async (cat: AdminCategory) => {
    if (!window.confirm(`Delete "${cat.name}"? Children become root categories. This cannot be undone.`)) return;
    try {
      await deleteAdminCategory(cat.id);
      if (selected?.id === cat.id) setSelected(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete category');
    }
  }, [selected, load]);

  const submitRename = useCallback(async () => {
    if (!selected || !renameValue.trim()) return;
    setRenameBusy(true);
    try {
      await updateAdminCategory(selected.id, { name: renameValue.trim() });
      setRenaming(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setRenameBusy(false);
    }
  }, [selected, renameValue, load]);

  const submitMove = useCallback(async () => {
    if (!selected) return;
    setMoveBusy(true);
    try {
      await updateAdminCategory(selected.id, { parentId: moveTargetId || null });
      setMoving(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to move');
    } finally {
      setMoveBusy(false);
    }
  }, [selected, moveTargetId, load]);

  // All categories except the selected one and its descendants (for move target)
  const moveTargets = useMemo(() => {
    if (!selected) return categories;
    const excludeIds = new Set<string>();
    const collectDescendants = (parentId: string) => {
      excludeIds.add(parentId);
      for (const c of categories) {
        if (c.parentId === parentId) collectDescendants(c.id);
      }
    };
    collectDescendants(selected.id);
    return categories.filter(c => !excludeIds.has(c.id));
  }, [categories, selected]);

  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:categories:write']} missingPerms={missingPerms} />;

  const parentCategory = selected?.parentId ? categories.find(c => c.id === selected.parentId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f3340', margin: 0 }}>Category Taxonomy</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            {categories.length} categories · {categories.filter(c => c.isActive).length} active
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search categories…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6,
              fontSize: 13, width: 220,
            }}
          />
          <button
            type="button"
            onClick={handleAddRoot}
            style={{
              padding: '6px 16px', background: '#1a5c7a', color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Root Category
          </button>
          <button
            type="button"
            onClick={load}
            style={{
              padding: '6px 12px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
              borderRadius: 6, fontSize: 13, cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '8px 24px', background: '#fef2f2', color: '#b3372f', fontSize: 13, borderBottom: '1px solid #fecaca' }}>
          {error} <button onClick={load} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#b3372f', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Main content: tree + details */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Tree */}
        <div style={{
          width: 380, flexShrink: 0, borderRight: '1px solid #e5e7eb',
          overflow: 'auto', padding: '8px 0',
        }}>
          {loading ? (
            <div style={{ padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Loading categories…</div>
          ) : (
            <CategoryTree
              categories={categories}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
              onAddChild={handleAddChild}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              search={search}
            />
          )}
        </div>

        {/* Right: Details panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>
              Select a category to view details
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              {/* Category header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f3340', margin: 0 }}>{selected.name}</h2>
                <span style={{
                  padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: selected.isActive ? '#d1fae5' : '#fef3c7',
                  color: selected.isActive ? '#1b7a4b' : '#b45309',
                }}>
                  {selected.isActive ? 'Active' : 'Disabled'}
                </span>
              </div>

              {/* Metadata table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 }}>
                <tbody>
                  {[
                    ['ID', selected.id],
                    ['Slug', selected.slug],
                    ['Path', selected.path],
                    ['Arabic Name', selected.nameAr || '—'],
                    ['Parent', parentCategory ? `${parentCategory.name} (${parentCategory.path})` : 'Root (no parent)'],
                    ['Sort Order', String(selected.sortOrder ?? 0)],
                    ['Product Count', String(selected.productCount ?? 0)],
                    ['Created', new Date(selected.createdAt).toLocaleDateString()],
                    ['Updated', selected.updatedAt ? new Date(selected.updatedAt).toLocaleDateString() : '—'],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: '#6b7280', width: '35%' }}>{label}</td>
                      <td style={{ padding: '8px 12px', color: '#1f2937', wordBreak: 'break-all' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Description */}
              {selected.description && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Description</h3>
                  <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, margin: 0 }}>{selected.description}</p>
                </div>
              )}

              {/* Associated Product Types */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Associated Product Types {ptLoading && <span style={{ fontWeight: 400, color: '#9ca3af' }}>(loading…)</span>}
                </h3>
                {productTypes.length === 0 && !ptLoading ? (
                  <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No product types reference this category.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {productTypes.map(pt => (
                      <div key={pt.id} style={{
                        padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb',
                        borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{pt.name}</span>
                          <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>{pt.code} v{pt.version}</span>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: pt.status === 'PUBLISHED' ? '#d1fae5' : '#fef3c7',
                          color: pt.status === 'PUBLISHED' ? '#1b7a4b' : '#92400e',
                        }}>
                          {pt.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Actions</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Rename */}
                  {!renaming ? (
                    <button type="button" onClick={() => { setRenaming(true); setRenameValue(selected.name); }}
                      style={actionBtnStyle('#374151')}>Rename</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                      />
                      <button type="button" onClick={submitRename} disabled={renameBusy || !renameValue.trim()}
                        style={actionBtnStyle('#1b7a4b', true)}>Save</button>
                      <button type="button" onClick={() => setRenaming(false)}
                        style={actionBtnStyle('#6b7280')}>Cancel</button>
                    </div>
                  )}

                  {/* Move */}
                  {!moving ? (
                    <button type="button" onClick={() => { setMoving(true); setMoveTargetId(selected.parentId || ''); }}
                      style={actionBtnStyle('#374151')}>Move</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select
                        value={moveTargetId}
                        onChange={e => setMoveTargetId(e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                      >
                        <option value="">Root (no parent)</option>
                        {moveTargets
                          .filter(c => c.id !== selected.id)
                          .map(c => <option key={c.id} value={c.id}>{c.name} ({c.path})</option>)}
                      </select>
                      <button type="button" onClick={submitMove} disabled={moveBusy}
                        style={actionBtnStyle('#1b7a4b', true)}>Save</button>
                      <button type="button" onClick={() => setMoving(false)}
                        style={actionBtnStyle('#6b7280')}>Cancel</button>
                    </div>
                  )}

                  <button type="button" onClick={() => handleToggleActive(selected)}
                    style={actionBtnStyle(selected.isActive ? '#b45309' : '#1b7a4b')}>
                    {selected.isActive ? 'Disable' : 'Enable'}
                  </button>

                  <button type="button" onClick={() => handleDelete(selected)}
                    style={actionBtnStyle('#b3372f')}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      {creating && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => !createBusy && setCreating(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f3340', margin: '0 0 16px' }}>
              {createParentId ? 'Add Child Category' : 'Add Root Category'}
            </h2>
            {createParentId && (
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                Parent: {categories.find(c => c.id === createParentId)?.name || createParentId}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                Name (English)
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginTop: 4 }}
                  autoFocus
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                Name (Arabic)
                <input
                  type="text"
                  dir="rtl"
                  maxLength={200}
                  value={newNameAr}
                  onChange={e => setNewNameAr(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginTop: 4 }}
                />
              </label>
            </div>
            {createError && (
              <p style={{ color: '#b3372f', fontSize: 12, marginTop: 8 }}>{createError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setCreating(false)} disabled={createBusy}
                style={actionBtnStyle('#6b7280')}>Cancel</button>
              <button type="button" onClick={submitCreate} disabled={createBusy || !newName.trim()}
                style={actionBtnStyle('#1a5c7a', true)}>
                {createBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function actionBtnStyle(color: string, primary = false): React.CSSProperties {
  return {
    padding: '6px 14px',
    background: primary ? color : 'transparent',
    color: primary ? '#fff' : color,
    border: primary ? 'none' : `1px solid ${color}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading categories…</div>}>
      <CategoriesPageContent />
    </Suspense>
  );
}
