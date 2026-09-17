'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../lib/auth';
import TablePagination from '../../components/TablePagination';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const STATUSES = ['', 'DRAFT', 'ACTIVE', 'REJECTED'];

interface ModerationProduct {
  id: string;
  storeId: string;
  title: string;
  status: string;
  isAvailable: boolean;
  createdAt: string;
}

export default function ProductsModerationPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:merchants:read']);
  const [products, setProducts] = useState<ModerationProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moderating, setModerating] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearchDebounced(v); setPage(0); setSelectedIdx(0); }, 300);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      const res = await authFetch(`${API_URL}/v1/admin/products?${sp}`);
      if (!res.ok) {
        setError(`Failed to load moderation queue (HTTP ${res.status}). Check your session and retry.`);
        return;
      }
      setError(null);
      const data = await res.json();
      setProducts(data.data || data);
    } catch (e) {
      setError(`Failed to load moderation queue: ${e instanceof Error ? e.message : 'network error'}`);
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filteredData = products.filter(p => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.storeId.toLowerCase().includes(q) || p.status.toLowerCase().includes(q);
  });
  const paginatedData = filteredData.slice(page * limit, (page + 1) * limit);

  const handleModerate = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED') => {
    setError(null);
    setModerating(m => new Set(m).add(id));
    try {
      const res = await authFetch(`${API_URL}/v1/admin/products/${id}/moderate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        // Do NOT touch the table on failure — the row must stay so the
        // decision can be retried, and the error must be visible.
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = body.detail || body.message || detail;
        } catch { /* keep status code */ }
        setError(`Failed to ${decision === 'APPROVED' ? 'approve' : decision === 'REJECTED' ? 'reject' : 'archive'} product: ${detail}`);
        return;
      }
      // Re-sync from the server so the table reflects the persisted status
      // (e.g. DRAFT → ACTIVE) instead of optimistically trusting the client.
      await load();
    } catch (e) {
      setError(`Failed to submit moderation decision: ${e instanceof Error ? e.message : 'network error'}`);
    } finally {
      setModerating(m => { const next = new Set(m); next.delete(id); return next; });
    }
  };

  // Keyboard shortcuts (P1-13)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case 'j': // next item
          setSelectedIdx(i => Math.min(i + 1, products.length - 1));
          break;
        case 'k': // prev item
          setSelectedIdx(i => Math.max(i - 1, 0));
          break;
        case 'a': // approve selected
          if (products[selectedIdx]) handleModerate(products[selectedIdx].id, 'APPROVED');
          break;
        case 'x': // reject selected
          if (products[selectedIdx]) handleModerate(products[selectedIdx].id, 'REJECTED');
          break;
        case '/': // focus search
          e.preventDefault();
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [products, selectedIdx, handleModerate]);

  const statusColor = (s: string) => {
    const map: Record<string, string> = { DRAFT: '#92400e', ACTIVE: '#065f46', REJECTED: '#991b1b' };
    return map[s] || '#5b6b74';
  };

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
        .tbl-last td { border-bottom: none !important; }
      `}</style>

      {/* ── Header Banner ─────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Product Moderation</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
            Review and moderate merchant products — {products.filter(p => p.status === 'DRAFT').length} awaiting moderation
          </p>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {!hasAccess && <AccessDenied requiredPerms={['admin:merchants:read']} missingPerms={missingPerms} />}
        <p style={{ color: '#a0aec0', fontSize: 11, marginBottom: 20 }}>
          Shortcuts: <kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> navigate · <kbd style={kbdStyle}>A</kbd> approve · <kbd style={kbdStyle}>X</kbd> reject · <kbd style={kbdStyle}>/</kbd> search
        </p>

        {error && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
            padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13,
          }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }} aria-label="Dismiss">×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelectedIdx(0); }}
            style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
            <option value="">All Statuses</option>
            {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input data-search-input type="text" placeholder="Search products..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', flex: 1, minWidth: 200 }} />
          <button onClick={load} style={btnPrimary}>Refresh</button>
        </div>

        {/* Pagination Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, gap: 6, fontSize: 12, color: '#5b6b74' }}>
          <span>{filteredData.length} result{filteredData.length !== 1 ? 's' : ''}</span>
          <span style={{ margin: '0 8px', color: '#d9e2e6' }}>|</span>
          <span>Rows:</span>
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 12, background: '#fff', cursor: 'pointer' }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading products...</div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No products to moderate.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                  <th style={{ ...thStyle, width: 30 }}></th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Store</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((p, i) => {
                  const globalIdx = page * limit + i;
                  return (
                  <tr key={p.id} className="tbl-row" style={{
                    borderBottom: '1px solid #edf2f7',
                    background: globalIdx === selectedIdx ? '#f0f9ff' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#a0aec0', fontSize: 11 }}>{globalIdx + 1}</td>
                    <td style={tdStyle}><span style={{ fontWeight: 600, color: '#0f3340' }}>{p.title}</span></td>
                    <td style={tdStyle}>
                      <span style={pill(statusColor(p.status))}>{p.status}</span>
                    </td>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.storeId.slice(0, 8)}</span></td>
                    <td style={tdStyle}>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleModerate(p.id, 'APPROVED')} disabled={moderating.has(p.id)}
                          style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 4, cursor: moderating.has(p.id) ? 'wait' : 'pointer', opacity: moderating.has(p.id) ? 0.5 : 1 }}>
                          {moderating.has(p.id) ? '…' : 'Approve'}
                        </button>
                        <button onClick={() => handleModerate(p.id, 'REJECTED')} disabled={moderating.has(p.id)}
                          style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: 4, cursor: moderating.has(p.id) ? 'wait' : 'pointer', opacity: moderating.has(p.id) ? 0.5 : 1 }}>
                          Reject
                        </button>
                        <button onClick={() => handleModerate(p.id, 'ARCHIVED')} disabled={moderating.has(p.id)}
                          style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#5b6b74', border: 'none', borderRadius: 4, cursor: moderating.has(p.id) ? 'wait' : 'pointer', opacity: moderating.has(p.id) ? 0.5 : 1 }}>
                          Archive
                        </button>
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
        {filteredData.length > 0 && (
          <TablePagination page={page} total={filteredData.length} limit={limit} onPageChange={setPage} />
        )}
      </div>
    </>
  );
}

/* ── Shared styles ─────────────────────────────────────── */

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const tdStyle: React.CSSProperties = { padding: '14px 18px', fontSize: 13, color: '#1e2d35' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const pill = (color: string): React.CSSProperties => ({ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color, fontWeight: 600 });
const kbdStyle: React.CSSProperties = { padding: '1px 5px', background: '#edf2f7', border: '1px solid #d9e2e6', borderRadius: 3, fontSize: 10, fontFamily: 'monospace' };
