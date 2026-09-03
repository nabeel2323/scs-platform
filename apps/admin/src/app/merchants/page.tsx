'use client';

import { useState, useEffect } from 'react';
import { fetchAdminMerchants, AdminMerchant } from '../../lib/api';

const VERIFICATION_STATUSES = ['', 'PENDING', 'VERIFIED', 'REJECTED', 'REVISION'];
const STORE_STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verFilter, setVerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  const limit = 25;

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

  useEffect(() => { load(); }, [page, verFilter, statusFilter]);

  const verColor = (s: string): string => {
    const map: Record<string, string> = { VERIFIED: '#065f46', PENDING: '#92400e', REJECTED: '#991b1b', REVISION: '#7c3aed' };
    return map[s] || '#5b6b74';
  };

  const storeStatusColor = (s: string): string => {
    const map: Record<string, string> = { ACTIVE: '#065f46', SUSPENDED: '#991b1b', INACTIVE: '#5b6b74' };
    return map[s] || '#5b6b74';
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Merchant Directory</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>All registered stores — {total} total</p>

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
        <button onClick={load} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading merchants...</div>
      ) : merchants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No merchants found.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                <th style={thStyle}>Store Name</th>
                <th style={thStyle}>Slug</th>
                <th style={thStyle}>Verification</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Currency</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#0f3340' }}>{m.displayName}</div>
                    <div style={{ fontSize: 11, color: '#a0aec0' }}>{m.orgId.slice(0, 8)}</div>
                  </td>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>/stores/{m.slug}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${verColor(m.verificationStatus)}18`, color: verColor(m.verificationStatus), fontWeight: 600 }}>
                      {m.verificationStatus}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${storeStatusColor(m.status)}18`, color: storeStatusColor(m.status), fontWeight: 600 }}>
                      {m.status}
                    </span>
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

const filterStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
