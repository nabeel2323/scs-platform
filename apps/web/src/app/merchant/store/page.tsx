'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchMyStores, fetchStore, updateStore, createWarehouse, Store } from '../../../lib/api';
import { hasPerm } from '../../../lib/auth';
import { pickStore } from '../../../lib/merchant-store';
import { fetchStoreWarehouses, WarehouseSummary } from '../../../lib/buyer-api';
import { LoadingSpinner, ErrorBanner, EmptyState, StatusBadge } from '../../../components/Shared';
import { PageHeader } from '@scs/ui-kit';

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
  // PHASE 23: buyer-facing disclosure opt-out. Rendered as a separate Privacy
  // card so it's discoverable without scrolling through profile fields.
  const [hidePopularityBadge, setHidePopularityBadge] = useState(false);

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
    // Server returns `false` by default (NOT NULL column added in 0030).
    setHidePopularityBadge(s.hidePopularityBadge === true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const first = pickStore(stores);
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
        // PHASE 23: always sent (explicit boolean) so the merchant can flip it
        // back to false in the same Save action that unchecks the box.
        hidePopularityBadge,
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

  // GAP-2/3: Staff lacks merchant:stores:write — hide write controls
  const canEdit = hasPerm('merchant:stores:write');

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
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
      `}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header Banner */}
        <PageHeader
          title="Store Profile"
          subtitle={`${store.displayName} · ${store.verificationStatus}`}
        />
        <div style={{ padding: '20px 24px 48px' }}>

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

        {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleSave} disabled={saving || !displayName.trim()} style={primaryBtn}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
        )}
        {!canEdit && (
          <p style={{ fontSize: 12, color: '#5b6b74', marginTop: 8, fontStyle: 'italic' }}>
            Read-only view — you do not have permission to edit store settings.
          </p>
        )}
      </div>

      {/* PHASE 23: Buyer-facing disclosure preference. Kept in its own card so
          the intent is unmistakable — the toggle only affects how this store's
          sales counts appear on canonical product pages; it does NOT hide the
          store, its offers, or affect admin/merchant analytics. */}
      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>Buyer-Facing Privacy</h2>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#1f2937', cursor: canEdit ? 'pointer' : 'not-allowed' }}>
          <input
            type="checkbox"
            checked={hidePopularityBadge}
            disabled={!canEdit}
            onChange={e => setHidePopularityBadge(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Hide "Most Popular Seller" badge and units sold</strong>
            <br />
            <span style={{ fontSize: 12, color: '#5b6b74' }}>
              When enabled, canonical product pages will not display this store&rsquo;s order count,
              units sold, rank, or &ldquo;★ Most Popular&rdquo; badge. Offers remain fully visible
              and purchasable — only the sales-count overlay is suppressed. Your own analytics
              dashboard and admin reports are unaffected.
            </span>
          </span>
        </label>
      </div>

      {/* Warehouses */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Warehouses ({warehouses.length})</h2>
          {canEdit && <button onClick={() => setWhFormOpen(v => !v)} style={ghostBtn}>{whFormOpen ? 'Close' : '+ Add Warehouse'}</button>}
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
                  <tr key={w.id} className="tbl-row" style={tbodyRow}>
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
      </div>
    </>
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
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
