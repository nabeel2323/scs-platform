'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchVerificationRequest,
  fetchStore,
  fetchStoreDocuments,
  reviewVerification,
  type VerificationRequest,
  type Store,
  type BusinessDocument,
} from '../../../lib/api';

const DOC_TYPE_LABELS: Record<string, string> = {
  COMMERCIAL_REG: 'Commercial Registration',
  TAX_CERT: 'Tax Certificate',
  BANK_LETTER: 'Bank Letter',
  NATIONAL_ID: 'National ID',
  OTHER: 'Other',
};

export default function VerificationReviewPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params['id'] as string;

  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review form state
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | 'REVISION'>('APPROVED');
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [requestId]);

  async function loadData() {
    setLoading(true);
    try {
      const req = await fetchVerificationRequest(requestId);
      setRequest(req);

      const [storeData, docs] = await Promise.all([
        fetchStore(req.storeId),
        fetchStoreDocuments(req.storeId),
      ]);
      setStore(storeData);
      setDocuments(docs);
    } catch (err: any) {
      setError(err.message || 'Failed to load verification details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!request) return;
    setSubmitting(true);
    try {
      const reasons = decision === 'REJECTED' && rejectionReason
        ? [rejectionReason]
        : undefined;

      await reviewVerification(request.id, decision, notes || undefined, reasons);
      router.push('/verification');
    } catch (err: any) {
      setError(err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <p style={{ color: '#5b6b74' }}>Loading verification details...</p>
      </main>
    );
  }

  if (error && !request) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <p style={{ color: '#c62828' }}>{error}</p>
        <Link href="/verification" style={{ color: '#174a5b' }}>&larr; Back to Queue</Link>
      </main>
    );
  }

  const isReviewable = request && (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW');

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f3340', margin: 0 }}>
            Verification Review
          </h1>
          <p style={{ color: '#5b6b74', margin: '4px 0 0', fontSize: 14 }}>
            Request {requestId.substring(0, 8)}...
          </p>
        </div>
        <Link href="/verification" style={{ color: '#174a5b', textDecoration: 'none', fontSize: 14 }}>
          &larr; Back to Queue
        </Link>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#ffebee', color: '#c62828', borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Store Info */}
      {store && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Store Details</h2>
          <div style={{ background: '#f8fafb', borderRadius: 8, padding: 20, border: '1px solid #e0e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InfoRow label="Display Name" value={store.displayName} />
              <InfoRow label="Slug" value={store.slug} />
              <InfoRow label="Status" value={store.status} />
              <InfoRow label="Verification" value={store.verificationStatus} />
              <InfoRow label="Currency" value={store.currency} />
              <InfoRow label="Locale" value={store.locale} />
              <InfoRow label="Timezone" value={store.timezone} />
              <InfoRow label="Created" value={new Date(store.createdAt).toLocaleDateString()} />
            </div>
            {store.description && (
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, color: '#8a9ba5', display: 'block', marginBottom: 4 }}>Description</span>
                <p style={{ margin: 0, color: '#3a4a52', fontSize: 14 }}>{store.description}</p>
              </div>
            )}
            {store.address && Object.keys(store.address).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, color: '#8a9ba5', display: 'block', marginBottom: 4 }}>Address</span>
                <p style={{ margin: 0, color: '#3a4a52', fontSize: 14 }}>
                  {JSON.stringify(store.address, null, 2)}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Documents */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>
          Documents ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p style={{ color: '#8a9ba5', fontSize: 14 }}>No documents uploaded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#fff',
                  border: '1px solid #e0e7eb',
                  borderRadius: 6,
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, color: '#0f3340', fontSize: 14 }}>
                    {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                  </div>
                  <div style={{ fontSize: 12, color: '#8a9ba5' }}>
                    {doc.fileName} &middot; {(doc.fileSize / 1024).toFixed(1)} KB
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  background: doc.verificationStatus === 'VERIFIED' ? '#e8f5e9' : doc.verificationStatus === 'REJECTED' ? '#ffebee' : '#fff8e1',
                  color: doc.verificationStatus === 'VERIFIED' ? '#2e7d32' : doc.verificationStatus === 'REJECTED' ? '#c62828' : '#8a6d00',
                }}>
                  {doc.verificationStatus}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review Form */}
      {isReviewable && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Decision</h2>
          <div style={{ background: '#f8fafb', borderRadius: 8, padding: 20, border: '1px solid #e0e7eb' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['APPROVED', 'REJECTED', 'REVISION'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDecision(d)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: decision === d
                      ? (d === 'APPROVED' ? '#2e7d32' : d === 'REJECTED' ? '#c62828' : '#e65100')
                      : '#d9e2e6',
                    background: decision === d
                      ? (d === 'APPROVED' ? '#2e7d32' : d === 'REJECTED' ? '#c62828' : '#e65100')
                      : '#fff',
                    color: decision === d ? '#fff' : '#5b6b74',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#5b6b74', marginBottom: 4 }}>
                Reviewer Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #d9e2e6',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                placeholder="Optional notes about this decision..."
              />
            </div>

            {decision === 'REJECTED' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#5b6b74', marginBottom: 4 }}>
                  Rejection Reason (required)
                </label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d9e2e6',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                  placeholder="e.g. Commercial registration document expired"
                />
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || (decision === 'REJECTED' && !rejectionReason)}
              style={{
                padding: '10px 28px',
                borderRadius: 6,
                border: 'none',
                background: submitting ? '#8a9ba5' : '#174a5b',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Decision'}
            </button>
          </div>
        </section>
      )}

      {/* Already resolved */}
      {!isReviewable && request && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Resolution</h2>
          <div style={{ background: '#f8fafb', borderRadius: 8, padding: 20, border: '1px solid #e0e7eb' }}>
            <InfoRow label="Status" value={request.status} />
            {request.decisionNotes && <InfoRow label="Notes" value={request.decisionNotes} />}
            {request.resolvedAt && (
              <InfoRow label="Resolved" value={new Date(request.resolvedAt).toLocaleString()} />
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8a9ba5', display: 'block', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#0f3340', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
