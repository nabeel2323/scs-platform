'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../lib/auth';
import TablePagination from '../../components/TablePagination';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

const STATUSES = ['', 'OPEN', 'EVIDENCE', 'RESPONSE', 'REVIEW', 'RESOLVED', 'CLOSED'];

const DECISION_TEMPLATES = [
  { label: 'Full Refund to Buyer', resolution: 'REFUND_FULL' },
  { label: 'Partial Refund (50%)', resolution: 'REFUND_PARTIAL_50' },
  { label: 'Partial Refund (25%)', resolution: 'REFUND_PARTIAL_25' },
  { label: 'No Action — Merchant Prevails', resolution: 'NO_ACTION_MERCHANT' },
  { label: 'Escalate to Platform Review', resolution: 'ESCALATE' },
];

interface Dispute {
  id: string;
  orderId: string;
  raisedBy: string;
  againstId: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DisputeEvent {
  id: string;
  disputeId: string;
  actorId: string;
  eventType: string;
  body: string;
  attachments: string[];
  createdAt: string;
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [events, setEvents] = useState<DisputeEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState(false);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearchDebounced(v); setPage(0); }, 300);
  };

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      const qs = sp.toString();
      const res = await authFetch(`${API_URL}/v1/disputes${qs ? `?${qs}` : ''}`);
      if (res.ok) setDisputes(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  const filteredData = disputes.filter(d => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return d.id.toLowerCase().includes(q) || d.orderId.toLowerCase().includes(q) || d.status.toLowerCase().includes(q) || d.reason.toLowerCase().includes(q) || d.raisedBy.toLowerCase().includes(q);
  });
  const paginatedData = filteredData.slice(page * limit, (page + 1) * limit);

  const selectDispute = async (d: Dispute) => {
    setSelectedDispute(d);
    setEventsLoading(true);
    try {
      const res = await authFetch(`${API_URL}/v1/disputes/${d.id}/events`);
      if (res.ok) setEvents(await res.json());
    } catch { /* ignore */ }
    finally { setEventsLoading(false); }
  };

  const handleResolve = async () => {
    if (!selectedDispute || !resolution) return;
    setResolving(true);
    try {
      const res = await authFetch(`${API_URL}/v1/disputes/${selectedDispute.id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedDispute(updated);
        setResolution('');
        loadDisputes();
        selectDispute(updated);
      }
    } catch { /* ignore */ }
    finally { setResolving(false); }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      OPEN: '#92400e', EVIDENCE: '#1e40af', RESPONSE: '#7c3aed',
      REVIEW: '#047857', RESOLVED: '#065f46', CLOSED: '#5b6b74',
    };
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
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Dispute Resolution</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Review and resolve buyer–merchant disputes — {searchDebounced ? `${filteredData.length} matches` : `${disputes.length} total`}</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' }}
            >
              <option value="">All Statuses</option>
              {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Search & Pagination Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a0aec0', fontSize: 14, pointerEvents: 'none' }}>&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search by dispute ID, order, reason..."
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

        {/* Split-pane layout */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedDispute ? '1fr 1fr' : '1fr', gap: 20 }}>
          {/* Left: Disputes list */}
          <div style={tableWrap}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading disputes...</div>
            ) : disputes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No disputes found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' }}>
                    <th style={thStyle}>Dispute</th>
                    <th style={thStyle}>Order</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Reason</th>
                    <th style={thStyle}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map(d => (
                    <tr
                      key={d.id}
                      className="tbl-row"
                      onClick={() => selectDispute(d)}
                      style={{
                        borderBottom: '1px solid #edf2f7',
                        cursor: 'pointer',
                        background: selectedDispute?.id === d.id ? '#f0f9ff' : 'transparent',
                      }}
                    >
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>#{d.id.slice(0, 8)}</span></td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>#{d.orderId.slice(0, 8)}</span></td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${statusColor(d.status)}18`, color: statusColor(d.status), fontWeight: 600 }}>
                          {d.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.reason}</td>
                      <td style={tdStyle}>{new Date(d.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {filteredData.length > 0 && (
            <TablePagination page={page} total={filteredData.length} limit={limit} onPageChange={setPage} />
          )}

          {/* Right: Evidence viewer */}
          {selectedDispute && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f3340', margin: 0 }}>
                  Dispute #{selectedDispute.id.slice(0, 8)}
                </h2>
                <button onClick={() => setSelectedDispute(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#5b6b74' }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 12 }}>
                <div><span style={{ color: '#5b6b74' }}>Order:</span> <span style={{ fontFamily: 'monospace' }}>#{selectedDispute.orderId.slice(0, 8)}</span></div>
                <div><span style={{ color: '#5b6b74' }}>Status:</span> <span style={{ fontWeight: 600, color: statusColor(selectedDispute.status) }}>{selectedDispute.status}</span></div>
                <div><span style={{ color: '#5b6b74' }}>Raised by:</span> <span style={{ fontFamily: 'monospace' }}>{selectedDispute.raisedBy.slice(0, 8)}</span></div>
                <div><span style={{ color: '#5b6b74' }}>Against:</span> <span style={{ fontFamily: 'monospace' }}>{selectedDispute.againstId.slice(0, 8)}</span></div>
              </div>

              <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                <strong>Reason:</strong> {selectedDispute.reason}
              </div>

              {/* Evidence timeline */}
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Evidence Timeline</h3>
              {eventsLoading ? (
                <div style={{ color: '#5b6b74', fontSize: 13 }}>Loading events...</div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  {events.map(ev => (
                    <div key={ev.id} style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: statusColor(ev.eventType) }}>{ev.eventType}</span>
                        <span style={{ color: '#a0aec0' }}>{new Date(ev.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ color: '#374151' }}>{ev.body}</div>
                      {ev.attachments?.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {ev.attachments.map((a, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '2px 6px', background: '#edf2f7', borderRadius: 4 }}>{a}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Resolve workflow */}
              {selectedDispute.status !== 'RESOLVED' && selectedDispute.status !== 'CLOSED' && (
                <div style={{ borderTop: '1px solid #d9e2e6', paddingTop: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>Resolve Dispute</h3>

                  {/* Decision templates */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {DECISION_TEMPLATES.map(t => (
                      <button
                        key={t.resolution}
                        onClick={() => setResolution(t.resolution)}
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 500,
                          background: resolution === t.resolution ? '#0f3340' : '#f7f9fa',
                          color: resolution === t.resolution ? '#fff' : '#374151',
                          border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Or enter custom resolution..."
                      value={resolution}
                      onChange={e => setResolution(e.target.value)}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13 }}
                    />
                    <button
                      onClick={handleResolve}
                      disabled={!resolution || resolving}
                      style={{
                        padding: '8px 16px', fontSize: 13, fontWeight: 600,
                        background: !resolution ? '#d9e2e6' : '#065f46',
                        color: !resolution ? '#a0aec0' : '#fff',
                        border: 'none', borderRadius: 6, cursor: !resolution ? 'default' : 'pointer',
                      }}
                    >
                      {resolving ? 'Resolving...' : 'Resolve'}
                    </button>
                  </div>
                </div>
              )}

              {selectedDispute.status === 'RESOLVED' && (
                <div style={{ padding: 12, background: '#d1fae5', borderRadius: 8, fontSize: 13, color: '#065f46' }}>
                  <strong>Resolved:</strong> {selectedDispute.resolution}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const tdStyle: React.CSSProperties = { padding: '14px 18px', fontSize: 13, color: '#1e2d35' };
