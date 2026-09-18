'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchAuditLogs, AuditLog } from '../../lib/api';
import TablePagination from '../../components/TablePagination';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

const RESOURCES = ['', 'order', 'store', 'verification', 'user', 'product', 'inventory', 'notification'];
const ACTIONS = ['', 'create', 'update', 'delete', 'transition', 'approve', 'reject', 'review'];

export default function AuditLogPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:audit:read']);
  if (!hasAccess) return <AccessDenied requiredPerms={['admin:audit:read']} missingPerms={missingPerms} />;

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
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
      const result = await fetchAuditLogs({
        action: actionFilter || undefined,
        resource: resourceFilter || undefined,
        actorId: actorFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        limit,
        offset: page * limit,
      });
      setLogs(result.data);
      setTotal(result.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, actionFilter, resourceFilter, limit, searchDebounced]);

  const filteredData = logs.filter(log => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return log.action.toLowerCase().includes(q) || log.resource.toLowerCase().includes(q) || (log.resourceId && log.resourceId.toLowerCase().includes(q)) || (log.actorId && log.actorId.toLowerCase().includes(q)) || log.actorType.toLowerCase().includes(q);
  });

  const actionColor = (a: string): string => {
    const map: Record<string, string> = {
      create: '#065f46', update: '#1e40af', delete: '#991b1b',
      transition: '#7c3aed', approve: '#047857', reject: '#991b1b', review: '#92400e',
    };
    return map[a] || '#5b6b74';
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
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Audit Log</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>System-wide activity trail — {searchDebounced ? `${filteredData.length} matches` : `${total} entries`}</p>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Action</label>
            <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }} style={filterStyle}>
              <option value="">All</option>
              {ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Resource</label>
            <select value={resourceFilter} onChange={e => { setResourceFilter(e.target.value); setPage(0); }} style={filterStyle}>
              <option value="">All</option>
              {RESOURCES.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Actor ID</label>
            <input type="text" placeholder="UUID or 8-char prefix..." value={actorFilter} onChange={e => setActorFilter(e.target.value)} style={{ ...filterStyle, width: 190 }} />
          </div>
          <div>
            <label style={labelStyle}>From</label>
            <input type="date" value={fromFilter} onChange={e => setFromFilter(e.target.value)} style={filterStyle} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input type="date" value={toFilter} onChange={e => setToFilter(e.target.value)} style={filterStyle} />
          </div>
          <button onClick={() => { setPage(0); load(); }} style={btnPrimary}>Apply</button>
        </div>

        {/* Search & Pagination Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0', fontSize: 14, pointerEvents: 'none' }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search by action, resource, actor..."
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

        {/* Log Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No audit entries found.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                  <th style={thStyle}>Timestamp</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Resource</th>
                  <th style={thStyle}>Resource ID</th>
                  <th style={thStyle}>Actor</th>
                  <th style={thStyle}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(log => (
                  <tr key={log.id} className="tbl-row" style={{ borderBottom: '1px solid #edf2f7', transition: 'background 0.15s ease' }}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12, color: '#5b6b74' }}>{new Date(log.createdAt).toLocaleString()}</td>
                    <td style={tdStyle}>
                      <span style={pill(actionColor(log.action))}>{log.action}</span>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 12, fontWeight: 500 }}>{log.resource}</span></td>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{log.resourceId ? log.resourceId.slice(0, 8) : '—'}</span></td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{log.actorId ? log.actorId.slice(0, 8) : '—'}</div>
                      <div style={{ fontSize: 10, color: '#a0aec0' }}>{log.actorType}</div>
                    </td>
                    <td style={tdStyle}>
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#5b6b74', cursor: 'pointer' }} title={JSON.stringify(log.metadata, null, 2)}>
                          {JSON.stringify(log.metadata).slice(0, 40)}...
                        </span>
                      ) : '—'}
                    </td>
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

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 };
const filterStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 12, background: '#fff' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const tdStyle: React.CSSProperties = { padding: '14px 18px', fontSize: 13, color: '#1e2d35' };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const pill = (color: string): React.CSSProperties => ({ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color, fontWeight: 600 });
const pageBtn = (disabled: boolean): React.CSSProperties => ({ padding: '6px 14px', fontSize: 12, background: disabled ? '#edf2f7' : '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', color: disabled ? '#a0aec0' : '#0f3340' });
