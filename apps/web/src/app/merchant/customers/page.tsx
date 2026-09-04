'use client';

import { useState, useEffect } from 'react';
import { fetchMerchantCustomers, CustomerSummary } from '../../../lib/buyer-api';
import { formatMinor, formatDate, LoadingSpinner, EmptyState } from '../../../components/Shared';

export default function MerchantCustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'total' | 'orders'>('recent');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const data = await fetchMerchantCustomers();
      setCustomers(data);
    } catch {
      // Silent fail - show empty state
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter((c) =>
    c.buyerName?.toLowerCase().includes(search.toLowerCase()) ||
    c.buyerPhone?.includes(search)
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'recent') return new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime();
    if (sortBy === 'total') return b.totalSpentMinor - a.totalSpentMinor;
    return b.orderCount - a.orderCount;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>My Customers</h1>
        <p style={{ color: '#5b6b74', fontSize: 14 }}>View buyers who have ordered from your store</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            border: '1px solid #d9e2e6',
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d9e2e6',
            borderRadius: 6,
            fontSize: 13,
            background: '#fff',
          }}
        >
          <option value="recent">Most Recent</option>
          <option value="total">Highest Spent</option>
          <option value="orders">Most Orders</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title={search ? 'No customers match your search' : 'No customers yet'}
          description={search ? 'Try a different search term' : 'Customers will appear here once buyers place orders from your store'}
        />
      ) : (
        <>
          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Total Customers" value={sorted.length.toString()} />
            <StatCard
              label="Total Revenue"
              value={formatMinor(sorted.reduce((sum, c) => sum + c.totalSpentMinor, 0))}
            />
            <StatCard
              label="Total Orders"
              value={sorted.reduce((sum, c) => sum + c.orderCount, 0).toString()}
            />
            <StatCard
              label="Avg Order Value"
              value={formatMinor(
                sorted.length > 0
                  ? sorted.reduce((sum, c) => sum + c.totalSpentMinor, 0) /
                      sorted.reduce((sum, c) => sum + c.orderCount, 0)
                  : 0
              )}
            />
          </div>

          {/* Customer List */}
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f4f7', borderBottom: '1px solid #d9e2e6' }}>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Orders</th>
                  <th style={thStyle}>Total Spent</th>
                  <th style={thStyle}>Last Order</th>
                  <th style={thStyle}>Avg Order</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.buyerId} style={{ borderBottom: '1px solid #eef2f5' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#0f3340' }}>{c.buyerName || 'Unknown'}</div>
                      {c.buyerEmail && (
                        <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 2 }}>{c.buyerEmail}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{c.buyerPhone || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: '#0f3340' }}>{c.orderCount}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: '#065f46' }}>
                        {formatMinor(c.totalSpentMinor)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: '#5b6b74' }}>
                        {formatDate(c.lastOrderAt)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {formatMinor(c.orderCount > 0 ? c.totalSpentMinor / c.orderCount : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #d9e2e6',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#5b6b74',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f3340' }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: '#5b6b74',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  color: '#1f2937',
};
