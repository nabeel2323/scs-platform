'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  fetchStoreWarehouses, fetchWarehouseInventory, adjustStock,
  fetchInventoryMovements, fetchStoreProducts, fetchProductVariants, createInventoryItem,
  updateInventoryItem, bulkAdjustStock, fetchStoreInventory, exportInventoryCsv,
  transferStock, exportMovementsCsv, checkLowStock,
  StockMovement,
  WarehouseSummary, InventoryItem, ProductVariant,
} from '../../../lib/buyer-api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';
import { PageHeader, Breadcrumb } from '@scs/ui-kit';

function InventoryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const variantFilter = searchParams.get('variant') || '';

  const [noStore, setNoStore] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [selectedWh, setSelectedWh] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'warehouse' | 'variant' | 'all'>(variantFilter ? 'variant' : 'warehouse');

  // Adjust form (per row)
  const [adjustId, setAdjustId] = useState('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Movement history
  const [historyItemId, setHistoryItemId] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Variant lookup for SKU display + searchable dropdown
  const [variantMap, setVariantMap] = useState<Record<string, ProductVariant>>({});
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [showVariantDrop, setShowVariantDrop] = useState(false);
  const variantDropRef = useRef<HTMLDivElement>(null);

  // Create inventory item dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newVariantId, setNewVariantId] = useState('');
  const [newWarehouseId, setNewWarehouseId] = useState('');
  const [newInitialQty, setNewInitialQty] = useState('0');
  const [newReason, setNewReason] = useState('');
  const [creating, setCreating] = useState(false);

  // Settings dialog (reorder point, max stock, low stock alert)
  const [settingsId, setSettingsId] = useState('');
  const [settingsReorder, setSettingsReorder] = useState('');
  const [settingsMax, setSettingsMax] = useState('');
  const [settingsAlert, setSettingsAlert] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Bulk operations
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkAdjust, setShowBulkAdjust] = useState(false);
  const [bulkQty, setBulkQty] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Transfer dialog
  const [transferItemId, setTransferItemId] = useState('');
  const [transferToWh, setTransferToWh] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Low-stock check
  const [lowStockChecking, setLowStockChecking] = useState(false);

  // Pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const loadInventory = useCallback(async (warehouseId: string) => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      setItems(await fetchWarehouseInventory(warehouseId));
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVariantInventory = useCallback(async (variantId: string, p = 0) => {
    setLoading(true);
    try {
      // Fetch inventory across all warehouses for this variant
      // Use store-level inventory and filter client-side
      if (storeId) {
        const { data } = await fetchStoreInventory(storeId, { limit: 500, offset: 0 });
        const filtered = data.filter(i => i.variantId === variantId);
        setTotal(filtered.length);
        setItems(filtered.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load variant inventory');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadAllInventory = useCallback(async (p = 0) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { data, total: t } = await fetchStoreInventory(storeId, { limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      setItems(data);
      setTotal(t);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (!s) { setNoStore(true); setLoading(false); return; }
        setStoreId(s.id);
        const whs = await fetchStoreWarehouses(s.id);
        setWarehouses(whs);
        if (variantFilter) {
          setViewMode('variant');
          await loadVariantInventory(variantFilter);
        } else {
          const first = whs[0];
          if (first) {
            setSelectedWh(first.id);
            await loadInventory(first.id);
          } else {
            setLoading(false);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to resolve store');
        setLoading(false);
      }
    })();
  }, [loadInventory, loadVariantInventory, variantFilter]);

  // Batch-fetch variant details via two-phase load: products → variants per product
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
        const variants = variantArrays.flat();
        setAllVariants(variants);
        const map: Record<string, ProductVariant> = {};
        for (const v of variants) map[v.id] = v;
        setVariantMap(map);
      } catch { /* silent — variantMap stays empty */ }
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
      || (v.title || '').toLowerCase().includes(q);
  });

  const onWarehouseChange = async (whId: string) => {
    setSelectedWh(whId);
    setItems([]);
    await loadInventory(whId);
  };

  const openAdjust = (item: InventoryItem) => {
    setAdjustId(item.id);
    setAdjustQty('');
    setAdjustReason('');
  };

  const openHistory = async (item: InventoryItem) => {
    setHistoryItemId(item.id);
    setLoadingHistory(true);
    try {
      setMovements(await fetchInventoryMovements(item.id));
    } catch {
      setMovements([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAdjust = async () => {
    const qty = Number(adjustQty);
    if (!adjustId || !adjustQty.trim() || Number.isNaN(qty) || qty === 0) {
      setError('Enter a non-zero quantity delta (e.g. 10 or -5)');
      return;
    }
    setAdjusting(true);
    setError('');
    try {
      await adjustStock({ inventoryItemId: adjustId, quantity: qty, reason: adjustReason.trim() || undefined });
      setAdjustId('');
      await loadInventory(selectedWh);
    } catch (err: any) {
      setError(err.message || 'Adjust failed');
    } finally {
      setAdjusting(false);
    }
  };

  const isLowStock = (item: InventoryItem) => item.qtyOnHand <= item.reorderPoint;

  const handleCreateItem = async () => {
    if (!newVariantId || !newWarehouseId) return;
    setCreating(true);
    setError('');
    try {
      await createInventoryItem({
        variantId: newVariantId,
        warehouseId: newWarehouseId,
        initialQty: Number(newInitialQty) || 0,
        reason: newReason.trim() || undefined,
      });
      setShowCreate(false);
      setNewVariantId('');
      setNewInitialQty('0');
      setNewReason('');
      // Reload current view
      if (viewMode === 'variant' && variantFilter) await loadVariantInventory(variantFilter);
      else if (viewMode === 'all') await loadAllInventory();
      else if (selectedWh) await loadInventory(selectedWh);
    } catch (err: any) {
      setError(err.message || 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const openSettings = (item: InventoryItem) => {
    setSettingsId(item.id);
    setSettingsReorder(String(item.reorderPoint));
    setSettingsMax(item.maxStock != null ? String(item.maxStock) : '');
    setSettingsAlert(item.lowStockAlert);
  };

  const handleSaveSettings = async () => {
    if (!settingsId) return;
    setSettingsSaving(true);
    setError('');
    try {
      await updateInventoryItem(settingsId, {
        reorderPoint: Number(settingsReorder) || 0,
        maxStock: settingsMax.trim() ? Number(settingsMax) : undefined,
        lowStockAlert: settingsAlert,
      });
      setSettingsId('');
      if (viewMode === 'variant' && variantFilter) await loadVariantInventory(variantFilter);
      else if (viewMode === 'all') await loadAllInventory();
      else if (selectedWh) await loadInventory(selectedWh);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(items.map(i => i.id)));
  };

  const handleBulkAdjust = async () => {
    if (selectedItems.size === 0 || !bulkQty.trim()) return;
    const qty = Number(bulkQty);
    if (Number.isNaN(qty) || qty === 0) return;
    setBulkLoading(true);
    setError('');
    try {
      await bulkAdjustStock(
        Array.from(selectedItems).map(id => ({ inventoryItemId: id, quantity: qty, reason: bulkReason.trim() || undefined }))
      );
      setShowBulkAdjust(false);
      setBulkQty('');
      setBulkReason('');
      setSelectedItems(new Set());
      if (viewMode === 'variant' && variantFilter) await loadVariantInventory(variantFilter);
      else if (viewMode === 'all') await loadAllInventory();
      else if (selectedWh) await loadInventory(selectedWh);
    } catch (err: any) {
      setError(err.message || 'Bulk adjust failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExport = async () => {
    if (!storeId) return;
    try {
      const csv = await exportInventoryCsv(storeId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-${storeId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    }
  };

  const handleExportMovements = async () => {
    if (!storeId) return;
    try {
      const csv = await exportMovementsCsv(storeId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `movements-${storeId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Movement export failed');
    }
  };

  const handleTransfer = async () => {
    if (!transferItemId || !transferToWh || !transferQty.trim()) return;
    const qty = Number(transferQty);
    if (Number.isNaN(qty) || qty <= 0) return;
    setTransferring(true);
    setError('');
    try {
      const item = items.find(i => i.id === transferItemId);
      if (!item) return;
      await transferStock({
        inventoryItemId: transferItemId,
        fromWarehouseId: item.warehouseId,
        toWarehouseId: transferToWh,
        quantity: qty,
        reason: transferReason.trim() || undefined,
      });
      setTransferItemId('');
      setTransferToWh('');
      setTransferQty('');
      setTransferReason('');
      if (viewMode === 'variant' && variantFilter) await loadVariantInventory(variantFilter);
      else if (viewMode === 'all') await loadAllInventory();
      else if (selectedWh) await loadInventory(selectedWh);
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const handleCheckLowStock = async () => {
    if (!storeId) return;
    setLowStockChecking(true);
    setError('');
    try {
      const alerted = await checkLowStock(storeId);
      if (alerted.length === 0) {
        setError(''); // clear any prior error
        alert('All stock levels are above reorder points.');
      } else {
        alert(`${alerted.length} item(s) triggered low-stock alerts. Notifications dispatched.`);
      }
    } catch (err: any) {
      setError(err.message || 'Low-stock check failed');
    } finally {
      setLowStockChecking(false);
    }
  };

  if (noStore) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Inventory</h1>
        <EmptyState title="No store yet" description="Onboard a store to manage inventory."
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
          title="Inventory"
          subtitle={`Stock levels${viewMode === 'all' ? ` — ${total} items` : selectedWh ? ` — ${items.length} items` : ''}`}
          breadcrumbs={<Breadcrumb items={[{ label: 'Dashboard', href: '/merchant' }, { label: 'Inventory' }]} />}
        />
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {warehouses.length === 0 ? (
        <EmptyState
          title="No warehouses"
          description="Add a warehouse in your Store Profile to start tracking inventory."
          action={<Link href="/merchant/store" style={primaryLink}>Go to Store Profile</Link>}
        />
      ) : (
        <>
          {/* Variant filter banner */}
          {variantFilter && (
            <div style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#0c4a6e', fontWeight: 500 }}>
                Showing inventory for variant <code style={{ background: '#bae6fd', padding: '2px 6px', borderRadius: 4 }}>{variantMap[variantFilter]?.sku || variantFilter.slice(0, 8)}</code>
              </span>
              <button onClick={() => { router.replace('/merchant/inventory'); setViewMode('warehouse'); }} style={{ ...editBtn, fontSize: 12 }}>Clear filter</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {!variantFilter && (
              <select value={selectedWh} onChange={e => onWarehouseChange(e.target.value)} style={select}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <button onClick={() => { if (viewMode === 'variant' && variantFilter) loadVariantInventory(variantFilter); else if (viewMode === 'all') loadAllInventory(); else loadInventory(selectedWh); }} style={primaryBtn}>Refresh</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setShowCreate(true); setNewWarehouseId(selectedWh || warehouses[0]?.id || ''); setVariantSearch(''); setShowVariantDrop(false); }} style={{ ...editBtn, background: '#0c2831', color: '#fff', border: 'none' }}>+ Add Variant</button>
            <button onClick={handleExport} style={{ ...editBtn, fontSize: 12 }}>Export CSV</button>
            <button onClick={handleExportMovements} style={{ ...editBtn, fontSize: 12 }}>Movements</button>
            <button onClick={handleCheckLowStock} disabled={lowStockChecking} style={{ ...editBtn, fontSize: 12 }}>{lowStockChecking ? 'Checking…' : 'Check Low Stock'}</button>
          </div>

          {/* Bulk action bar */}
          {selectedItems.size > 0 && (
            <div style={{ background: '#e0f2fe', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0c4a6e' }}>{selectedItems.size} item(s) selected</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowBulkAdjust(true)} style={{ ...editBtn, background: '#0c2831', color: '#fff', border: 'none' }}>Bulk Adjust</button>
                <button onClick={() => setSelectedItems(new Set())} style={editBtn}>Clear</button>
              </div>
            </div>
          )}

          {loading ? <LoadingSpinner /> : items.length === 0 ? (
            <EmptyState title="No inventory items" description={variantFilter ? 'This variant has no tracked stock yet.' : 'This warehouse has no tracked stock yet.'}
              action={!variantFilter ? <button onClick={() => { setShowCreate(true); setNewWarehouseId(selectedWh || warehouses[0]?.id || ''); setVariantSearch(''); setShowVariantDrop(false); }} style={primaryBtn}>+ Add First Variant</button> : undefined} />
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={{ ...th, width: 36 }}>
                      <input type="checkbox" checked={selectedItems.size === items.length && items.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <th style={th}>Variant</th>
                    <th style={th}>On Hand</th>
                    <th style={th}>Reserved</th>
                    <th style={th}>Available</th>
                    <th style={th}>Reorder Point</th>
                    <th style={th}>Status</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const available = item.qtyOnHand - item.qtyReserved;
                    const low = isLowStock(item);
                    const variant = variantMap[item.variantId];
                    return (
                      <tr key={item.id} className="tbl-row" style={{ ...tbodyRow, background: low ? '#fef2f2' : undefined }}>
                        <td style={{ ...td, width: 36 }}>
                          <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleSelect(item.id)} />
                        </td>
                        <td style={td}>
                          {variant ? (
                            <div>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#0f3340' }}>{variant.sku}</span>
                              {variant.title && <span style={{ fontSize: 11, color: '#5b6b74', marginLeft: 6 }}>{variant.title}</span>}
                            </div>
                          ) : (
                            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.variantId.slice(0, 8)}</span>
                          )}
                        </td>
                        <td style={td}>{item.qtyOnHand}</td>
                        <td style={td}>{item.qtyReserved}</td>
                        <td style={td}><strong>{available}</strong></td>
                        <td style={td}>{item.reorderPoint}</td>
                        <td style={td}>
                          {low
                            ? <span style={{ ...pill, background: '#fef2f2', color: '#991b1b' }}>LOW STOCK</span>
                            : <span style={{ ...pill, background: '#d1fae5', color: '#065f46' }}>OK</span>}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => openAdjust(item)} style={editBtn}>Adjust</button>
                            <button onClick={() => openHistory(item)} style={historyBtn}>History</button>
                            <button onClick={() => openSettings(item)} style={{ ...editBtn, fontSize: 11, padding: '4px 8px' }}>Settings</button>
                            {warehouses.length > 1 && (
                              <button onClick={() => { setTransferItemId(item.id); setTransferToWh(warehouses.find(w => w.id !== item.warehouseId)?.id || ''); }} style={{ ...editBtn, fontSize: 11, padding: '4px 8px' }}>Transfer</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => { const p = Math.max(0, page - 1); setPage(p); if (viewMode === 'all') loadAllInventory(p); else if (variantFilter) loadVariantInventory(variantFilter, p); }}
                disabled={page === 0}
                style={ghostBtn}
              >&larr; Prev</button>
              <span style={{ fontSize: 13, color: '#5b6b74' }}>
                Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
                <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>({total} items)</span>
              </span>
              <button
                onClick={() => { const p = page + 1; setPage(p); if (viewMode === 'all') loadAllInventory(p); else if (variantFilter) loadVariantInventory(variantFilter, p); }}
                disabled={(page + 1) * PAGE_SIZE >= total}
                style={ghostBtn}
              >Next &rarr;</button>
            </div>
          )}
        </>
      )}

      {/* Movement history dialog */}
      {historyItemId && (
        <div style={overlay}>
          <div style={{ ...dialog, maxWidth: 600 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Stock Movement History</h3>
            {loadingHistory ? <LoadingSpinner /> : movements.length === 0 ? (
              <p style={{ fontSize: 13, color: '#5b6b74' }}>No movements recorded yet.</p>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f3f6f9' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5b6b74' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5b6b74' }}>Type</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#5b6b74' }}>Qty</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5b6b74' }}>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 12px', color: '#1e2d35' }}>{new Date(m.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            background: m.movementType === 'ADJUSTMENT' ? '#dbeafe' : m.movementType === 'RESERVATION' ? '#fef3c7' : '#e2e8f0',
                            color: m.movementType === 'ADJUSTMENT' ? '#1e40af' : m.movementType === 'RESERVATION' ? '#92400e' : '#475569',
                          }}>{m.movementType}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: m.quantity > 0 ? '#065f46' : '#991b1b' }}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5b6b74', fontSize: 11, fontFamily: 'monospace' }}>
                          {m.referenceType ? `${m.referenceType}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setHistoryItemId('')} style={ghostBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust dialog */}
      {adjustId && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Adjust Stock</h3>
            <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>
              Enter a quantity delta. Positive adds stock, negative removes it (e.g. <code>10</code> or <code>-5</code>).
            </p>
            <label style={label}>Quantity delta *
              <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="e.g. 10 or -5" style={input} autoFocus />
            </label>
            <label style={label}>Reason
              <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Stock count correction" style={input} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleAdjust} disabled={adjusting || !adjustQty.trim()} style={primaryBtn}>{adjusting ? 'Applying…' : 'Apply'}</button>
              <button onClick={() => setAdjustId('')} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Create inventory item dialog */}
      {showCreate && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Assign Variant to Warehouse</h3>
            <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>Link a product variant to a warehouse and optionally set initial stock.</p>
            <label style={label}>Variant *
              <div ref={variantDropRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={showVariantDrop ? variantSearch : (newVariantId ? (variantMap[newVariantId]?.sku || 'Selected variant') : '')}
                  onChange={e => { setVariantSearch(e.target.value); setShowVariantDrop(true); }}
                  onFocus={() => setShowVariantDrop(true)}
                  onClick={e => e.stopPropagation()}
                  placeholder="Search by SKU or name\u2026"
                  style={input}
                  autoComplete="off"
                />
                {allVariants.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>Loading variants\u2026</div>}
                {showVariantDrop && allVariants.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {filteredVariants.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>No variants match &ldquo;{variantSearch}&rdquo;</div>
                    ) : filteredVariants.map(v => (
                      <div
                        key={v.id}
                        onClick={() => { setNewVariantId(v.id); setVariantSearch(''); setShowVariantDrop(false); }}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                          background: v.id === newVariantId ? '#e6f0f5' : 'transparent',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 12, color: '#0f3340', fontFamily: 'monospace' }}>{v.sku}</span>
                        {v.title && <span style={{ fontSize: 11, color: '#5b6b74' }}>{v.title}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label style={label}>Warehouse *
              <select value={newWarehouseId} onChange={e => setNewWarehouseId(e.target.value)} style={input}>
                <option value="">Select warehouse…</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label style={label}>Initial quantity
              <input type="number" value={newInitialQty} onChange={e => setNewInitialQty(e.target.value)} style={input} min="0" />
            </label>
            <label style={label}>Reason
              <input type="text" value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="e.g. Initial stock import" style={input} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleCreateItem} disabled={creating || !newVariantId || !newWarehouseId} style={primaryBtn}>{creating ? 'Creating…' : 'Create'}</button>
              <button onClick={() => { setShowCreate(false); setNewVariantId(''); setVariantSearch(''); setShowVariantDrop(false); }} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings dialog */}
      {settingsId && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Inventory Settings</h3>
            <label style={label}>Reorder point
              <input type="number" value={settingsReorder} onChange={e => setSettingsReorder(e.target.value)} style={input} min="0" />
              <span style={{ fontSize: 11, color: '#5b6b74', marginTop: 2 }}>Alert when available stock drops to this level</span>
            </label>
            <label style={label}>Max stock
              <input type="number" value={settingsMax} onChange={e => setSettingsMax(e.target.value)} style={input} min="0" placeholder="Optional" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, fontSize: 13, color: '#1f2937', marginBottom: 16 }}>
              <input type="checkbox" checked={settingsAlert} onChange={e => setSettingsAlert(e.target.checked)} />
              Enable low-stock alerts
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSaveSettings} disabled={settingsSaving} style={primaryBtn}>{settingsSaving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setSettingsId('')} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk adjust dialog */}
      {showBulkAdjust && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Bulk Stock Adjustment</h3>
            <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>Apply the same quantity change to {selectedItems.size} selected item(s).</p>
            <label style={label}>Quantity delta *
              <input type="number" value={bulkQty} onChange={e => setBulkQty(e.target.value)} placeholder="e.g. 10 or -5" style={input} autoFocus />
            </label>
            <label style={label}>Reason
              <input type="text" value={bulkReason} onChange={e => setBulkReason(e.target.value)} placeholder="e.g. Monthly stock count" style={input} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleBulkAdjust} disabled={bulkLoading || !bulkQty.trim()} style={primaryBtn}>{bulkLoading ? 'Applying…' : 'Apply to All'}</button>
              <button onClick={() => setShowBulkAdjust(false)} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer dialog */}
      {transferItemId && (
        <div style={overlay}>
          <div style={dialog}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Transfer Stock</h3>
            <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 12 }}>Move stock from the current warehouse to another.</p>
            <label style={label}>Destination warehouse *
              <select value={transferToWh} onChange={e => setTransferToWh(e.target.value)} style={input}>
                {warehouses.filter(w => w.id !== items.find(i => i.id === transferItemId)?.warehouseId).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label style={label}>Quantity *
              <input type="number" value={transferQty} onChange={e => setTransferQty(e.target.value)} placeholder="e.g. 25" style={input} min="1" autoFocus />
            </label>
            <label style={label}>Reason
              <input type="text" value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="e.g. Rebalancing stock" style={input} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handleTransfer} disabled={transferring || !transferQty.trim() || !transferToWh} style={primaryBtn}>{transferring ? 'Transferring…' : 'Transfer'}</button>
              <button onClick={() => setTransferItemId('')} style={ghostBtn}>Cancel</button>
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
const backLink: React.CSSProperties = { fontSize: 13, color: '#5b6b74', textDecoration: 'none' };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const select: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 220 };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' };
const historyBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
const pill: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,51,64,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const dialog: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 10 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937' };

export default function MerchantInventoryPage() {
  return <Suspense fallback={<div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}><LoadingSpinner /></div>}><InventoryPageContent /></Suspense>;
}
