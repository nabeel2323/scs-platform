'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchMyStores, fetchStore, updateStore, createWarehouse, Store } from '../../../lib/api';
import { fetchStoreWarehouses, WarehouseSummary } from '../../../lib/buyer-api';
import { LoadingSpinner, ErrorBanner, EmptyState, StatusBadge } from '../../../components/Shared';

const CURRENCIES = ['SAR', 'USD', 'AED', 'EUR', 'GBP'];
const LOCALES = [['en', 'English'], ['ar', 'Arabic']] as const;

export default function StoreProfilePage() {
  const [store, setStore] = useState<Store | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [locale, setLocale] = useState('en');
  const [timezone, setTimezone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');

  // Warehouses
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [whFormOpen, setWhFormOpen] = useState(false);
  const [whName, setWhName] = useState('');
  const [whManager, setWhManager] = useState('');
  const [whPhone, setWhPhone] = useState('');
  const [whSaving, setWhSaving] = useState(false);

  const loadWarehouses = useCallback(async (sid: string) => {
    try {
      setWarehouses(await fetchStoreWarehouses(sid));
    } catch { /* non-fatal */ }
  }, []);

  const populate = useCallback((s: Store) => {
    setStore(s);
    setDisplayName(s.displayName || '');
    setDescription(s.description || '');
    setCurrency(s.currency || 'SAR');
    setLocale(s.locale || 'en');
    setTimezone(s.timezone || '');
    setLogoUrl(s.logoUrl || '');
    setCoverUrl(s.coverUrl || '');
    const addr = (s.address || {}) as Record<string, unknown>;
    setCity(String(addr['city'] ?? ''));
    setStreet(String(addr['street'] ?? ''));
    setZip(String(addr['zip'] ?? ''));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const first = stores[0];
        if (!first) { setNoStore(true); return; }
        const full = await fetchStore(first.id);
        populate(full);
        await loadWarehouses(first.id);
      } catch (err: any) {
        setError(err.message || 'Failed to load store');
      } finally {
        setLoading(false);
      }
    })();
  }, [populate, loadWarehouses]);

  const handleSave = async () => {
    if (!store) return;
    if (!displayName.trim()) { setError('Display name is required'); return; }
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const address = { ...(store.address as Record<string, unknown>) };
      if (city.trim()) address['city'] = city.trim(); else delete address['city'];
      if (street.trim()) address['street'] = street.trim(); else delete address['street'];
      if (zip.trim()) address['zip'] = zip.trim(); else delete address['zip'];
      const updated = await updateStore(store.id, {
        displayName: displayName.trim(),
        description: description.trim(),
        currency,
        locale,
        timezone: timezone.trim(),
        logoUrl: logoUrl.trim(),
        coverUrl: coverUrl.trim(),
        address,
      });
      populate(updated);
      setSavedMsg('Store profile saved');
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddWarehouse = async () => {
    if (!store || !whName.trim()) return;
    setWhSaving(true);
    setError('');
    try {
      await createWarehouse(store.id, {
        name: whName.trim(),
        managerName: whManager.trim() || undefined,
        managerPhone: whPhone.trim() || undefined,
      });
      setWhName(''); setWhManager(''); setWhPhone(''); setWhFormOpen(false);
      await loadWarehouses(store.id);
    } catch (err: any) {
      setError(err.message || 'Add warehouse failed');
    } finally {
      setWhSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (noStore || !store) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Store Profile</h1>
        <EmptyState
          title="No store yet"
          description="Onboard a store to manage its profile."
          action={<Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <Link href="/merchant" style={backLink}>← Merchant Dashboard</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 4px', flexWrap: 'wrap' }}>
        <h1 style={{ ...h1, marginBottom: 0 }}>Store Profile</h1>
        <StatusBadge status={store.verificationStatus} />
      </div>
      <p style={{ color: '#5b6b74', fontSize: 13, marginBottom: 20 }}>
        Slug: <code style={{ color: '#0f3340' }}>{store.slug}</code> (read-only)
      </p>

      {error && <ErrorBanner message={error} />}
      {savedMsg && <div style={successBanner}>{savedMsg}</div>}

      <div style={card}>
        <h2 style={sectionTitle}>Details</h2>
        <div style={grid}>
          <label style={label}>Display Name *
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={input} />
          </label>
          <label style={label}>Currency
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={input}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={label}>Locale
            <select value={locale} onChange={e => setLocale(e.target.value)} style={input}>
              {LOCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label style={label}>Timezone
            <input type="text" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Riyadh" style={input} />
          </label>
        </div>
        <label style={label}>Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
        </label>
        <div style={grid}>
          <label style={label}>Logo URL
            <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" style={input} />
          </label>
          <label style={label}>Cover URL
            <input type="text" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://…" style={input} />
          </label>
        </div>

        <h2 style={{ ...sectionTitle, marginTop: 8 }}>Address</h2>
        <div style={grid}>
          <label style={label}>City
            <input type="text" value={city} onChange={e => setCity(e.target.value)} style={input} />
          </label>
          <label style={label}>Street
            <input type="text" value={street} onChange={e => setStreet(e.target.value)} style={input} />
          </label>
          <label style={label}>Postal / ZIP
            <input type="text" value={zip} onChange={e => setZip(e.target.value)} style={input} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleSave} disabled={saving || !displayName.trim()} style={primaryBtn}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Warehouses */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Warehouses ({warehouses.length})</h2>
          <button onClick={() => setWhFormOpen(v => !v)} style={ghostBtn}>{whFormOpen ? 'Close' : '+ Add Warehouse'}</button>
        </div>

        {whFormOpen && (
          <div style={{ background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={grid}>
              <input type="text" placeholder="Warehouse name *" value={whName} onChange={e => setWhName(e.target.value)} style={input} />
              <input type="text" placeholder="Manager name" value={whManager} onChange={e => setWhManager(e.target.value)} style={input} />
              <input type="text" placeholder="Manager phone" value={whPhone} onChange={e => setWhPhone(e.target.value)} style={input} />
            </div>
            <button onClick={handleAddWarehouse} disabled={whSaving || !whName.trim()} style={primaryBtn}>
              {whSaving ? 'Adding…' : 'Create Warehouse'}
            </button>
          </div>
        )}

        {warehouses.length === 0 ? (
          <p style={{ fontSize: 13, color: '#5b6b74' }}>No warehouses yet. Add one to track inventory.</p>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead><tr style={theadRow}>
                <th style={th}>Name</th><th style={th}>Manager</th><th style={th}>Phone</th><th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {warehouses.map(w => (
                  <tr key={w.id} style={tbodyRow}>
                    <td style={td}><span style={{ fontWeight: 600, color: '#0f3340' }}>{w.name}</span></td>
                    <td style={td}>{w.managerName || '—'}</td>
                    <td style={td}>{w.managerPhone || '—'}</td>
                    <td style={td}>{w.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const backLink: React.CSSProperties = { fontSize: 13, color: '#5b6b74', textDecoration: 'none' };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 20 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 8 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937', background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '6px 14px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const successBanner: React.CSSProperties = { background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 };
const tableWrap: React.CSSProperties = { border: '1px solid #d9e2e6', borderRadius: 8, overflow: 'hidden' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: '#f0f4f7', borderBottom: '1px solid #d9e2e6' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #eef2f5' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '8px 12px', color: '#1f2937' };
