'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchMyStores, fetchWarehouses, createWarehouse, updateWarehouse, Store, Warehouse } from '../../../lib/api';
import { hasPerm } from '../../../lib/auth';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState, StatusBadge, formatDate } from '../../../components/Shared';
import { PageHeader } from '@scs/ui-kit';

export default function WarehousesPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit = hasPerm('merchant:stores:write');

  const loadWarehouses = useCallback(async (storeId: string) => {
    try {
      const whs = await fetchWarehouses(storeId);
      setWarehouses(whs);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load warehouses');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const selected = pickStore(stores);
        if (!selected) {
          setLoading(false);
          return;
        }
        setStore(selected);
        await loadWarehouses(selected.id);
      } catch (err: any) {
        setError(err.message || 'Failed to load store');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWarehouses]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setStreet('');
    setCity('');
    setZip('');
    setManagerName('');
    setManagerPhone('');
    setFormOpen(false);
  };

  const openEditForm = (wh: Warehouse) => {
    setEditingId(wh.id);
    setName(wh.name);
    const addr = (wh.address || {}) as Record<string, unknown>;
    setStreet(String(addr['street'] ?? ''));
    setCity(String(addr['city'] ?? ''));
    setZip(String(addr['zip'] ?? ''));
    setManagerName(wh.managerName || '');
    setManagerPhone(wh.managerPhone || '');
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!store || !name.trim()) {
      setError('Warehouse name is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    const address: Record<string, string> = {};
    if (street.trim()) address['street'] = street.trim();
    if (city.trim()) address['city'] = city.trim();
    if (zip.trim()) address['zip'] = zip.trim();

    try {
      if (editingId) {
        await updateWarehouse(editingId, {
          name: name.trim(),
          address: Object.keys(address).length > 0 ? address : undefined,
          managerName: managerName.trim() || undefined,
          managerPhone: managerPhone.trim() || undefined,
        });
        setSuccess('Warehouse updated successfully');
      } else {
        await createWarehouse(store.id, {
          name: name.trim(),
          address: Object.keys(address).length > 0 ? address : undefined,
          managerName: managerName.trim() || undefined,
          managerPhone: managerPhone.trim() || undefined,
        });
        setSuccess('Warehouse created successfully');
      }
      await loadWarehouses(store.id);
      resetForm();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save warehouse');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!store) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <nav style={breadcrumb}>
          <Link href="/" style={crumbLink}>Home</Link>
          <span style={crumbSep}>›</span>
          <Link href="/merchant" style={crumbLink}>Merchant</Link>
          <span style={crumbSep}>›</span>
          <span>Warehouses</span>
        </nav>
        <h1 style={h1}>Warehouses</h1>
        <EmptyState
          title="No store found"
          description="You need a store to manage warehouses."
          action={<Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>}
        />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .wh-row { transition: background 0.15s ease; }
        .wh-row:hover { background: #e6f0f5 !important; }
        .wh-row:nth-child(even) { background: #f8fafb; }
        .wh-row:nth-child(even):hover { background: #e6f0f5 !important; }
      `}</style>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <nav style={breadcrumb}>
          <Link href="/" style={crumbLink}>Home</Link>
          <span style={crumbSep}>›</span>
          <Link href="/merchant" style={crumbLink}>Merchant</Link>
          <span style={crumbSep}>›</span>
          <span style={{ color: '#0f3340', fontWeight: 500 }}>Warehouses</span>
        </nav>

        <PageHeader
          title="Warehouses"
          subtitle={`${store.displayName} · ${warehouses.length} warehouse${warehouses.length !== 1 ? 's' : ''}`}
          actions={<StatusBadge status={store.verificationStatus} />}
        />

        <div style={{ padding: '0 28px 48px', background: '#f5f7f9', minHeight: 400 }}>
          {error && <div style={{ marginTop: 20 }}><ErrorBanner message={error} /></div>}
          {success && <div style={successBanner}>{success}</div>}

          {/* Actions */}
          {canEdit && (
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button onClick={() => { resetForm(); setFormOpen(true); }} style={primaryBtn}>
                + Add Warehouse
              </button>
            </div>
          )}

          {/* Form Modal */}
          {formOpen && (
            <div style={{ ...card, marginTop: 20, background: '#f7f9fa', border: '1px solid #b8d4e3' }}>
              <h2 style={sectionTitle}>{editingId ? 'Edit Warehouse' : 'New Warehouse'}</h2>
              <div style={grid}>
                <label style={label}>Warehouse Name *
                  <input type="text" value={name} onChange={e => setName(e.target.value)} style={input} placeholder="e.g. Main Warehouse" aria-label="Warehouse name" />
                </label>
                <label style={label}>Manager Name
                  <input type="text" value={managerName} onChange={e => setManagerName(e.target.value)} style={input} placeholder="Contact person" aria-label="Manager name" />
                </label>
                <label style={label}>Manager Phone
                  <input type="tel" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} style={input} placeholder="+966..." aria-label="Manager phone" />
                </label>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 8, marginTop: 12 }}>Address</div>
              <div style={grid}>
                <label style={label}>Street
                  <input type="text" value={street} onChange={e => setStreet(e.target.value)} style={input} placeholder="Street address" aria-label="Street" />
                </label>
                <label style={label}>City
                  <input type="text" value={city} onChange={e => setCity(e.target.value)} style={input} placeholder="City" aria-label="City" />
                </label>
                <label style={label}>ZIP / Postal Code
                  <input type="text" value={zip} onChange={e => setZip(e.target.value)} style={input} placeholder="ZIP code" aria-label="ZIP code" />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSubmit} disabled={saving || !name.trim()} style={primaryBtn}>
                  {saving ? 'Saving…' : editingId ? 'Update Warehouse' : 'Create Warehouse'}
                </button>
                <button onClick={resetForm} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          )}

          {/* Warehouse List */}
          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>All Warehouses</h2>
            {warehouses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#5b6b74', fontSize: 13 }}>
                No warehouses yet. {canEdit && 'Click "Add Warehouse" to create one.'}
              </div>
            ) : (
              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr style={theadRow}>
                      <th style={th}>Name</th>
                      <th style={th}>Manager</th>
                      <th style={th}>Phone</th>
                      <th style={th}>Address</th>
                      <th style={th}>Status</th>
                      <th style={th}>Created</th>
                      {canEdit && <th style={th}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {warehouses.map(wh => (
                      <tr key={wh.id} className="wh-row" style={tbodyRow}>
                        <td style={{ ...td, fontWeight: 600, color: '#0f3340' }}>{wh.name}</td>
                        <td style={td}>{wh.managerName || '—'}</td>
                        <td style={{ ...td, color: '#5b6b74', fontSize: 12 }}>{wh.managerPhone || '—'}</td>
                        <td style={{ ...td, fontSize: 12, color: '#5b6b74' }}>
                          {(() => { const a = (wh.address || {}) as Record<string, unknown>; return [String(a['street'] ?? ''), String(a['city'] ?? ''), String(a['zip'] ?? '')].filter(Boolean).join(', ') || '—'; })()}
                        </td>
                        <td style={td}><StatusBadge status={wh.status} /></td>
                        <td style={{ ...td, color: '#5b6b74', fontSize: 12 }}>{formatDate(wh.createdAt)}</td>
                        {canEdit && (
                          <td style={td}>
                            <button onClick={() => openEditForm(wh)} style={editBtn} aria-label={`Edit ${wh.name}`}>
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────

const breadcrumb: React.CSSProperties = { padding: '16px 0 0', fontSize: 13, color: '#5b6b74', display: 'flex', alignItems: 'center', gap: 6 };
const crumbLink: React.CSSProperties = { color: '#5b6b74', textDecoration: 'none' };
const crumbSep: React.CSSProperties = { color: '#d9e2e6' };
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24, boxShadow: '0 1px 3px rgba(22,35,43,.04)' };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 8 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937', background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '6px 14px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#e6f0f5', color: '#0f3340', border: '1px solid #b8d4e3', borderRadius: 4, cursor: 'pointer' };
const successBanner: React.CSSProperties = { background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
