'use client';

/**
 * M7.3-B.6 — Merchant Delivery Operations: per-shipment console.
 *
 * Exposes the merchant-facing slice of the already-built shipment lifecycle:
 * carrier label creation, cancellation, tracking timeline, delivery-exception
 * reporting/retry and the return-to-sender (RTS) request/lifecycle. Reconciliation
 * and carrier recovery are platform-only and intentionally omitted here.
 *
 * Everything the merchant needs to operate delivery is reachable through this UI;
 * no direct API usage is required.
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../components/AuthProvider';
import { isMerchantRole } from '../../../../lib/auth';
import {
  ShipDetail, getShipmentDetail, createCarrierShipment, cancelShipment,
  reportException, retryShipment, requestRTS, completeRTS,
  EXCEPTION_TYPES, exceptionLabel, isRtsStatus,
} from '../../../../lib/shipops';
import { PageHeader, Breadcrumb } from '@scs/ui-kit';
import { StatusBadge, LoadingSpinner, ErrorBanner, formatDate } from '../../../../components/Shared';

type ActionFn = () => Promise<unknown>;

export default function MerchantDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<ShipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const [exceptionType, setExceptionType] = useState<string>(EXCEPTION_TYPES[0]);
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [rtsNotes, setRtsNotes] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getShipmentDetail(id)
      .then((d) => setDetail(d))
      .catch((e: any) => setError(e?.message || 'Failed to load delivery'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace(`/auth/login?redirect=/merchant/deliveries/${id}`); return; }
    if (!isMerchantRole(user?.role)) { router.replace('/search'); return; }
    load();
  }, [authLoading, user, router, id, load]);

  const run = async (fn: ActionFn) => {
    setBusy(true);
    setActionError('');
    try {
      await fn();
      load();
    } catch (e: any) {
      setActionError(e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || (loading && !detail)) return <LoadingSpinner />;
  if (!detail) return <div style={{ padding: 24 }}><ErrorBanner message={error || 'Delivery not found'} onRetry={load} /></div>;

  const s = detail.shipment;
  const canCreateCarrier = !s.carrierShipmentId && s.carrierCreateStatus !== 'SUCCESS' && s.status !== 'CANCELLED';
  const canCancel = s.status === 'PREPARING' || s.status === 'READY_FOR_PICKUP' || s.status === 'PICKED_UP';
  const canReportException = !!s.exceptionStatus ? s.exceptionStatus === 'RESOLVED' || s.exceptionStatus === 'CLOSED' || isRtsStatus(s.exceptionStatus) : true;
  const canRetry = s.exceptionStatus === 'OPEN' || s.exceptionStatus === 'RETRY_PENDING';
  const canRequestRts = s.exceptionStatus === 'OPEN' || s.exceptionStatus === 'RETRY_PENDING' || s.exceptionStatus === 'RTS_PENDING';
  const canCompleteRts = s.exceptionStatus === 'RTS_IN_PROGRESS';

  const labels = detail.labels ?? [];
  const events = [...(detail.events ?? [])].sort((a, b) => a.sequence - b.sequence);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title={`Delivery ${s.id.slice(0, 8)}`}
        subtitle={detail.store?.displayName ? `Store: ${detail.store.displayName}` : 'Delivery operations'}
        breadcrumbs={<Breadcrumb items={[{ label: 'Deliveries', href: '/merchant/deliveries' }, { label: s.id.slice(0, 8) }]} />}
      />
      <div style={{ padding: '20px 24px 48px', display: 'grid', gap: 20 }}>
        {error && <ErrorBanner message={error} onRetry={load} />}

        {/* Overview */}
        <section style={card}>
          <h2 style={h2}>Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <Field label="Status"><StatusBadge status={s.status} /></Field>
            <Field label="Order">
              {detail.order ? <Link href={`/merchant/orders/${detail.order.id}`} style={link}>{detail.order.status} · {detail.order.id.slice(0, 8)}</Link> : '—'}
            </Field>
            <Field label="Exception">{s.exceptionStatus ? exceptionLabel(s.exceptionStatus, s.exceptionType) : <Muted>None</Muted>}</Field>
            <Field label="Carrier">{s.shippingProviderKey || <Muted>Not booked</Muted>}</Field>
            <Field label="Tracking #">{s.carrierTrackingId || <Muted>—</Muted>}</Field>
            <Field label="Carrier status">{s.carrierStatusMapped || s.carrierCreateStatus || <Muted>—</Muted>}</Field>
            <Field label="Delivery attempts">{s.deliveryAttempts}/{s.maxDeliveryAttempts}</Field>
            <Field label="Delivered">{s.deliveredAt ? formatDate(s.deliveredAt) : <Muted>—</Muted>}</Field>
          </div>
        </section>

        {/* Actions */}
        <section style={card}>
          <h2 style={h2}>Operations</h2>
          {actionError && <div role="alert" style={alert}>{actionError}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {canCreateCarrier && (
              <button disabled={busy} onClick={() => run(() => createCarrierShipment(s.id))} style={primaryBtn}>
                Create carrier shipment
              </button>
            )}
            {canCancel && (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Cancel reason" style={input} />
                <button disabled={busy || !cancelReason.trim()} onClick={() => run(() => cancelShipment(s.id, cancelReason.trim()))} style={dangerBtn}>Cancel</button>
              </span>
            )}
            {canRetry && (
              <button disabled={busy} onClick={() => run(() => retryShipment(s.id))} style={primaryBtn}>Retry delivery</button>
            )}
          </div>

          {canReportException && (
            <div style={{ marginTop: 16 }}>
              <p style={hint}>Report a delivery exception</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <select value={exceptionType} onChange={(e) => setExceptionType(e.target.value)} style={input}>
                  {EXCEPTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <input value={exceptionNotes} onChange={(e) => setExceptionNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...input, flex: 1, minWidth: 180 }} />
                <button disabled={busy} onClick={() => run(() => reportException(s.id, exceptionType, exceptionNotes.trim() || undefined).then(() => setExceptionNotes('')))} style={secondaryBtn}>Report exception</button>
              </div>
            </div>
          )}

          {canRequestRts && (
            <div style={{ marginTop: 16 }}>
              <p style={hint}>Request return-to-sender</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input value={rtsNotes} onChange={(e) => setRtsNotes(e.target.value)} placeholder="RTS notes (optional)" style={{ ...input, flex: 1, minWidth: 180 }} />
                <button disabled={busy} onClick={() => run(() => requestRTS(s.id, rtsNotes.trim() || undefined).then(() => setRtsNotes('')))} style={secondaryBtn}>Request RTS</button>
              </div>
            </div>
          )}

          {canCompleteRts && (
            <div style={{ marginTop: 16 }}>
              <p style={hint}>Return in progress — confirm completion once the parcel is back.</p>
              <button disabled={busy} onClick={() => run(() => completeRTS(s.id))} style={secondaryBtn}>Mark RTS complete</button>
            </div>
          )}

          {s.status === 'CANCELLED' && <p style={hint}>This delivery was cancelled{s.cancelledAt ? ` on ${formatDate(s.cancelledAt)}` : ''}.</p>}
        </section>

        {/* Labels */}
        <section style={card}>
          <h2 style={h2}>Labels</h2>
          {labels.length === 0 ? (
            <p style={hint}>No labels yet. Create the carrier shipment to generate a label.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    {['Number', 'Type', 'Tracking URL', 'Void', 'Created'].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((l) => (
                    <tr key={l.id} style={tr}>
                      <td style={td}>{l.labelNumber || '—'}</td>
                      <td style={td}>{l.labelType || '—'}</td>
                      <td style={td}>
                        {l.trackingUrl ? <a href={l.trackingUrl} target="_blank" rel="noreferrer" style={link}>Open</a> : '—'}
                        {l.storageKey && <a href={`/v1/shipments/${s.id}/labels`} onClick={(e) => e.preventDefault()} style={{ ...link, marginLeft: 8 }}>Files</a>}
                      </td>
                      <td style={td}>{l.isVoid ? 'Void' : 'Active'}</td>
                      <td style={td}>{formatDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Timeline */}
        <section style={card}>
          <h2 style={h2}>Tracking timeline</h2>
          {events.length === 0 ? (
            <p style={hint}>No tracking events recorded yet.</p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {events.map((ev) => (
                <li key={ev.id} style={{ borderBottom: '1px solid #eef3f5', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{ev.eventType.replace(/_/g, ' ')}</strong>
                    <span style={{ fontSize: 12, color: '#5b6b74' }}>{formatDate(ev.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#5b6b74', marginTop: 2 }}>
                    {ev.actorType}{ev.locationText ? ` · ${ev.locationText}` : ''}{ev.notes ? ` — ${ev.notes}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#8a97a0' }}>{children}</span>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: '16px 18px' };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#0f3340' };
const hint: React.CSSProperties = { fontSize: 12, color: '#5b6b74', margin: '0 0 6px' };
const alert: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#991b1b' };
const input: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid #1e6178', background: '#1e6178', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid #1e6178', background: '#fff', color: '#1e6178', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const dangerBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid #d4634f', background: '#fff', color: '#b7412e', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const link: React.CSSProperties = { color: '#1e6178', textDecoration: 'none', fontSize: 13 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: '#f7fafb', textAlign: 'left' };
const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, color: '#0f3340', whiteSpace: 'nowrap' };
const tr: React.CSSProperties = { borderTop: '1px solid #eef3f5' };
const td: React.CSSProperties = { padding: '8px 12px' };
