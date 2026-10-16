'use client';

/**
 * P10 — Merchant Import History
 *
 * Lists all import jobs for the merchant's resolved store.
 * Shows file name, type, status, row counts, and timestamps.
 * Supports downloading error reports for failed imports and
 * polling for in-progress jobs.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { authFetch } from '../../../lib/auth';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { PageHeader } from '@scs/ui-kit';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

interface ImportJobRow {
  id: string;
  storeId: string;
  fileName: string;
  fileType: string;
  status: string;
  totalRows: number | null;
  errorRows: number | null;
  createdAt: string;
  updatedAt: string;
  stats: Record<string, number> | null;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  UPLOADED:   { bg: '#F3F4F6', color: '#6B7280', label: 'Uploaded' },
  MAPPING:    { bg: '#EFF6FF', color: '#1E40AF', label: 'Mapping' },
  PREVIEWING: { bg: '#FFFBEB', color: '#92400E', label: 'Previewing' },
  READY:      { bg: '#F0FDF4', color: '#166534', label: 'Ready' },
  PROCESSING: { bg: '#EFF6FF', color: '#1D5FA8', label: 'Processing' },
  IMPORTING:  { bg: '#EFF6FF', color: '#1D5FA8', label: 'Importing' },
  COMPLETED:  { bg: '#F0FDF4', color: '#166534', label: 'Completed' },
  FAILED:     { bg: '#FEF2F2', color: '#B3372F', label: 'Failed' },
  CANCELLED:  { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || { bg: '#F3F4F6', color: '#6B7280', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, backgroundColor: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-SA', { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function ImportHistoryPage() {
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-resolve store
  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (s) { setStoreId(s.id); setStoreName(s.displayName); }
      } catch { /* handled below */ }
    })();
  }, []);

  const loadJobs = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await authFetch(`${API_URL}/v1/stores/${storeId}/imports`);
      if (res.ok) {
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : []);
        setError(null);
      } else {
        setError(`Failed to load imports: ${res.status}`);
      }
    } catch {
      setError('Network error loading import history.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Load + poll for active jobs
  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    loadJobs();

    // Poll every 3s if any job is in an active state
    pollRef.current = setInterval(() => {
      loadJobs();
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [storeId, loadJobs]);

  // Stop polling when no active jobs
  useEffect(() => {
    const activeStatuses = ['UPLOADED', 'MAPPING', 'PREVIEWING', 'PROCESSING', 'IMPORTING'];
    const hasActive = jobs.some(j => activeStatuses.includes(j.status));
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [jobs]);

  /** R5 — cancel a READY/PROCESSING job (cooperative). */
  const handleCancel = async (jobId: string) => {
    try {
      const res = await authFetch(`${API_URL}/v1/imports/${jobId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.detail || b?.message || `Cancel failed: ${res.status}`);
      }
      await loadJobs();
    } catch (e) {
      setError(`Failed to cancel import: ${e}`);
    }
  };

  /** R5 — retry a FAILED/CANCELLED job, then re-process it. */
  const handleRetry = async (jobId: string) => {
    try {
      const res = await authFetch(`${API_URL}/v1/imports/${jobId}/retry`, { method: 'POST' });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.detail || b?.message || `Retry failed: ${res.status}`);
      }
      // Re-trigger processing; reset moved the job back to READY.
      await authFetch(`${API_URL}/v1/imports/${jobId}/process`, { method: 'POST' });
      await loadJobs();
    } catch (e) {
      setError(`Failed to retry import: ${e}`);
    }
  };

  const handleDownloadErrors = async (jobId: string) => {
    try {
      const res = await authFetch(`${API_URL}/v1/imports/${jobId}/errors`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      // Preserve the backend's exact bytes (incl. the UTF-8 BOM). res.text()
      // would strip the leading BOM, breaking the §8 error-report contract.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-errors-${jobId.substring(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Failed to download error report: ${e}`);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <PageHeader title="Import History" subtitle="View and manage your product import jobs" />
      <div style={{ padding: '20px 24px 48px' }}>

        {error && (
          <div style={{ padding: '12px 16px', marginBottom: 16, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B3372F', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#666' }}>
            {storeName ? `Store: ${storeName}` : 'No store found'}
          </div>
          <Link
            href="/merchant/import"
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              backgroundColor: '#174A5B', color: 'white', textDecoration: 'none',
            }}
          >
            + New Import
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
            Loading import history...
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, backgroundColor: '#F9FAFB', borderRadius: 12, border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>No imports yet</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Upload a CSV or XLSX file to bulk import products into your catalog.
            </div>
            <Link
              href="/merchant/import"
              style={{
                padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                backgroundColor: '#174A5B', color: 'white', textDecoration: 'none',
              }}
            >
              Start Your First Import
            </Link>
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>File</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>Type</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>Rows</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>Errors</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>Created</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.fileName}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#666' }}>
                      {job.fileType || 'CSV'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <StatusBadge status={job.status} />
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {job.totalRows != null ? job.totalRows.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: (job.errorRows ?? 0) > 0 ? '#B3372F' : '#666' }}>
                      {job.errorRows != null && job.errorRows > 0 ? job.errorRows.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                      {formatDate(job.createdAt)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {(job.errorRows ?? 0) > 0 && (
                          <button
                            onClick={() => handleDownloadErrors(job.id)}
                            style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: '#fff', color: '#174A5B', border: '1px solid #174A5B', cursor: 'pointer' }}
                          >
                            Error Report
                          </button>
                        )}
                        {['READY', 'PROCESSING', 'IMPORTING'].includes(job.status) && (
                          <button
                            onClick={() => handleCancel(job.id)}
                            style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: '#fff', color: '#B3372F', border: '1px solid #B3372F', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        )}
                        {['FAILED', 'CANCELLED'].includes(job.status) && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: '#fff', color: '#1D5FA8', border: '1px solid #1D5FA8', cursor: 'pointer' }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        {jobs.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#9CA3AF', display: 'flex', justifyContent: 'space-between' }}>
            <span>{jobs.length} import{jobs.length !== 1 ? 's' : ''} total</span>
            <span>
              {jobs.filter(j => j.status === 'COMPLETED').length} completed ·{' '}
              {jobs.filter(j => j.status === 'FAILED').length} failed ·{' '}
              {jobs.filter(j => ['PROCESSING', 'IMPORTING'].includes(j.status)).length} in progress
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
