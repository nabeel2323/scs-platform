'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '../../../lib/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const STATUSES = ['', 'DRAFT', 'ACTIVE', 'REJECTED', 'ARCHIVED'];

interface CatalogProduct {
  id: string;
  storeId: string;
  title: string;
  status: string;
  isAvailable: boolean;
  moq: number;
  createdAt: string;
}

export default function MerchantCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [storeId, setStoreId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      const res = await authFetch(`${API_URL}/v1/admin/products?${sp}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.data || data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const statusColor = (s: string) => {
    const map: Record<string, string> = { DRAFT: '#92400e', ACTIVE: '#065f46', REJECTED: '#991b1b', ARCHIVED: '#5b6b74' };
    return map[s] || '#5b6b74';
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Product Catalog</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>Manage your product catalog — {products.length} products</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
          <option value="">All Statuses</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading products...</div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No products found.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Available</th>
                <th style={thStyle}>MOQ</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={tdStyle}><span style={{ fontWeight: 600, color: '#0f3340' }}>{p.title}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${statusColor(p.status)}18`, color: statusColor(p.status), fontWeight: 600 }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{p.isAvailable ? '✓' : '—'}</td>
                  <td style={tdStyle}>{p.moq}</td>
                  <td style={tdStyle}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <button style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
