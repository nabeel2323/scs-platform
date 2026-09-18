'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchVerificationQueue, type VerificationRequest } from '../../lib/api';
import TablePagination from '../../components/TablePagination';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: '#fff8e1', text: '#8a6d00' },
  UNDER_REVIEW: { bg: '#e3f2fd', text: '#1565c0' },
  APPROVED: { bg: '#e8f5e9', text: '#2e7d32' },
  REJECTED: { bg: '#ffebee', text: '#c62828' },
  REVISION: { bg: '#fff3e0', text: '#e65100' },
};

export default function VerificationQueuePage() {
  const { hasAccess, missingPerms } = useRequirePerms(['merchant:verification:review']);

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearchDebounced(v); setPage(0); }, 300);
  };

  useEffect(() => {
    loadQueue();
  }, [statusFilter]);

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVerificationQueue({
        status: statusFilter || undefined,
        limit: 50,
      });
      setRequests(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load verification queue');
    } finally {
      setLoading(false);
    }
  }

  const filteredData = requests.filter(req => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return (req.storeName || '').toLowerCase().includes(q) || (req.orgName || '').toLowerCase().includes(q) || req.status.toLowerCase().includes(q) || (req.storeSlug || '').toLowerCase().includes(q);
  });
  const paginatedData = filteredData.slice(page * limit, (page + 1) * limit);

  if (!hasAccess) return <AccessDenied requiredPerms={['merchant:verification:review']} missingPerms={missingPerms} />;

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
        .tbl-last td { border-bottom: none !important; }
      `}</style>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Verification Queue</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Review merchant onboarding requests — {searchDebounced ? `${filteredData.length} matches` : `${requests.length} total`}</p>
          </div>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            &larr; Back to Console
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVISION'].map((s) => (
            <button
              key={s || 'ALL'}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: statusFilter === s ? '#0f3340' : '#d9e2e6',
                background: statusFilter === s ? '#0f3340' : '#fff',
                color: statusFilter === s ? '#fff' : '#5b6b74',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {/* Search & Pagination Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0', fontSize: 14, pointerEvents: 'none' }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search by business, org, status..."
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

        {loading && <p style={{ color: '#5b6b74' }}>Loading queue...</p>}
        {error && <p style={{ color: '#c62828' }}>{error}</p>}

        {!loading && !error && requests.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5b6b74', background: '#f8fafb', borderRadius: 8 }}>
            No verification requests found.
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div style={tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)', textAlign: 'left' }}>
                  <th style={thStyle}>Business</th>
                  <th style={thStyle}>Organization</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Submitted</th>
                  <th style={thStyle}>Auto</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((req) => {
                  const colors = STATUS_COLORS[req.status] || { bg: '#f5f5f5', text: '#333' };
                  return (
                    <tr key={req.id} className="tbl-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 500, color: '#0f3340' }}>
                          {req.storeName || req.storeId.substring(0, 8) + '...'}
                        </div>
                        {req.storeSlug && (
                          <div style={{ fontSize: 12, color: '#8a9ba5' }}>/{req.storeSlug}</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 500, color: '#0f3340' }}>
                          {req.orgName || req.orgId.substring(0, 8) + '...'}
                        </div>
                        {req.orgType && (
                          <div style={{ fontSize: 12, color: '#8a9ba5' }}>{req.orgType}</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 12,
                          background: colors.bg,
                          color: colors.text,
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#1e2d35' }}>
                        {new Date(req.submittedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#1e2d35' }}>
                        {req.autoVerified ? 'Yes' : 'No'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {(req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW') && (
                          <Link
                            href={`/verification/${req.id}`}
                            style={{
                              padding: '5px 14px',
                              borderRadius: 6,
                              background: '#0f3340',
                              color: '#fff',
                              textDecoration: 'none',
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            Review
                          </Link>
                        )}
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

const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
