'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AccessDenied, useRequirePerms } from '../../../hooks/useRequirePerms';
import { getUser } from '../../../lib/auth';
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
import {
  PageHeader, Button, Card, Modal, BreadcrumbDark,
  colors, typeScale, radii, shadows, transitions,
} from '@scs/ui-kit';

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
  const [orgStatusLoaded, setOrgStatusLoaded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'reactivate' | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const adminUser = getUser();
  const canManageOrgs = (adminUser?.perms ?? []).includes('admin:users:write');

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
        // Hydrate the real org status so the toggle reflects the database (G11).
        if (req.org) {
          setOrgDeactivated(!req.org.isActive);
          setOrgStatusLoaded(true);
        }
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
    if (!store) return;
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
      setConfirmAction(null);
    }
  }

  async function handleReactivateOrg() {
    if (!store) return;
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
      setConfirmAction(null);
    }
  }

  async function handleDownloadDoc(docId: string) {
    setDownloadingDocId(docId);
    try {
      const url = await presignDocumentDownload(docId);
      if (url) window.open(url, '_blank', 'noopener');
    } catch {
      setError('Failed to prepare document download.');
    } finally {
      setDownloadingDocId(null);
    }
  }

  if (ready && !hasAccess) return <AccessDenied requiredPerms={['merchant:verification:review']} missingPerms={missingPerms} />;
  if (!ready || loading) {
    return (
      <>
        <PageHeader
          title="Verification Review"
          subtitle="Loading..."
          breadcrumbs={<BreadcrumbDark items={[{ label: 'Verification', href: '/verification' }, { label: 'Loading...' }]} />}
        />
        <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
          <p style={{ color: colors.muted }}>Loading verification details...</p>
        </div>
      </>
    );
  }

  if (error && !request) {
    return (
      <>
        <PageHeader
          title="Verification Review"
          subtitle="Error"
          breadcrumbs={<BreadcrumbDark items={[{ label: 'Verification', href: '/verification' }, { label: 'Error' }]} />}
        />
        <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
          <p style={{ color: colors.err }}>{error}</p>
          <Button onClick={() => setRevision(value => value + 1)}>Retry</Button>
          <Link href="/verification" style={{ color: colors.brand.DEFAULT, marginLeft: 12 }}>&larr; Back to Queue</Link>
        </div>
      </>
    );
  }

  const isReviewable = request && (request.status === 'SUBMITTED' || request.status === 'UNDER_REVIEW');

  return (
    <>
      {/* Header Banner */}
      <PageHeader
        title="Verification Review"
        subtitle={`Request ${requestId.substring(0, 8)}...`}
        breadcrumbs={<BreadcrumbDark items={[{ label: 'Verification', href: '/verification' }, { label: `Request ${requestId.substring(0, 8)}...` }]} />}
        actions={
          <Link href="/verification" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', ...typeScale.body, fontWeight: 500 }}>
            &larr; Back to Queue
          </Link>
        }
      />

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {error && (
          <div style={{ padding: '10px 16px', background: colors.errBg, color: colors.err, borderRadius: radii.sm, marginBottom: 16, ...typeScale.body }}>
            {error}
          </div>
        )}

        {success && <p role="status" style={{ padding: 16, background: colors.okBg, color: colors.ok, borderRadius: radii.sm, ...typeScale.body }}>{success}</p>}

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
                      onClick={() => handleDownloadDoc(doc.id)}
                      disabled={downloadingDocId === doc.id}
                      style={{
                        padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                        background: '#1d5fa8', color: '#fff',
                        border: 'none', borderRadius: 4,
                        cursor: downloadingDocId === doc.id ? 'not-allowed' : 'pointer',
                        opacity: downloadingDocId === doc.id ? 0.6 : 1,
                        marginLeft: '8px',
                      }}
                    >{downloadingDocId === doc.id ? 'Preparing…' : 'Download'}</button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#5b6b74' }}>Organization: <strong style={{ color: '#0f3340' }}>{request?.org?.name || store.orgId}</strong></span>
                {orgStatusLoaded && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: orgDeactivated ? '#fef2f2' : '#d1fae5',
                    color: orgDeactivated ? '#991b1b' : '#065f46',
                    border: `1px solid ${orgDeactivated ? '#fca5a5' : '#6ee7b7'}`,
                  }}>
                    {orgDeactivated ? 'DEACTIVATED' : 'ACTIVE'}
                  </span>
                )}
              </div>
              {!canManageOrgs ? (
                <p style={{ fontSize: 13, color: '#8a9ba5', margin: 0 }}>
                  Deactivation controls require the <code style={{ background: '#eef2f5', padding: '1px 5px', borderRadius: 3 }}>admin:users:write</code> permission.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#5b6b74', marginBottom: 12 }}>
                    Deactivate the merchant organization to revoke platform write access. Data is preserved but store, catalog, document and verification operations are blocked.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!orgDeactivated ? (
                      <button
                        onClick={() => setConfirmAction('deactivate')}
                        disabled={deactivating}
                        style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: deactivating ? 'not-allowed' : 'pointer' }}
                      >
                        {deactivating ? 'Deactivating…' : 'Deactivate Merchant'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmAction('reactivate')}
                        disabled={deactivating}
                        style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: deactivating ? 'not-allowed' : 'pointer' }}
                      >
                        {deactivating ? 'Reactivating…' : 'Reactivate Merchant'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Deactivation confirmation modal (G15) */}
      {confirmAction && (
        <Modal
          open
          title={confirmAction === 'deactivate' ? 'Deactivate Merchant Organization' : 'Reactivate Merchant Organization'}
          onClose={() => setConfirmAction(null)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setConfirmAction(null)} disabled={deactivating}>Cancel</Button>
              <Button
                variant={confirmAction === 'deactivate' ? 'danger' : 'primary'}
                onClick={confirmAction === 'deactivate' ? handleDeactivateOrg : handleReactivateOrg}
                disabled={deactivating}
              >
                {deactivating ? 'Working…' : confirmAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          }
        >
          <p style={{ ...typeScale.body, color: colors.muted, marginBottom: 0, lineHeight: 1.5 }}>
            {confirmAction === 'deactivate'
              ? <>Are you sure you want to deactivate <strong style={{ color: colors.brand[700] }}>{request?.org?.name || 'this organization'}</strong>? The merchant will immediately lose write access to stores, catalog, documents and verification. Data is preserved and can be restored by reactivating.</>
              : <>Reactivate <strong style={{ color: colors.brand[700] }}>{request?.org?.name || 'this organization'}</strong>? The merchant will regain full platform access.</>}
          </p>
        </Modal>
      )}
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
