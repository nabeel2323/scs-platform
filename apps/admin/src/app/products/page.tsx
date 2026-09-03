'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../lib/auth';

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
  const [products, setProducts] = useState<ModerationProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = useCallback(async () => {
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
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleModerate = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED') => {
    try {
      await authFetch(`${API_URL}/v1/admin/products/${id}/moderate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      setProducts(p => p.filter(prod => prod.id !== id));
    } catch { /* ignore */ }
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
  }, [products, selectedIdx]);

  const statusColor = (s: string) => {
    const map: Record<string, string> = { DRAFT: '#92400e', ACTIVE: '#065f46', REJECTED: '#991b1b' };
    return map[s] || '#5b6b74';
  };

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Product Moderation</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 8 }}>
        Review and moderate merchant products — {products.length} pending
      </p>
      <p style={{ color: '#a0aec0', fontSize: 11, marginBottom: 20 }}>
        Shortcuts: <kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> navigate · <kbd style={kbdStyle}>A</kbd> approve · <kbd style={kbdStyle}>X</kbd> reject · <kbd style={kbdStyle}>/</kbd> search
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelectedIdx(0); }}
          style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
          <option value="">All Statuses</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input data-search-input type="text" placeholder="Search products..."
          style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff', flex: 1, minWidth: 200 }} />
        <button onClick={load} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading products...</div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No products to moderate.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                <th style={{ ...thStyle, width: 30 }}></th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Store</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #edf2f7', background: i === selectedIdx ? '#f0f9ff' : 'transparent' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#a0aec0', fontSize: 11 }}>{i + 1}</td>
                  <td style={tdStyle}><span style={{ fontWeight: 600, color: '#0f3340' }}>{p.title}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${statusColor(p.status)}18`, color: statusColor(p.status), fontWeight: 600 }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.storeId.slice(0, 8)}</span></td>
                  <td style={tdStyle}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleModerate(p.id, 'APPROVED')}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        Approve
                      </button>
                      <button onClick={() => handleModerate(p.id, 'REJECTED')}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        Reject
                      </button>
                      <button onClick={() => handleModerate(p.id, 'ARCHIVED')}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#5b6b74', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        Archive
                      </button>
                    </div>
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
const kbdStyle: React.CSSProperties = { padding: '1px 5px', background: '#edf2f7', border: '1px solid #d9e2e6', borderRadius: 3, fontSize: 10, fontFamily: 'monospace' };
