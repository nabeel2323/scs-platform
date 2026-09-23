'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchOrders,
  acceptMerchantOrder,
  rejectMerchantOrder,
  transitionOrderStatus,
  fetchMerchantCustomersCached,
  clearMerchantCustomersCache,
  SubOrder,
  OrderItem,
} from '../../../lib/buyer-api';
import { fetchMyStores, Store } from '../../../lib/api';
import { pickStore, rememberStoreId } from '../../../lib/merchant-store';
import { useMerchantRealtime } from '../../../lib/useMerchantRealtime';
import {
  StatusBadge,
  formatMinor,
  formatDateCompact,
  EmptyState,
  LoadingSpinner,
  ErrorBanner,
} from '../../../components/Shared';
import { PageHeader } from '@scs/ui-kit';

// Merchant cancellation is a transition to CANCELLED via merchant:orders:write —
// the backend FSM allows it from PENDING_CONFIRMATION through READY
// (orders.service TRANSITIONS). Merchants do not hold orders:cancel, so the
// dedicated /orders/:id/cancel endpoint is not available to them.
const MERCHANT_CANCELLABLE = ['PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY'];
const isCancellable = (status: string) => MERCHANT_CANCELLABLE.includes(status);

// Status dropdown for the filter bar. Each option maps to the concrete order
// statuses it matches: "Pending Confirmation" also covers SUBMITTED (it
// auto-advances seconds after checkout) and "Accepted" covers its
// partially-accepted sibling; everything else is an exact match. REJECTED
// orders stay reachable through "All statuses".
const STATUS_FILTER_OPTIONS: { value: string; label: string; statuses: string[] }[] = [
  { value: 'ALL', label: 'All statuses', statuses: [] },
  { value: 'PENDING_CONFIRMATION', label: 'Pending Confirmation', statuses: ['SUBMITTED', 'PENDING_CONFIRMATION'] },
  { value: 'ACCEPTED', label: 'Accepted', statuses: ['ACCEPTED', 'PARTIALLY_ACCEPTED'] },
  { value: 'PREPARING', label: 'Preparing', statuses: ['PREPARING'] },
  { value: 'READY', label: 'Ready', statuses: ['READY'] },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', statuses: ['OUT_FOR_DELIVERY'] },
  { value: 'DELIVERED', label: 'Delivered', statuses: ['DELIVERED'] },
  { value: 'COMPLETED', label: 'Completed', statuses: ['COMPLETED'] },
  { value: 'CANCELLED', label: 'Cancelled', statuses: ['CANCELLED'] },
];

// Resolved buyer label for an order row. listOrders now returns authoritative
// buyerName/buyerPhone/buyerEmail resolved server-side from the order's own
// buyerId, so the row renders directly. The org-scoped customers directory
// (GET /v1/merchant/customers) is kept as a legacy fallback only for cached
// responses that predate the enrichment or for rows where the users lookup
// returned null. Everything degrades to the ID prefix rather than a blank.
function buyerLabel(
  order: SubOrder,
  buyers: Record<string, { buyerName: string | null; buyerPhone: string | null }>,
): { name: string; phone: string | null } {
  const fallback = buyers[order.buyerId];
  return {
    name: order.buyerName || fallback?.buyerName || `Buyer ${order.buyerId.slice(0, 8)}`,
    phone: order.buyerPhone || fallback?.buyerPhone || null,
  };
}

/** One-line buyer identity for an order row: authoritative first, cached fallback second. */
function BuyerLine({ order, buyers }: {
  order: SubOrder;
  buyers: Record<string, { buyerName: string | null; buyerPhone: string | null }>;
}) {
  const { name, phone } = buyerLabel(order, buyers);
  return (
    <div style={{ fontSize: 12, marginTop: 2 }}>
      <span style={{ color: '#5b6b74' }}>Buyer: </span>
      <span style={{ fontWeight: 600, color: '#0f3340' }}>{name}</span>
      {phone && <span style={{ color: '#5b6b74' }}> · {phone}</span>}
    </div>
  );
}

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [noStore, setNoStore] = useState(false);
  const [rejectId, setRejectId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [cancelId, setCancelId] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Buyer directory (buyerId → name/phone), loaded once per org; orders only
  // carry buyerId, so the labels resolve from GET /v1/merchant/customers.
  const [buyers, setBuyers] = useState<Record<string, { buyerName: string | null; buyerPhone: string | null }>>({});

  // ── Filter state (client-side only; no query parameters reach the API) ──
  // searchInput is the live field value, debouncedSearch feeds the predicate
  // so typing does not re-filter on every keystroke. dateFrom/dateTo are
  // yyyy-mm-dd strings from the native date inputs.
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async (sid: string) => {
    try {
      const data = await fetchOrders({ storeId: sid });
      setOrders(data as SubOrder[]);
      setError('');
    } catch (err: any) {
      // An empty queue and an unreadable queue are different answers to a
      // merchant about to stop watching the screen.
      setError(err.message || 'Could not load orders for this store');
    } finally {
      setLoading(false);
    }
  };

  // Buyer labels resolve from the org customers directory (cached 60s).
  // Extracted so a new order can refresh it: a first-time buyer only appears
  // once they have an order, so callers must bust the cache before re-reading.
  const loadBuyers = () => {
    fetchMerchantCustomersCached()
      .then((list) => {
        const map: Record<string, { buyerName: string | null; buyerPhone: string | null }> = {};
        for (const c of list) {
          map[c.buyerId] = { buyerName: c.buyerName, buyerPhone: c.buyerPhone };
        }
        setBuyers(map);
      })
      .catch(() => { /* labels degrade to buyer IDs */ });
  };

  useEffect(() => {
    (async () => {
      // Buyer labels resolve best-effort: a directory failure only degrades
      // rows to "Buyer {id}" — it must not break the orders load.
      loadBuyers();
      try {
        const list = await fetchMyStores();
        setStores(list);
        const s = pickStore(list);
        if (!s) { setNoStore(true); setLoading(false); return; }
        setStoreId(s.id);
        setStoreName(s.displayName);
        await load(s.id);
      } catch { setLoading(false); }
    })();
  }, []);

  // Gap 2: reload the queue the instant a new order lands for any of this
  // merchant's stores, and refresh the buyer directory (busting its 60s cache)
  // so a first-time buyer's name resolves on the newly-arrived row.
  useMerchantRealtime(() => {
    clearMerchantCustomersCache();
    loadBuyers();
    load(storeId);
  });

  // A2-1: a merchant can own several stores per organization, and
  // GET /v1/stores is already scoped to the active org, so the switcher can only
  // reach stores this caller actually manages. The choice is remembered so the
  // other merchant pages (catalog, inventory, pricing) open on the same store.
  const handleSwitchStore = async (sid: string) => {
    const next = stores.find((s) => s.id === sid);
    if (!next || sid === storeId) return;
    rememberStoreId(sid);
    setStoreId(sid);
    setStoreName(next.displayName);
    setRejectId('');
    setCancelId('');
    setLoading(true);
    await load(sid);
  };

  const handleAccept = async (orderId: string) => {
    setError('');
    try {
      await acceptMerchantOrder(orderId);
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Accept failed'); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setError('');
    try {
      await rejectMerchantOrder(rejectId, rejectReason);
      setRejectId('');
      setRejectReason('');
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Reject failed'); }
  };

  const handleTransition = async (orderId: string, status: string) => {
    setError('');
    try {
      await transitionOrderStatus(orderId, status);
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Transition failed'); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setError('');
    try {
      await transitionOrderStatus(cancelId, 'CANCELLED', cancelReason);
      setCancelId('');
      setCancelReason('');
      await load(storeId);
    } catch (err: any) { setError(err.message || 'Cancel failed'); }
  };

  // 300ms debounce between the search field and the filter predicate.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Client-side filtering across every section. GET /v1/orders exposes only
  // status/storeId params and returns rows without items (A5-16), so text
  // matching covers order ID, buyer ID/name/phone, and product titles
  // whenever a row happens to carry its items.
  const filteredOrders = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const statusOpt = STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter);
    return orders.filter((o) => {
      if (statusOpt && statusOpt.statuses.length > 0 && !statusOpt.statuses.includes(o.status)) return false;
      if (dateFrom && new Date(o.createdAt) < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && new Date(o.createdAt) > new Date(`${dateTo}T23:59:59.999`)) return false;
      if (q) {
        const items = (Array.isArray(o.items) ? o.items : []) as OrderItem[];
        const { name, phone } = buyerLabel(o, buyers);
        const haystack = [
          o.id,
          o.buyerId,
          name,
          phone || '',
          o.buyerEmail || '',
          ...items.map((it) => it.title),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, dateFrom, dateTo, debouncedSearch, buyers]);

  // SUBMITTED auto-advances to PENDING_CONFIRMATION seconds after checkout, so
  // both statuses mean "waiting for the merchant to respond".
  const pendingOrders = filteredOrders.filter(o => ['SUBMITTED', 'PENDING_CONFIRMATION'].includes(o.status));
  const activeOrders = filteredOrders.filter(o => !['SUBMITTED', 'PENDING_CONFIRMATION', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status));
  const completedOrders = filteredOrders.filter(o => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status));

  // Active-filter chips with per-chip removal; "Clear All" sits beside them.
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (debouncedSearch) {
      chips.push({ key: 'q', label: `Search: ${searchInput.trim()}`, clear: () => setSearchInput('') });
    }
    if (statusFilter !== 'ALL') {
      const label = STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label || statusFilter;
      chips.push({ key: 'status', label: `Status: ${label}`, clear: () => setStatusFilter('ALL') });
    }
    if (dateFrom) {
      chips.push({ key: 'from', label: `From: ${formatDateCompact(`${dateFrom}T00:00:00`)}`, clear: () => setDateFrom('') });
    }
    if (dateTo) {
      chips.push({ key: 'to', label: `To: ${formatDateCompact(`${dateTo}T00:00:00`)}`, clear: () => setDateTo('') });
    }
    return chips;
  }, [debouncedSearch, searchInput, statusFilter, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setSearchInput('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  // Mirrors the backend FSM matrix (orders.service TRANSITIONS); the legacy
  // CONFIRMED status no longer exists. CANCELLED renders through the dedicated
  // Cancel button (with reason prompt) instead of a bare transition button.
  const getNextStatuses = (status: string): string[] => {
    const map: Record<string, string[]> = {
      ACCEPTED: ['PREPARING'],
      PARTIALLY_ACCEPTED: ['PREPARING'],
      PREPARING: ['READY'],
      READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
      OUT_FOR_DELIVERY: ['DELIVERED'],
      DELIVERED: ['COMPLETED'],
    };
    return map[status] || [];
  };

  const inputStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', color: '#0f3340' };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 768px) {
          .mo-filterbar { flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 6px; }
          .mo-filterbar > * { flex: 0 0 auto; }
          .mo-card-head { flex-direction: column !important; align-items: stretch !important; }
          .mo-row-actions { justify-content: flex-start !important; }
        }
      `}</style>
      {/* Header Banner */}
      <PageHeader
        title="Merchant Orders"
        subtitle={storeName ? `Incoming orders for ${storeName}` : 'Manage incoming orders'}
      />
      <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}

      {stores.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <label htmlFor="store-switcher" style={{ fontSize: 13, color: '#5b6b74' }}>
            Store
          </label>
          <select
            id="store-switcher"
            value={storeId}
            onChange={(e) => handleSwitchStore(e.target.value)}
            style={inputStyle}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} · {s.verificationStatus}
              </option>
            ))}
          </select>
        </div>
      )}

      {noStore && (
        <EmptyState
          title="No store yet"
          description="Complete onboarding to create your store and start receiving orders."
          action={<Link href="/merchant/onboard" style={{ display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' }}>Onboard a Store</Link>}
        />
      )}

      {/* Search & Filter bar — client-side only: GET /v1/orders has no search
          or date-range query params, so the API call shape is unchanged. */}
      {!noStore && orders.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>Search &amp; Filter</span>
            <span style={{ fontSize: 12, color: '#5b6b74' }}>
              Showing {filteredOrders.length} of {orders.length} orders
            </span>
          </div>
          <div className="mo-filterbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              type="search"
              placeholder="Search by order ID, buyer, or product…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search orders"
              style={{ ...inputStyle, flex: '1 1 220px', minWidth: 200, padding: '8px 10px' }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              style={inputStyle}
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b74' }}>
              From
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Created from"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b74' }}>
              To
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Created to"
                style={inputStyle}
              />
            </label>
            <button
              onClick={clearAllFilters}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' }}
            >
              Clear Filters
            </button>
          </div>
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5ebee' }}>
              {activeFilters.map((f) => (
                <span
                  key={f.key}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef4f6', border: '1px solid #cfe0e7', borderRadius: 12, padding: '2px 10px', fontSize: 12, color: '#0f3340' }}
                >
                  {f.label}
                  <button
                    onClick={f.clear}
                    aria-label={`Remove filter ${f.label}`}
                    style={{ background: 'none', border: 'none', color: '#5b6b74', fontSize: 13, lineHeight: 1, padding: 0, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={clearAllFilters}
                style={{ background: 'none', border: 'none', color: '#1e6178', fontSize: 12, fontWeight: 600, textDecoration: 'underline', padding: 0, cursor: 'pointer' }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#92400e', marginBottom: 12 }}>Pending Acceptance ({pendingOrders.length})</h2>
          {pendingOrders.map(order => (
            <div key={order.id} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 16, marginBottom: 8 }}>
              <div className="mo-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <Link href={`/merchant/orders/${order.id}`} style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', textDecoration: 'none' }}>Order #{order.id.slice(0, 8)} <span style={{ fontSize: 11, color: '#1e6178' }}>View details →</span></Link>
                  <div style={{ fontSize: 12, color: '#5b6b74' }}>{formatDateCompact(order.createdAt)} · {order.itemCount ?? 0} {order.itemCount === 1 ? 'item' : 'items'} · {formatMinor(order.totalMinor, order.currency)}</div>
                  <BuyerLine order={order} buyers={buyers} />
                </div>
                <div className="mo-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <StatusBadge status={order.status} />
                  <button onClick={() => handleAccept(order.id)} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Accept</button>
                  <button onClick={() => { setRejectId(order.id); setRejectReason(''); setCancelId(''); }} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>Reject</button>
                  {isCancellable(order.status) && (
                    <button onClick={() => { setCancelId(order.id); setCancelReason(''); setRejectId(''); }} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                  )}
                </div>
              </div>
              {rejectId === order.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Rejection reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleReject} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setRejectId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                </div>
              )}
              {cancelId === order.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Cancellation reason..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleCancel} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setCancelId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active orders */}
      {activeOrders.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Active Orders ({activeOrders.length})</h2>
          {activeOrders.map(order => {
            const nextStatuses = getNextStatuses(order.status);
            return (
              <div key={order.id} style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 16, marginBottom: 8 }}>
                <div className="mo-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <Link href={`/merchant/orders/${order.id}`} style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', textDecoration: 'none' }}>Order #{order.id.slice(0, 8)} <span style={{ fontSize: 11, color: '#1e6178' }}>View details →</span></Link>
                    <div style={{ fontSize: 12, color: '#5b6b74' }}>{formatDateCompact(order.createdAt)} · {formatMinor(order.totalMinor, order.currency)}</div>
                    <BuyerLine order={order} buyers={buyers} />
                  </div>
                  <div className="mo-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <StatusBadge status={order.status} />
                    {nextStatuses.filter(ns => ns !== 'CANCELLED').map(ns => (
                      <button key={ns} onClick={() => handleTransition(order.id, ns)} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        → {ns.replace(/_/g, ' ')}
                      </button>
                    ))}
                    {isCancellable(order.status) && (
                      <button onClick={() => { setCancelId(order.id); setCancelReason(''); }} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                    )}
                  </div>
                </div>
                {cancelId === order.id && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Cancellation reason..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }} />
                    <button onClick={handleCancel} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Confirm</button>
                    <button onClick={() => setCancelId('')} style={{ padding: '6px 12px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>Close</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completedOrders.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#5b6b74', marginBottom: 12 }}>Completed ({completedOrders.length})</h2>
          {completedOrders.map(order => (
            <div key={order.id} className="mo-card-head" style={{ background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <Link href={`/merchant/orders/${order.id}`} style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 13, color: '#0f3340', fontWeight: 600 }}>Order #{order.id.slice(0, 8)}</span>
                </Link>
                <span style={{ fontSize: 11, color: '#1e6178', marginLeft: 8 }}>View details →</span>
                <div style={{ fontSize: 12, color: '#5b6b74', marginTop: 2 }}>
                  {formatDateCompact(order.createdAt)} · {formatMinor(order.totalMinor, order.currency)}
                </div>
                <BuyerLine order={order} buyers={buyers} />
              </div>
              <StatusBadge status={order.status} />
            </div>
          ))}
        </div>
      )}

      {!noStore && orders.length === 0 && <EmptyState title="No orders yet" description="Orders from buyers will appear here." />}
      {!noStore && orders.length > 0 && filteredOrders.length === 0 && (
        <EmptyState
          title="No orders match your filters"
          description="Try a different search term or clear the filters."
          action={(
            <button
              onClick={clearAllFilters}
              style={{ display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              Clear Filters
            </button>
          )}
        />
      )}
      </div>
    </div>
  );
}
