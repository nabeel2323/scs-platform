'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '../../../lib/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

interface InventoryItem {
  id: string;
  storeId: string;
  warehouseId: string;
  variantId: string;
  qtyOnHand: number;
  qtyReserved: number;
  reorderPoint: number;
  updatedAt: string;
}

export default function MerchantInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/v1/inventory`);
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const isLowStock = (item: InventoryItem) => item.qtyOnHand <= item.reorderPoint;

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>Inventory</h1>
      <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 24 }}>
        Stock levels — {items.length} items
        {items.filter(isLowStock).length > 0 && (
          <span style={{ color: '#991b1b', fontWeight: 600 }}> ({items.filter(isLowStock).length} low stock)</span>
        )}
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading inventory...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No inventory items found.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                <th style={thStyle}>Variant</th>
                <th style={thStyle}>On Hand</th>
                <th style={thStyle}>Reserved</th>
                <th style={thStyle}>Available</th>
                <th style={thStyle}>Reorder Point</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const available = item.qtyOnHand - item.qtyReserved;
                const low = isLowStock(item);
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #edf2f7', background: low ? '#fef2f2' : 'transparent' }}>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.variantId.slice(0, 8)}</span></td>
                    <td style={tdStyle}>{item.qtyOnHand}</td>
                    <td style={tdStyle}>{item.qtyReserved}</td>
                    <td style={tdStyle}><strong>{available}</strong></td>
                    <td style={tdStyle}>{item.reorderPoint}</td>
                    <td style={tdStyle}>
                      {low ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#fef2f2', color: '#991b1b', fontWeight: 600 }}>LOW STOCK</span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#d1fae5', color: '#065f46', fontWeight: 600 }}>OK</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#0f3340', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Adjust</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
