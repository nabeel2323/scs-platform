'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  fetchStorePriceLists, fetchPriceListTiers, createPriceList,
  addPriceTier, updatePriceTier, removePriceTier,
  fetchStoreProducts, fetchProductVariants,
  PriceList, PriceTier, ProductVariant,
} from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';
import { PageHeader } from '@scs/ui-kit';
import { TierLadder } from '../../../components/QuantityStepper';

export default function MerchantPricingPage() {
  const [storeId, setStoreId] = useState('');
  const [noStore, setNoStore] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [selectedList, setSelectedList] = useState('');
  const [error, setError] = useState('');

  // Create price list dialog
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListCurrency, setNewListCurrency] = useState('SAR');
  const [creating, setCreating] = useState(false);

  // Add tier dialog
  const [showAddTier, setShowAddTier] = useState(false);
  const [newVariantId, setNewVariantId] = useState('');
  const [newMinQty, setNewMinQty] = useState('1');
  const [newMaxQty, setNewMaxQty] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [addingTier, setAddingTier] = useState(false);

  // Variant searchable dropdown
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [showVariantDrop, setShowVariantDrop] = useState(false);
  const variantDropRef = useRef<HTMLDivElement>(null);

  // Edit tier
  const [editingTier, setEditingTier] = useState('');
  const [editMinQty, setEditMinQty] = useState('');
  const [editMaxQty, setEditMaxQty] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');

  const loadTiers = useCallback(async (listId: string) => {
    if (!listId) { setTiers([]); return; }
    setTiersLoading(true);
    try {
      setTiers(await fetchPriceListTiers(listId));
    } catch (err: any) {
      setError(err.message || 'Failed to load tiers');
    } finally {
      setTiersLoading(false);
    }
  }, []);

  const loadLists = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const lists = await fetchStorePriceLists(sid);
      setPriceLists(lists);
      const first = lists[0];
      if (first) {
        setSelectedList(first.id);
        await loadTiers(first.id);
      } else {
        setSelectedList('');
        setTiers([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load price lists');
    } finally {
      setLoading(false);
    }
  }, [loadTiers]);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (!s) { setNoStore(true); setLoading(false); return; }
        setStoreId(s.id);
        await loadLists(s.id);
      } catch (err: any) {
        setError(err.message || 'Failed to resolve store');
        setLoading(false);
      }
    })();
  }, [loadLists]);

  // Load all store variants for the searchable dropdown and tier table display
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      try {
        const products: any[] = [];
        let offset = 0;
        while (true) {
          const env = await fetchStoreProducts(storeId, { limit: 50, offset });
          products.push(...(env.items as any[]));
          if (products.length >= env.total || env.items.length === 0) break;
          offset += 50;
        }
        const variantArrays = await Promise.all(
          products.map(p => fetchProductVariants(p.id).catch(() => []))
        );
        setAllVariants(variantArrays.flat());
      } catch { /* silent */ }
    })();
  }, [storeId]);

  // Close variant dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (variantDropRef.current && !variantDropRef.current.contains(e.target as Node)) {
        setShowVariantDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredVariants = allVariants.filter(v => {
    if (!variantSearch) return true;
    const q = variantSearch.toLowerCase();
    return v.sku.toLowerCase().includes(q)
      || (v.title || '').toLowerCase().includes(q)
      || v.unit.toLowerCase().includes(q);
  });

  const variantInfo = allVariants.reduce((acc, v) => { acc[v.id] = v; return acc; }, {} as Record<string, ProductVariant>);

  const fmt = (n: number) => (n / 100).toFixed(2);

  const handleCreateList = async () => {
    if (!newListName.trim() || !storeId) return;
    setCreating(true);
    setError('');
    try {
      const created = await createPriceList({ storeId, name: newListName.trim(), currency: newListCurrency });
      setPriceLists(prev => [...prev, created]);
      setSelectedList(created.id);
      await loadTiers(created.id);
      setShowCreateList(false);
      setNewListName('');
    } catch (err: any) {
      setError(err.message || 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleAddTier = async () => {
    if (!selectedList || !newVariantId || !newUnitPrice.trim()) return;
    const minQty = Number(newMinQty) || 1;
    const unitPriceMinor = Math.round(parseFloat(newUnitPrice) * 100);
    if (unitPriceMinor <= 0) { setError('Unit price must be positive'); return; }
    setAddingTier(true);
    setError('');
    try {
      await addPriceTier({
        priceListId: selectedList,
        variantId: newVariantId,
        minQty,
        maxQty: newMaxQty.trim() ? Number(newMaxQty) : undefined,
        unitPriceMinor,
      });
      setShowAddTier(false);
      setNewVariantId('');
      setVariantSearch('');
      setShowVariantDrop(false);
      setNewMinQty('1');
      setNewMaxQty('');
      setNewUnitPrice('');
      await loadTiers(selectedList);
    } catch (err: any) {
      setError(err.message || 'Add tier failed');
    } finally {
      setAddingTier(false);
    }
  };

  const handleUpdateTier = async (tierId: string) => {
    setError('');
    try {
      await updatePriceTier(tierId, {
        minQty: editMinQty.trim() ? Number(editMinQty) : undefined,
        maxQty: editMaxQty.trim() ? Number(editMaxQty) : null,
        unitPriceMinor: editUnitPrice.trim() ? Math.round(parseFloat(editUnitPrice) * 100) : undefined,
      });
      setEditingTier('');
      await loadTiers(selectedList);
    } catch (err: any) {
      setError(err.message || 'Update tier failed');
    }
  };

  const handleRemoveTier = async (tierId: string) => {
    if (!window.confirm('Remove this tier?')) return;
    setError('');
    try {
      await removePriceTier(tierId);
      await loadTiers(selectedList);
    } catch (err: any) {
      setError(err.message || 'Remove tier failed');
    }
  };

  const startEditTier = (t: PriceTier) => {
    setEditingTier(t.id);
    setEditMinQty(String(t.minQty));
    setEditMaxQty(t.maxQty != null ? String(t.maxQty) : '');
    setEditUnitPrice(fmt(t.unitPriceMinor));
  };

  // Group tiers by variantId for the TierLadder preview
  const tiersByVariant = tiers.reduce((acc, t) => {
    const key = t.variantId;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push({ minQty: t.minQty, unitPriceMinor: t.unitPriceMinor });
    return acc;
  }, {} as Record<string, { minQty: number; unitPriceMinor: number }[]>);

  // Pricing health: count zero-priced and unpriced variants in the active list
  const pricedVariantIds = new Set(Object.keys(tiersByVariant));
  const zeroPricedVariants = Object.entries(tiersByVariant).filter(([, t]) => t.some((tier: { unitPriceMinor: number }) => tier.unitPriceMinor === 0));
  const zeroPricedCount = zeroPricedVariants.length;

  if (noStore) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Pricing</h1>
        <EmptyState title="No store yet" description="Onboard a store to manage pricing."
          action={<Link href="/merchant/onboard" style={primaryLink}>Onboard a Store</Link>} />
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
        <PageHeader
          title="Pricing"
          subtitle="Price lists and volume tiers"
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCreateList(true)} style={headerBtn}>+ New List</button>
              <button onClick={() => storeId && loadLists(storeId)} style={headerBtn}>Refresh</button>
            </div>
          }
        />
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {/* Pricing health banner */}
      {!loading && selectedList && (
        <div style={{ background: zeroPricedCount > 0 ? '#fef3c7' : '#d1fae5', border: `1px solid ${zeroPricedCount > 0 ? '#fcd34d' : '#6ee7b7'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: zeroPricedCount > 0 ? '#92400e' : '#065f46', fontWeight: 500 }}>
            {zeroPricedCount > 0
              ? `⚠ ${zeroPricedCount} variant(s) have zero-priced tiers — cart will reject these items`
              : `✓ All ${pricedVariantIds.size} priced variant(s) have valid prices`}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {zeroPricedCount > 0 && (
              <button onClick={() => { setShowAddTier(true); }} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: '#b45309', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Assign prices
              </button>
            )}
            <span style={{ fontSize: 12, color: zeroPricedCount > 0 ? '#b45309' : '#047857' }}>
              {pricedVariantIds.size} variant(s) with tiers
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <select value={selectedList} onChange={e => { setSelectedList(e.target.value); loadTiers(e.target.value); }} style={select} disabled={priceLists.length === 0}>
          {priceLists.length === 0 && <option value="">No price lists</option>}
          {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name} ({pl.currency})</option>)}
        </select>
        {selectedList && <button onClick={() => setShowAddTier(true)} style={primaryBtn}>+ Add Tier</button>}
      </div>

      {loading ? <LoadingSpinner /> : priceLists.length === 0 ? (
        <EmptyState
          title="No price lists"
          description="Create your first price list to start defining volume tiers."
          action={<button onClick={() => setShowCreateList(true)} style={primaryBtn}>Create Price List</button>}
        />
      ) : tiersLoading ? <LoadingSpinner /> : tiers.length === 0 ? (
        <EmptyState title="No price tiers" description="Add tiers to define volume-based pricing."
          action={<button onClick={() => setShowAddTier(true)} style={primaryBtn}>+ Add Tier</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr style={theadRow}>
                  <th style={th}>Variant</th>
                  <th style={th}>Min Qty</th>
                  <th style={th}>Max Qty</th>
                  <th style={th}>Unit Price</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map(t => {
                  const isZero = t.unitPriceMinor === 0;
                  return (
                  <tr key={t.id} className="tbl-row" style={{ ...tbodyRow, background: isZero ? '#fef2f2' : undefined }}>
                    <td style={td}>
                      {(() => { const vi = variantInfo[t.variantId]; return vi
                        ? <span style={{ fontSize: 12 }}><strong>{vi.sku}</strong>{vi.title ? ` · ${vi.title}` : ''}</span>
                        : <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' }}>Variant removed</span>; })()}
                    </td>
                    {editingTier === t.id ? (
                      <>
                        <td style={td}><input type="number" value={editMinQty} onChange={e => setEditMinQty(e.target.value)} style={inlineInput} min={1} /></td>
                        <td style={td}><input type="number" value={editMaxQty} onChange={e => setEditMaxQty(e.target.value)} style={inlineInput} min={0} placeholder="∞" /></td>
                        <td style={td}><input type="number" value={editUnitPrice} onChange={e => setEditUnitPrice(e.target.value)} style={{ ...inlineInput, width: 80 }} step="0.01" min={0} /></td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleUpdateTier(t.id)} style={saveBtn}>Save</button>
                            <button onClick={() => setEditingTier('')} style={cancelBtn}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={td}>≥ {t.minQty}</td>
                        <td style={td}>{t.maxQty ?? '—'}</td>
                        <td style={td}>
                          <strong style={isZero ? { color: '#991b1b' } : undefined}>{fmt(t.unitPriceMinor)}</strong>
                          {isZero && <span style={{ fontSize: 10, color: '#991b1b', marginLeft: 4, fontWeight: 600 }}>ZERO</span>}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => startEditTier(t)} style={editBtn}>Edit</button>
                            <button onClick={() => handleRemoveTier(t.id)} style={deleteBtn}>Delete</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Tier Preview</h3>
            {Object.entries(tiersByVariant).slice(0, 3).map(([variantId, variantTiers]) => (
              <div key={variantId} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#5b6b74', marginBottom: 4 }}>
                  {variantInfo[variantId] ? <><strong>{variantInfo[variantId].sku}</strong>{variantInfo[variantId].title ? ` · ${variantInfo[variantId].title.slice(0, 20)}` : ''}</> : `Variant #${variantId.slice(0, 8)}`}
                </div>
                <TierLadder tiers={variantTiers} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Price List Dialog */}
      {showCreateList && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>New Price List</h3>
            <label style={label}>Name *
              <input type="text" value={newListName} onChange={e => setNewListName(e.target.value)} placeholder="e.g. Wholesale Riyadh" style={input} autoFocus />
            </label>
            <label style={label}>Currency
              <select value={newListCurrency} onChange={e => setNewListCurrency(e.target.value)} style={input}>
                <option value="SAR">SAR</option>
                <option value="AED">AED</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleCreateList} disabled={creating || !newListName.trim()} style={primaryBtn}>{creating ? 'Creating…' : 'Create'}</button>
              <button onClick={() => setShowCreateList(false)} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tier Dialog */}
      {showAddTier && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Add Price Tier</h3>
            <label style={label}>Product Variant *
              <div ref={variantDropRef} style={variantDropWrap}>
                <input
                  type="text"
                  value={showVariantDrop ? variantSearch : (newVariantId ? (variantInfo[newVariantId]?.sku || 'Selected variant') : '')}
                  onChange={e => { setVariantSearch(e.target.value); setShowVariantDrop(true); }}
                  onFocus={() => setShowVariantDrop(true)}
                  onClick={e => e.stopPropagation()}
                  placeholder="Search by SKU, name, or unit…"
                  style={input}
                  autoComplete="off"
                />
                {allVariants.length === 0 && <div style={variantEmpty}>Loading variants…</div>}
                {showVariantDrop && allVariants.length > 0 && (
                  <div style={variantMenu}>
                    {filteredVariants.length === 0 ? (
                      <div style={variantNoMatch}>No variants match "{variantSearch}"</div>
                    ) : filteredVariants.map(v => (
                      <div
                        key={v.id}
                        onClick={() => { setNewVariantId(v.id); setVariantSearch(''); setShowVariantDrop(false); }}
                        style={{
                          ...variantOption,
                          background: v.id === newVariantId ? '#e6f0f5' : 'transparent',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 12, color: '#0f3340' }}>{v.sku}</span>
                        {v.title && <span style={{ fontSize: 11, color: '#5b6b74', marginLeft: 6 }}>{v.title}</span>}
                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{v.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ ...label, flex: 1 }}>Min Qty *
                <input type="number" value={newMinQty} onChange={e => setNewMinQty(e.target.value)} style={input} min={1} />
              </label>
              <label style={{ ...label, flex: 1 }}>Max Qty
                <input type="number" value={newMaxQty} onChange={e => setNewMaxQty(e.target.value)} style={input} min={0} placeholder="Leave empty for ∞" />
              </label>
            </div>
            <label style={label}>Unit Price *
              <input type="number" value={newUnitPrice} onChange={e => setNewUnitPrice(e.target.value)} placeholder="e.g. 12.50" style={input} step="0.01" min={0} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleAddTier} disabled={addingTier || !newVariantId || !newUnitPrice.trim()} style={primaryBtn}>{addingTier ? 'Adding…' : 'Add Tier'}</button>
              <button onClick={() => setShowAddTier(false)} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const headerBtn: React.CSSProperties = { padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const select: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 220 };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' };
const deleteBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: 4, cursor: 'pointer' };
const saveBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 4, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' };
const inlineInput: React.CSSProperties = { padding: '4px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 12, width: 60 };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const dialog: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 10 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937' };
const variantDropWrap: React.CSSProperties = { position: 'relative' };
const variantMenu: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 8, maxHeight: 220, overflowY: 'auto', zIndex: 300, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', marginTop: 4 };
const variantOption: React.CSSProperties = { padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid #f3f4f6' };
const variantEmpty: React.CSSProperties = { fontSize: 11, color: '#9ca3af', padding: '6px 0 0' };
const variantNoMatch: React.CSSProperties = { padding: '12px 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' };
