'use client';

import { useState, useEffect } from 'react';
import { fetchAuditLogs, AuditLog } from '../../lib/api';

const RESOURCES = ['', 'order', 'store', 'verification', 'user', 'product', 'inventory', 'notification'];
const ACTIONS = ['', 'create', 'update', 'delete', 'transition', 'approve', 'reject', 'review'];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [page, setPage] = useState(0);

  const limit = 50;

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

  useEffect(() => { load(); }, [page, actionFilter, resourceFilter]);

  const actionColor = (a: string): string => {
    const map: Record<string, string> = {
      create: '#065f46', update: '#1e40af', delete: '#991b1b',
      transition: '#7c3aed', approve: '#047857', reject: '#991b1b', review: '#92400e',
    };
    return map[a] || '#5b6b74';
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Audit Log</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>System-wide activity trail — {total} entries</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Action</label>
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }} style={filterStyle}>
            <option value="">All</option>
            {ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Resource</label>
          <select value={resourceFilter} onChange={e => { setResourceFilter(e.target.value); setPage(0); }} style={filterStyle}>
            <option value="">All</option>
            {RESOURCES.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Actor ID</label>
          <input type="text" placeholder="UUID..." value={actorFilter} onChange={e => setActorFilter(e.target.value)} style={{ ...filterStyle, width: 160 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>From</label>
          <input type="date" value={fromFilter} onChange={e => setFromFilter(e.target.value)} style={filterStyle} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>To</label>
          <input type="date" value={toFilter} onChange={e => setToFilter(e.target.value)} style={filterStyle} />
        </div>
        <button onClick={() => { setPage(0); load(); }} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Apply</button>
      </div>

      {/* Log Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading audit logs...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No audit entries found.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                <th style={thStyle}>Timestamp</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Resource</th>
                <th style={thStyle}>Resource ID</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12, color: '#5b6b74' }}>{new Date(log.createdAt).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${actionColor(log.action)}18`, color: actionColor(log.action), fontWeight: 600 }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={tdStyle}><span style={{ fontSize: 12, fontWeight: 500 }}>{log.resource}</span></td>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{log.resourceId ? log.resourceId.slice(0, 8) : '—'}</span></td>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{log.actorId.slice(0, 8)}</div>
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
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', fontSize: 12, background: page === 0 ? '#edf2f7' : '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#a0aec0' : '#0f3340' }}>Previous</button>
          <span style={{ fontSize: 12, color: '#5b6b74', padding: '6px 8px' }}>Page {page + 1} of {Math.ceil(total / limit)}</span>
          <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', color: '#0f3340' }}>Next</button>
        </div>
      )}
    </div>
  );
}

const filterStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 12, background: '#fff' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
