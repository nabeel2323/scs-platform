'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AccessDenied, useRequirePerms } from '../../../hooks/useRequirePerms';
import Link from 'next/link';
import {
  fetchVerificationRequest,
  fetchStore,
  fetchStoreDocuments,
  reviewVerification,
  presignDocumentDownload,
  deactivateAdminOrganization,
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
  const requestId = params['id'] as string;
  const { hasAccess, missingPerms } = useRequirePerms(['merchant:verification:review']);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [success, setSuccess] = useState<string | null>(null);
  const pending = useRef(false);
  const active = useRef(0);

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
  const [deactivating, setDeactivating] = useState(false);
  const [orgDeactivated, setOrgDeactivated] = useState(false);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    let current = true;
    active.current += 1;
    setLoading(true);
    setError(null);
    setRequest(null);
    fetchVerificationRequest(requestId).then(async req => {
      const [storeData, docs] = await Promise.all([
        fetchStore(req.storeId), fetchStoreDocuments(req.storeId),
      ]);
      if (current) {
        setRequest(req);
        setStore(storeData);
        setDocuments(docs);
      }
    }).catch((err: unknown) => {
      if (current) setError(err instanceof Error ? err.message : 'Failed to load verification details');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; active.current += 1; };
  }, [requestId, ready, hasAccess, revision]);

  async function handleSubmit() {
    if (!request || pending.current || !hasAccess) return;
    pending.current = true;
    const generation = active.current;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const reasons = decision === 'REJECTED' && rejectionReason
        ? [rejectionReason]
        : undefined;

      const updated = await reviewVerification(request.id, decision, notes || undefined, reasons);
      if (generation !== active.current) return;
      setRequest(updated);
      setSuccess(decision === 'APPROVED'
        ? `Verification approved. ${updated.autoActivatedProductCount ?? 0} eligible draft products activated.`
        : `Verification decision saved: ${decision}. No products activated.`);
      setRevision(value => value + 1);
    } catch (err: unknown) {
      if (generation === active.current) setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      pending.current = false;
      if (generation === active.current) setSubmitting(false);
    }
  }

  async function handleDeactivateOrg() {
    if (!store || !window.confirm('Deactivate this merchant organization? They will lose platform access.')) return;
    setDeactivating(true);
    setError(null);
    try {
      await deactivateAdminOrganization(store.orgId, false);
      setOrgDeactivated(true);
      setSuccess('Organization deactivated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate organization');
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReactivateOrg() {
    if (!store || !window.confirm('Reactivate this merchant organization?')) return;
    setDeactivating(true);
    setError(null);
    try {
      await deactivateAdminOrganization(store.orgId, true);
      setOrgDeactivated(false);
      setSuccess('Organization reactivated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate organization');
    } finally {
      setDeactivating(false);
    }
  }

  if (ready && !hasAccess) return <AccessDenied requiredPerms={['merchant:verification:review']} missingPerms={missingPerms} />;
  if (!ready || loading) {
    return (
      <>
        {/* Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
          padding: '32px 40px 28px', color: '#fff',
        }}>
          <div style={{ maxWidth: 1320 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Verification Review</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Loading...</p>
          </div>
        </div>
        <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
          <p style={{ color: '#5b6b74' }}>Loading verification details...</p>
        </div>
      </>
    );
  }

  if (error && !request) {
    return (
      <>
        {/* Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
          padding: '32px 40px 28px', color: '#fff',
        }}>
          <div style={{ maxWidth: 1320 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Verification Review</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Error</p>
          </div>
        </div>
        <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
          <p style={{ color: '#c62828' }}>{error}</p>
          <button onClick={() => setRevision(value => value + 1)}>Retry</button>
          <Link href="/verification" style={{ color: '#174a5b' }}>&larr; Back to Queue</Link>
        </div>
      </>
    );
  }

  const isReviewable = request && (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW');

  return (
    <>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Verification Review</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
              Request {requestId.substring(0, 8)}...
            </p>
          </div>
          <Link href="/verification" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            &larr; Back to Queue
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {error && (
          <div style={{ padding: '10px 16px', background: '#ffebee', color: '#c62828', borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {success && <p role="status" style={{ padding: 16, background: '#e8f5e9', color: '#256029' }}>{success}</p>}

        {/* Store Info */}
        {store && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Store Details</h2>
            <div style={{ background: '#f8fafb', borderRadius: 10, padding: 20, border: '1px solid #e0e7eb' }}>
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
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 1px 2px rgba(22,35,43,.04)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    <button
                      onClick={async () => {
                        try {
                          const url = await presignDocumentDownload(doc.id);
                          if (url) window.open(url, '_blank', 'noopener');
                        } catch {
                          setError('Failed to prepare document download.');
                        }
                      }}
                      style={{
                        padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                        background: '#1d5fa8', color: '#fff',
                        border: 'none', borderRadius: 4,
                        cursor: 'pointer', marginLeft: '8px',
                      }}
                    >Download</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Review Form */}
        {isReviewable && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Decision</h2>
            <div style={{ background: '#f8fafb', borderRadius: 10, padding: 20, border: '1px solid #e0e7eb' }}>
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

              {decision === 'APPROVED' && <p>
                Approval also activates this store’s current, nondeleted DRAFT products with a trimmed title
                of 1–300 characters, a nonblank slug, MOQ of at least 1, a supported condition, and at least
                one stored image reference. Eligible products become available; an existing published date
                is preserved. Ineligible drafts remain unchanged. Image references do not guarantee uploaded
                files exist. Future products and previously approved stores are not backfilled.
              </p>}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#5b6b74', marginBottom: 4 }}>
                  Reviewer Notes
                </label>
                <textarea
                  value={notes}
                  maxLength={5000}
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
                    maxLength={500}
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
                  background: submitting ? '#8a9ba5' : '#0f3340',
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
            <div style={{ background: '#f8fafb', borderRadius: 10, padding: 20, border: '1px solid #e0e7eb' }}>
              <InfoRow label="Status" value={request.status} />
              {request.decisionNotes && <InfoRow label="Notes" value={request.decisionNotes} />}
              {request.resolvedAt && (
                <InfoRow label="Resolved" value={new Date(request.resolvedAt).toLocaleString()} />
              )}
            </div>
          </section>
        )}

        {/* Merchant Deactivation */}
        {store && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Merchant Status</h2>
            <div style={{ background: '#f8fafb', borderRadius: 10, padding: 20, border: '1px solid #e0e7eb' }}>
              <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 12 }}>
                Deactivate the merchant organization to revoke platform access. Data is preserved but the merchant cannot perform operations.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {!orgDeactivated ? (
                  <button
                    onClick={handleDeactivateOrg}
                    disabled={deactivating}
                    style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: deactivating ? 'not-allowed' : 'pointer' }}
                  >
                    {deactivating ? 'Deactivating…' : 'Deactivate Merchant'}
                  </button>
                ) : (
                  <button
                    onClick={handleReactivateOrg}
                    disabled={deactivating}
                    style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: deactivating ? 'not-allowed' : 'pointer' }}
                  >
                    {deactivating ? 'Reactivating…' : 'Reactivate Merchant'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
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
