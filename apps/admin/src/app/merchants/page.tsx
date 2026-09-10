'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchAdminMerchants, AdminMerchant } from '../../lib/api';
import TablePagination from '../../components/TablePagination';

const VERIFICATION_STATUSES = ['', 'PENDING', 'VERIFIED', 'REJECTED', 'REVISION'];
const STORE_STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verFilter, setVerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearchDebounced(v); setPage(0); }, 300);
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchAdminMerchants({
        verificationStatus: verFilter || undefined,
        status: statusFilter || undefined,
        limit,
        offset: page * limit,
      });
      setMerchants(result.data);
      setTotal(result.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, verFilter, statusFilter, limit, searchDebounced]);

  const filteredData = merchants.filter(m => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return m.displayName.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q) || m.orgId.toLowerCase().includes(q);
  });

  const verColor = (s: string): string => {
    const map: Record<string, string> = { VERIFIED: '#065f46', PENDING: '#92400e', REJECTED: '#991b1b', REVISION: '#7c3aed' };
    return map[s] || '#5b6b74';
  };

  const storeStatusColor = (s: string): string => {
    const map: Record<string, string> = { ACTIVE: '#065f46', SUSPENDED: '#991b1b', INACTIVE: '#5b6b74' };
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
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Merchant Directory</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>All registered stores — {searchDebounced ? `${filteredData.length} matches` : `${total} total`}</p>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={verFilter} onChange={e => { setVerFilter(e.target.value); setPage(0); }} style={filterStyle}>
            <option value="">All Verification</option>
            {VERIFICATION_STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={filterStyle}>
            <option value="">All Statuses</option>
            {STORE_STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={load} style={btnPrimary}>Refresh</button>
        </div>

        {/* Search & Pagination Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0', fontSize: 14, pointerEvents: 'none' }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search by name, slug, or org..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', boxSizing: 'border-box' as const, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b74' }}>
            <span>Rows:</span>
            <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 12, background: '#fff', cursor: 'pointer' }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading merchants...</div>
        ) : merchants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No merchants found.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                  <th style={thStyle}>Store Name</th>
                  <th style={thStyle}>Slug</th>
                  <th style={thStyle}>Verification</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Currency</th>
                  <th style={thStyle}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(m => (
                  <tr key={m.id} className="tbl-row" style={{ borderBottom: '1px solid #edf2f7', transition: 'background 0.15s ease' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#0f3340' }}>{m.displayName}</div>
                      <div style={{ fontSize: 11, color: '#a0aec0' }}>{m.orgId.slice(0, 8)}</div>
                    </td>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>/stores/{m.slug}</span></td>
                    <td style={tdStyle}>
                      <span style={pill(verColor(m.verificationStatus))}>{m.verificationStatus}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={pill(storeStatusColor(m.status))}>{m.status}</span>
                    </td>
                    <td style={tdStyle}>{m.currency}</td>
                    <td style={tdStyle}>{new Date(m.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <TablePagination page={page} total={searchDebounced ? filteredData.length : total} limit={limit} onPageChange={setPage} onLimitChange={l => { setLimit(l); setPage(0); }} />
      </div>
    </>
  );
}

/* ── Shared styles ─────────────────────────────────────── */

const filterStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const tdStyle: React.CSSProperties = { padding: '14px 18px', fontSize: 13, color: '#1e2d35' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const pill = (color: string): React.CSSProperties => ({ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color, fontWeight: 600 });
const pageBtn = (disabled: boolean): React.CSSProperties => ({ padding: '6px 14px', fontSize: 12, background: disabled ? '#edf2f7' : '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', color: disabled ? '#a0aec0' : '#0f3340' });
