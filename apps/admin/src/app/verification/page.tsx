'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchVerificationQueue, type VerificationRequest } from '../../lib/api';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: '#fff8e1', text: '#8a6d00' },
  UNDER_REVIEW: { bg: '#e3f2fd', text: '#1565c0' },
  APPROVED: { bg: '#e8f5e9', text: '#2e7d32' },
  REJECTED: { bg: '#ffebee', text: '#c62828' },
  REVISION: { bg: '#fff3e0', text: '#e65100' },
};

export default function VerificationQueuePage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

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

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f3340', margin: 0 }}>
            Verification Queue
          </h1>
          <p style={{ color: '#5b6b74', margin: '4px 0 0' }}>
            Review merchant onboarding requests
          </p>
        </div>
        <Link href="/" style={{ color: '#174a5b', textDecoration: 'none', fontSize: 14 }}>
          &larr; Back to Console
        </Link>
      </div>

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
              borderColor: statusFilter === s ? '#174a5b' : '#d9e2e6',
              background: statusFilter === s ? '#174a5b' : '#fff',
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

      {loading && <p style={{ color: '#5b6b74' }}>Loading queue...</p>}
      {error && <p style={{ color: '#c62828' }}>{error}</p>}

      {!loading && !error && requests.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#5b6b74', background: '#f8fafb', borderRadius: 8 }}>
          No verification requests found.
        </div>
      )}

      {!loading && requests.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e7eb', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', color: '#5b6b74', fontWeight: 600 }}>Business</th>
              <th style={{ padding: '10px 12px', color: '#5b6b74', fontWeight: 600 }}>Organization</th>
              <th style={{ padding: '10px 12px', color: '#5b6b74', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '10px 12px', color: '#5b6b74', fontWeight: 600 }}>Submitted</th>
              <th style={{ padding: '10px 12px', color: '#5b6b74', fontWeight: 600 }}>Auto</th>
              <th style={{ padding: '10px 12px', color: '#5b6b74', fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => {
              const colors = STATUS_COLORS[req.status] || { bg: '#f5f5f5', text: '#333' };
              return (
                <tr key={req.id} style={{ borderBottom: '1px solid #eef2f4' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 500, color: '#0f3340' }}>
                      {req.storeName || req.storeId.substring(0, 8) + '...'}
                    </div>
                    {req.storeSlug && (
                      <div style={{ fontSize: 12, color: '#8a9ba5' }}>/{req.storeSlug}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 500, color: '#0f3340' }}>
                      {req.orgName || req.orgId.substring(0, 8) + '...'}
                    </div>
                    {req.orgType && (
                      <div style={{ fontSize: 12, color: '#8a9ba5' }}>{req.orgType}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
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
                  <td style={{ padding: '12px', color: '#5b6b74' }}>
                    {new Date(req.submittedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td style={{ padding: '12px', color: '#5b6b74' }}>
                    {req.autoVerified ? 'Yes' : 'No'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {(req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW') && (
                      <Link
                        href={`/verification/${req.id}`}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 6,
                          background: '#174a5b',
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
      )}
    </main>
  );
}
