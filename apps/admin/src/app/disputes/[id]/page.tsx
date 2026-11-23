'use client';

/**
 * Dispute Detail Page — professional dispute detail view for Admin.
 *
 * Route: /disputes/[id]
 * Shows dispute information, parties, and resolution status.
 */
import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { adminRequest, type AdminRecord } from '../../../lib/api';
import { fetchDisputeEvents, type DisputeEventRecord } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminEntityLink,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  formatDate,
  formatCurrency,
  type KVItem,
} from '../../../components/detail';

function DisputeDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['support:disputes:resolve']);
  const [ready, setReady] = useState(false);
  const [dispute, setDispute] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [events, setEvents] = useState<DisputeEventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [resolution, setResolution] = useState('');
  const [resolutionSubmitting, setResolutionSubmitting] = useState(false);
  const [resolutionError, setResolutionError] = useState('');
  const [resolutionSuccess, setResolutionSuccess] = useState(false);
  const disputeRequestVersion = useRef(0);
  const eventsRequestVersion = useRef(0);

  useEffect(() => setReady(true), []);

  const loadDispute = useCallback(async () => {
    if (!ready || !hasAccess) return;
    const requestId = ++disputeRequestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await adminRequest<AdminRecord>(`admin/disputes/${encodeURIComponent(id)}`);
      if (requestId === disputeRequestVersion.current) setDispute(data);
    } catch (err) {
      if (requestId === disputeRequestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to load dispute');
      }
    } finally {
      if (requestId === disputeRequestVersion.current) setLoading(false);
    }
  }, [id, ready, hasAccess]);

  useEffect(() => {
    void loadDispute();
    return () => { disputeRequestVersion.current += 1; };
  }, [loadDispute]);

  const handleResolve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedResolution = resolution.trim();
    if (!hasAccess || !normalizedResolution || resolutionSubmitting) return;

    setResolutionSubmitting(true);
    setResolutionError('');
    setResolutionSuccess(false);
    try {
      await adminRequest(`disputes/${encodeURIComponent(id)}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: normalizedResolution }),
      });
      setResolutionSuccess(true);
      setResolution('');
      await loadDispute();
    } catch (err) {
      setResolutionError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setResolutionSubmitting(false);
    }
  };

  const loadEvents = useCallback(async () => {
    if (activeTab !== 'events' || !id) return;
    const requestId = ++eventsRequestVersion.current;
    setEventsLoading(true);
    setEventsError('');
    setEvents([]);
    try {
      const data = await fetchDisputeEvents(id);
      if (requestId === eventsRequestVersion.current) setEvents(data);
    } catch (err) {
      if (requestId === eventsRequestVersion.current) {
        setEventsError(err instanceof Error ? err.message : 'Failed to load events');
      }
    } finally {
      if (requestId === eventsRequestVersion.current) setEventsLoading(false);
    }
  }, [activeTab, id]);

  useEffect(() => {
    void loadEvents();
    return () => { eventsRequestVersion.current += 1; };
  }, [loadEvents]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess)
    return (
      <div style={{ padding: 32, color: '#991b1b' }}>
        Access denied. Required: support:disputes:resolve
      </div>
    );
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load dispute" message={error} onRetry={loadDispute} />;
  if (!dispute) return null;

  const status = String(dispute['status'] || '');
  const orderId = dispute['orderId'] as string | null;
  const buyerId = dispute['buyerId'] as string | null;
  const merchantId = dispute['merchantId'] as string | null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'events', label: 'Events & Evidence' },
    { key: 'technical', label: 'Technical' },
  ];

  const overviewItems: KVItem[] = [
    {
      key: 'status',
      label: 'Status',
      value: status ? <AdminStatusBadge status={status} /> : 'Not set',
    },
    {
      key: 'reason',
      label: 'Reason',
      value: String(dispute['reason'] || dispute['disputeReason'] || '—'),
    },
    {
      key: 'orderId',
      label: 'Order',
      value: orderId ? (
        <AdminEntityLink type="order" id={orderId} name={orderId.slice(0, 12) + '…'} showIcon />
      ) : (
        'Not linked'
      ),
    },
    {
      key: 'buyerId',
      label: 'Buyer',
      value: buyerId ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{buyerId}</span>
          <AdminCopyButton value={buyerId} label="" />
        </span>
      ) : (
        '—'
      ),
    },
    {
      key: 'merchantId',
      label: 'Merchant',
      value: merchantId ? (
        <AdminEntityLink
          type="merchant"
          id={merchantId}
          name={String(dispute['merchantName'] || merchantId.slice(0, 12) + '…')}
          showIcon
        />
      ) : (
        '—'
      ),
    },
    {
      key: 'amountMinor',
      label: 'Disputed Amount',
      value:
        dispute['amountMinor'] != null
          ? formatCurrency(dispute['amountMinor'] as number, String(dispute['currency'] || 'SAR'))
          : '—',
    },
    { key: 'createdAt', label: 'Opened', value: formatDate(dispute['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(dispute['updatedAt'] as string) },
    { key: 'resolvedAt', label: 'Resolved', value: formatDate(dispute['resolvedAt'] as string) },
  ];

  const technicalItems: KVItem[] = [
    {
      key: 'id',
      label: 'Dispute ID',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
          <AdminCopyButton value={id} label="" />
        </span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      value: String(dispute['description'] || dispute['notes'] || '—'),
    },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Disputes', href: '/disputes' }]}
        backLabel="Back to Disputes"
        backHref="/disputes"
        title={`Dispute #${id.slice(0, 12)}`}
        subtitle={
          <>
            {status && <span>{status}</span>}
            {dispute['amountMinor'] != null && (
              <>
                <span style={{ color: '#d9e2e6' }}> · </span>
                <span>
                  {formatCurrency(
                    dispute['amountMinor'] as number,
                    String(dispute['currency'] || 'SAR'),
                  )}
                </span>
              </>
            )}
          </>
        }
        status={status}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <>
            <AdminDetailSection title="Dispute Information">
              <AdminKeyValueGrid items={overviewItems} />
            </AdminDetailSection>
            <AdminDetailSection title="Resolution">
              {status === 'RESOLVED' || status === 'CLOSED' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <AdminStatusBadge status={status} />
                  <p style={{ margin: 0, color: '#374151', fontSize: 14, whiteSpace: 'pre-wrap' }}>
                    {String(dispute['resolution'] || 'No resolution note was recorded.')}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleResolve} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                    Record the decision and supporting explanation. Resolving a dispute is final.
                  </p>
                  <label htmlFor="dispute-resolution" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    Resolution
                  </label>
                  <textarea
                    id="dispute-resolution"
                    aria-label="Resolution"
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    maxLength={4000}
                    rows={5}
                    required
                    placeholder="Describe the resolution decision and its rationale…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid #cbd5e1', borderRadius: 8, font: 'inherit', resize: 'vertical' }}
                  />
                  {resolutionError && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>{resolutionError}</p>}
                  {resolutionSuccess && <p role="status" style={{ margin: 0, color: '#047857', fontSize: 13 }}>Dispute resolution submitted.</p>}
                  <div>
                    <button
                      type="submit"
                      disabled={resolutionSubmitting || !resolution.trim()}
                      style={{ padding: '9px 16px', border: 'none', borderRadius: 6, background: '#1e6178', color: '#fff', fontWeight: 600, cursor: resolutionSubmitting || !resolution.trim() ? 'not-allowed' : 'pointer', opacity: resolutionSubmitting || !resolution.trim() ? 0.6 : 1 }}
                    >
                      {resolutionSubmitting ? 'Resolving…' : 'Resolve dispute'}
                    </button>
                  </div>
                </form>
              )}
            </AdminDetailSection>
          </>
        )}

        {activeTab === 'technical' && (
          <AdminDetailSection title="Technical Details">
            <AdminKeyValueGrid items={technicalItems} columns={1} />
          </AdminDetailSection>
        )}

        {activeTab === 'events' && (
          <AdminDetailSection title="Events & Evidence Timeline">
            {eventsLoading && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading events…</div>
            )}
            {eventsError && (
              <AdminErrorState title="Unable to load dispute events" message={eventsError} onRetry={loadEvents} />
            )}
            {!eventsLoading && !eventsError && events.length === 0 && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>
                No events recorded for this dispute.
              </div>
            )}
            {!eventsError && events.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {events.map((ev, idx) => {
                  const isEvidence = ev.type === 'EVIDENCE' || ev.type === 'evidence';
                  const isResolution = ev.type === 'RESOLVED' || ev.type === 'resolved';
                  const bgColor = isResolution
                    ? '#ecfdf5'
                    : isEvidence
                      ? '#eff6ff'
                      : idx % 2 === 0
                        ? '#f9fafb'
                        : '#fff';
                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: '12px 16px',
                        background: bgColor,
                        borderLeft: `3px solid ${isResolution ? '#10b981' : isEvidence ? '#3b82f6' : '#d1d5db'}`,
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: isResolution
                              ? '#d1fae5'
                              : isEvidence
                                ? '#dbeafe'
                                : '#e5e7eb',
                            color: isResolution ? '#065f46' : isEvidence ? '#1e40af' : '#374151',
                          }}
                        >
                          {ev.type}
                        </span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          {formatDate(ev.createdAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#1f2937', marginTop: 4 }}>{ev.body}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                        By:{' '}
                        <span style={{ fontFamily: 'monospace' }}>
                          {ev.submittedBy?.slice(0, 12) || 'system'}
                          {ev.submittedBy?.length > 12 ? '…' : ''}
                        </span>
                      </div>
                      {ev.attachments && ev.attachments.length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                          Attachments: {ev.attachments.length} file(s)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function DisputeDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return (
    <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}>
      <DisputeDetailContent id={id} />
    </Suspense>
  );
}
