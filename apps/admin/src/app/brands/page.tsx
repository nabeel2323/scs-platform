'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EnrichedBrand,
  fetchAdminBrandsEnriched,
  createAdminBrand,
  updateAdminBrand,
} from '../../lib/api';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

/* ── Styles (inline, matching management.module.css tokens) ─── */
const css = {
  shell: { color: '#16232b', fontSize: 14 } as React.CSSProperties,
  header: { padding: '30px 36px', background: 'linear-gradient(135deg,#0c2831,#1e6178)', color: 'white' } as React.CSSProperties,
  headerH1: { margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: -0.2 } as React.CSSProperties,
  headerP: { margin: 0, opacity: 0.7, fontSize: 13 } as React.CSSProperties,
  content: { padding: '24px 32px 48px' } as React.CSSProperties,
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12, margin: '16px 0' } as React.CSSProperties,
  input: { padding: '9px 11px', font: 'inherit', border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#16232b', maxWidth: '100%' } as React.CSSProperties,
  btn: { padding: '8px 14px', font: 'inherit', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer', color: '#0f3340', background: '#fff', fontWeight: 500 } as React.CSSProperties,
  btnPrimary: { padding: '8px 14px', font: 'inherit', border: '1px solid #1e6178', borderRadius: 6, cursor: 'pointer', color: '#fff', background: '#1e6178', fontWeight: 600 } as React.CSSProperties,
  btnDanger: { padding: '8px 14px', font: 'inherit', border: '1px solid #c4413a', borderRadius: 6, cursor: 'pointer', color: '#fff', background: '#c4413a', fontWeight: 500 } as React.CSSProperties,
  tableWrap: { overflowX: 'auto', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' } as React.CSSProperties,
  th: { background: '#103744', color: '#fff', padding: 12, textAlign: 'left' as const, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, zIndex: 2 } as React.CSSProperties,
  td: { padding: '13px 12px', borderBottom: '1px solid #e5ecf0', maxWidth: 300, overflowWrap: 'anywhere' as const, minWidth: 85 } as React.CSSProperties,
  error: { padding: 12, color: '#991b1b', background: '#fbeeec', borderRadius: 6, margin: '12px 0', fontSize: 13 } as React.CSSProperties,
  dialog: { border: '1px solid #d9e2e6', borderRadius: 14, padding: 24, width: 'min(560px, 92vw)', maxHeight: '88vh', overflow: 'auto', color: '#16232b', boxShadow: '0 20px 80px rgba(0,0,0,0.25)' } as React.CSSProperties,
  dialogHeader: { display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 18, marginBottom: 20 } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 12, fontWeight: 600, color: '#16232b' } as React.CSSProperties,
  badge: (bg: string, fg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color: fg }) as React.CSSProperties,
  logo: { width: 40, height: 40, objectFit: 'contain' as const, borderRadius: 6, border: '1px solid #d9e2e6', background: '#f7f9fa' } as React.CSSProperties,
  logoPlaceholder: { width: 40, height: 40, borderRadius: 6, border: '1px solid #d9e2e6', background: '#f7f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#5b6b74' } as React.CSSProperties,
};

/* ── Filters ─────────────────────────────────────────────────── */
type StatusFilter = 'active' | 'inactive' | 'all';

function BrandsPageContent() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:brands:manage']);
  const [brands, setBrands] = useState<EnrichedBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<EnrichedBrand | null>(null);
  const [deleting, setDeleting] = useState<EnrichedBrand | null>(null);
  const [actionError, setActionError] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminBrandsEnriched(statusFilter !== 'active');
      setBrands(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void reload(); }, [reload]);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchRef.current);
  }, [search]);

  // Filter
  const filtered = useMemo(() => {
    let list = brands;
    if (statusFilter === 'active') list = list.filter(b => b.isActive);
    else if (statusFilter === 'inactive') list = list.filter(b => !b.isActive);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.nameAr ?? '').toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        (b.description ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [brands, statusFilter, debouncedSearch]);

  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:brands:manage']} missingPerms={missingPerms} />;

  return (
    <div style={css.shell}>
      {/* Header */}
      <div style={css.header}>
        <h1 style={css.headerH1}>Brand Management</h1>
        <p style={css.headerP}>Manage brands, view product/merchant counts, and prepare for verification workflows</p>
      </div>

      <div style={css.content}>
        {error && <div style={css.error}>{error}</div>}
        {actionError && <div style={css.error}>{actionError}</div>}

        {/* Toolbar */}
        <div style={css.toolbar}>
          <label style={css.label}>
            Search
            <input
              style={{ ...css.input, width: 240 }}
              placeholder="Search brands…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          <label style={css.label}>
            Status
            <select style={css.input} value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="all">All</option>
            </select>
          </label>
          <button style={css.btnPrimary} onClick={() => setShowCreate(true)}>+ Create Brand</button>
        </div>

        <p style={{ fontSize: 12, color: '#5b6b74', margin: '8px 0' }}>
          Showing {filtered.length} of {brands.length} brands
        </p>

        {/* Table */}
        <div style={css.tableWrap}>
          <table>
            <thead>
              <tr>
                <th style={css.th}>Logo</th>
                <th style={css.th}>Name</th>
                <th style={css.th}>Arabic</th>
                <th style={css.th}>Slug</th>
                <th style={css.th}>Status</th>
                <th style={css.th}>Products</th>
                <th style={css.th}>Merchants</th>
                <th style={css.th}>Verification</th>
                <th style={css.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...css.td, textAlign: 'center', color: '#5b6b74' }}>Loading brands…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ ...css.td, textAlign: 'center', color: '#5b6b74' }}>No brands found</td></tr>
              ) : (
                filtered.map(b => (
                  <tr key={b.id}>
                    <td style={css.td}>
                      {b.logoUrl ? (
                        <img src={b.logoUrl} alt={b.name} style={css.logo} />
                      ) : (
                        <div style={css.logoPlaceholder}>🏷</div>
                      )}
                    </td>
                    <td style={css.td}>
                      <strong>{b.name}</strong>
                    </td>
                    <td style={css.td} dir="rtl">
                      {b.nameAr ?? '—'}
                    </td>
                    <td style={css.td}>
                      <code style={{ fontSize: 12, background: '#f7f9fa', padding: '2px 6px', borderRadius: 4 }}>{b.slug}</code>
                    </td>
                    <td style={css.td}>
                      {b.isActive
                        ? <span style={css.badge('#eaf5ef', '#1b7a4b')}>Active</span>
                        : <span style={css.badge('#fbeeec', '#991b1b')}>Inactive</span>}
                    </td>
                    <td style={css.td}>
                      <span style={{ fontWeight: 600 }}>{b.productCount}</span>
                    </td>
                    <td style={css.td}>
                      <span style={{ fontWeight: 600 }}>{b.merchantCount}</span>
                    </td>
                    <td style={css.td}>
                      {/* PHASE 11: UI hook for future brand verification */}
                      <span style={css.badge('#f7f9fa', '#5b6b74')}>—</span>
                    </td>
                    <td style={css.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={css.btn} onClick={() => setEditing(b)}>Edit</button>
                        <button
                          style={b.isActive ? css.btnDanger : css.btn}
                          onClick={() => setDeleting(b)}
                        >
                          {b.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <CreateBrandDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void reload(); }}
          onError={setActionError}
        />
      )}

      {/* Edit Dialog */}
      {editing && (
        <EditBrandDialog
          brand={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => { setEditing(null); void reload(); }}
          onError={setActionError}
        />
      )}

      {/* Delete/Disable Dialog */}
      {deleting && (
        <DisableBrandDialog
          brand={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); void reload(); }}
          onError={setActionError}
        />
      )}
    </div>
  );
}

/* ── Create Dialog ───────────────────────────────────────────── */
function CreateBrandDialog({ onClose, onCreated, onError }: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createAdminBrand({
        name: name.trim(),
        nameAr: nameAr.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        description: description.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create brand');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog open style={css.dialog} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={css.dialogHeader}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Create Brand</h2>
        <button style={css.btn} onClick={onClose}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={css.label}>
            Name (English) *
            <input style={css.input} value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </label>
          <label style={css.label}>
            Name (Arabic)
            <input style={css.input} dir="rtl" value={nameAr} onChange={e => setNameAr(e.target.value)} />
          </label>
          <label style={css.label}>
            Logo URL
            <input style={css.input} type="url" placeholder="https://..." value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
          </label>
          <label style={css.label}>
            Description
            <textarea style={{ ...css.input, minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={css.btn} onClick={onClose}>Cancel</button>
            <button type="submit" style={css.btnPrimary} disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create Brand'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

/* ── Edit Dialog ─────────────────────────────────────────────── */
function EditBrandDialog({ brand, onClose, onUpdated, onError }: {
  brand: EnrichedBrand;
  onClose: () => void;
  onUpdated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(brand.name);
  const [nameAr, setNameAr] = useState(brand.nameAr ?? '');
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl ?? '');
  const [description, setDescription] = useState(brand.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateAdminBrand(brand.id, {
        name: name.trim(),
        nameAr: nameAr.trim() || null,
        logoUrl: logoUrl.trim() || null,
        description: description.trim() || null,
      } as any);
      onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update brand');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog open style={css.dialog} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={css.dialogHeader}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Edit Brand: {brand.name}</h2>
        <button style={css.btn} onClick={onClose}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={css.label}>
            Name (English) *
            <input style={css.input} value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </label>
          <label style={css.label}>
            Name (Arabic)
            <input style={css.input} dir="rtl" value={nameAr} onChange={e => setNameAr(e.target.value)} />
          </label>
          <label style={css.label}>
            Logo URL
            <input style={css.input} type="url" placeholder="https://..." value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
          </label>
          <label style={css.label}>
            Description
            <textarea style={{ ...css.input, minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div style={{ fontSize: 12, color: '#5b6b74', marginTop: 4 }}>
            <strong>Slug:</strong> <code>{brand.slug}</code> · <strong>Products:</strong> {brand.productCount} · <strong>Merchants:</strong> {brand.merchantCount}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={css.btn} onClick={onClose}>Cancel</button>
            <button type="submit" style={css.btnPrimary} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

/* ── Disable/Enable Dialog ───────────────────────────────────── */
function DisableBrandDialog({ brand, onClose, onDone, onError }: {
  brand: EnrichedBrand;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const isDisabling = brand.isActive;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      if (isDisabling) {
        await updateAdminBrand(brand.id, { isActive: false } as any);
      } else {
        await updateAdminBrand(brand.id, { isActive: true } as any);
      }
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update brand');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog open style={css.dialog} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={css.dialogHeader}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          {isDisabling ? 'Disable' : 'Enable'} Brand
        </h2>
        <button style={css.btn} onClick={onClose}>✕</button>
      </div>
      <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
        {isDisabling
          ? <>Are you sure you want to disable <strong>{brand.name}</strong>? It has {brand.productCount} products across {brand.merchantCount} merchants. Disabling will hide it from buyers.</>
          : <>Enable <strong>{brand.name}</strong> so it appears in buyer-facing listings again.</>}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={css.btn} onClick={onClose}>Cancel</button>
        <button
          style={isDisabling ? css.btnDanger : css.btnPrimary}
          disabled={saving}
          onClick={handleConfirm}
        >
          {saving ? 'Processing…' : isDisabling ? 'Disable Brand' : 'Enable Brand'}
        </button>
      </div>
    </dialog>
  );
}

/* ── Default Export with Suspense ────────────────────────────── */
export default function BrandsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading brands…</div>}>
      <BrandsPageContent />
    </Suspense>
  );
}
