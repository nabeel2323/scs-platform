'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminRequest } from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import { PageHeader } from '@scs/ui-kit';

interface Discrepancy {
  id: string;
  discrepancyType: string;
  sourceRef: string;
  expectedMinor: number | null;
  actualMinor: number | null;
  deltaMinor: number | null;
  description: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

interface ReconciliationRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  version: number;
  status: string;
  summary: Record<string, number>;
  discrepancyCount: number;
  executedBy: string | null;
  createdAt: string;
  completedAt: string | null;
  discrepancies?: Discrepancy[];
}

const STATUS_COLORS: Record<string, string> = {
  RUNNING: '#f59e0b', COMPLETED: '#22c55e', FAILED: '#ef4444', PARTIAL: '#f97316',
};

const SEVERITY_COLORS: Record<string, string> = {
  MISSING_REFUND: '#ef4444', EXCESSIVE_REFUND: '#ef4444', DUPLICATE_REFUND: '#ef4444',
  MISSING_COMMISSION_REVERSAL: '#f59e0b', EXCESSIVE_REVERSAL: '#f59e0b', DUPLICATE_REVERSAL: '#f59e0b',
  SETTLEMENT_MISMATCH: '#f97316', UNAPPROVED_ADJUSTMENT: '#f97316',
  DELIVERY_FEE_OVER_REFUND: '#8b5cf6', REFUND_STATUS_MISMATCH: '#f59e0b',
  INCOMPLETE_SOURCE_DATA: '#6b7280',
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function fmtMinor(minor: number | null) {
  if (minor == null) return '—';
  return `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function ReconciliationPage() {
  useRequirePerms(['admin:reconciliation:read']);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null);
  const [running, setRunning] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminRequest<ReconciliationRun[]>('admin/reconciliation')
      .then(data => setRuns(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRunDetail = useCallback(async (id: string) => {
    try {
      const run = await adminRequest<ReconciliationRun>(`admin/reconciliation/${id}`);
      setSelectedRun(run);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleRun = async () => {
    if (!periodStart || !periodEnd) { setError('Period start and end are required'); return; }
    setRunning(true);
    setError('');
    try {
      await adminRequest('admin/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd, currency: 'SYP' }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleResolve = async (discrepancyId: string) => {
    const notes = prompt('Resolution notes (required):');
    if (!notes) return;
    try {
      await adminRequest(`admin/reconciliation/discrepancies/${discrepancyId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (selectedRun) loadRunDetail(selectedRun.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#0f1115', color: '#e5e7eb' }}>
      <PageHeader title="Reconciliation" subtitle="Monthly financial reconciliation and discrepancy management" />

      {/* Run new reconciliation */}
      <div style={{ background: '#1a1d24', borderRadius: 12, border: '1px solid #2a2d34', padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Execute Reconciliation</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
            style={{ background: '#1e2028', color: '#e5e7eb', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', fontSize: 13 }} />
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>to</span>
          <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
            style={{ background: '#1e2028', color: '#e5e7eb', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', fontSize: 13 }} />
          <button onClick={handleRun} disabled={running}
            style={{ background: running ? '#6b7280' : '#3b82f6', color: '#fff', border: 0, borderRadius: 6, padding: '4px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {running ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {loading && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading...</div>}

      {/* Run history */}
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Execution History</div>
      {runs.length === 0 && !loading && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No reconciliation runs yet.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {runs.map(run => (
          <div key={run.id} onClick={() => loadRunDetail(run.id)}
            style={{ background: selectedRun?.id === run.id ? '#1e293b' : '#1a1d24', borderRadius: 8, border: `1px solid ${selectedRun?.id === run.id ? '#3b82f6' : '#2a2d34'}`, padding: '10px 14px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: STATUS_COLORS[run.status] || '#6b7280' }}>{run.status}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>v{run.version}</span>
                <span style={{ fontSize: 12 }}>{run.periodStart} to {run.periodEnd}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>({run.currency})</span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: run.discrepancyCount > 0 ? '#ef4444' : '#22c55e' }}>
                  {run.discrepancyCount} discrepancy{run.discrepancyCount !== 1 ? 'ies' : 'y'}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtDate(run.createdAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Discrepancy detail */}
      {selectedRun && selectedRun.discrepancies && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Discrepancies for Run {selectedRun.id.slice(0, 8)}... (v{selectedRun.version})
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
            Marking a discrepancy resolved does NOT change financial records. It only records that the issue has been reviewed.
          </div>

          {selectedRun.discrepancies.length === 0 && (
            <div style={{ color: '#22c55e', fontSize: 13 }}>No discrepancies found in this run.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedRun.discrepancies.map(d => (
              <div key={d.id} style={{ background: '#1a1d24', borderRadius: 8, border: `1px solid ${d.resolved ? '#22c55e44' : '#2a2d34'}`, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: SEVERITY_COLORS[d.discrepancyType] || '#6b7280' }}>
                    {d.discrepancyType}
                  </span>
                  {d.resolved ? (
                    <span style={{ fontSize: 11, color: '#22c55e' }}>Resolved</span>
                  ) : (
                    <button onClick={() => handleResolve(d.id)}
                      style={{ background: '#f59e0b', color: '#000', border: 0, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Resolve</button>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>{d.description}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  Source: {d.sourceRef} | Expected: {fmtMinor(d.expectedMinor)} | Actual: {fmtMinor(d.actualMinor)} | Delta: {fmtMinor(d.deltaMinor)}
                </div>
                {d.resolutionNotes && (
                  <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>Resolution: {d.resolutionNotes}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
