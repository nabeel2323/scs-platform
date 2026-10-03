'use client';

/**
 * M7.3-B.6 — Admin Ship Operations: shipment detail console.
 *
 * Full operations surface for a single shipment:
 *   Overview · Timeline · Exceptions & RTS · Carrier & Labels
 *
 * Exposes the already-verified B.4/B.5 backend: exception report/retry,
 * RTS request/approve/reject/complete, LOST atomic resolution, carrier
 * create/cancel and M7.2.3-C recovery — all behind write permissions,
 * with the shipment event timeline as the audit trail.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRequirePerms, AccessDenied } from '../../../hooks/useRequirePerms';
import { useAdminResource } from '../../../hooks/useAdminTable';
import { useAdminMutation } from '../../../components/EntityActions';
import {
  ShipDetail,
  EXCEPTION_TYPES,
} from '../../../lib/shipops';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminStatusDot,
  AdminEntityLink,
  AdminAuditTimeline,
  AdminRelatedTable,
  AdminErrorState,
  AdminEmptyState,
  AdminLoadingSkeleton,
  formatDate,
  type KVItem,
  type RelatedColumn,
} from '../../../components/detail';

type Tone = 'ok' | 'warn' | 'err' | 'info' | 'muted';
function statusTone(s: string): Tone {
  if (s === 'DELIVERED') return 'ok';
  if (s === 'CANCELLED') return 'err';
  if (s === 'PREPARING' || s === 'READY_FOR_PICKUP') return 'warn';
  return 'info';
}
function exceptionTone(s: string | null): Tone {
  if (!s) return 'muted';
  if (['RESOLVED', 'CLOSED', 'RTS_COMPLETED'].includes(s)) return 'ok';
  if (s.startsWith('RTS_')) return 'info';
  if (s === 'OPEN' || s === 'RETRY_PENDING') return 'err';
  return 'warn';
}
function carrierTone(s: string | null): Tone {
  if (!s) return 'muted';
  if (s === 'SUCCESS') return 'ok';
  if (['FAILED', 'RECOVERY_REQUIRED', 'RECONCILIATION_REQUIRED'].includes(s)) return 'err';
  if (['IN_PROGRESS', 'PENDING', 'UNKNOWN'].includes(s)) return 'warn';
  return 'info';
}

function ShipmentDetailConsole({ id }: { id: string }) {
  const { hasAccess: canRead } = useRequirePerms(['fulfillment:shipments:read']);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('overview');
  useEffect(() => setReady(true), []);

  const detail = useAdminResource<ShipDetail>(canRead ? `shipments/${encodeURIComponent(id)}` : null, ready && canRead);

  if (!ready) return <div style={{ padding: 32 }}><AdminLoadingSkeleton kvRows={6} /></div>;
  if (!canRead) return <div style={{ padding: 32 }}><AccessDenied requiredPerms={['fulfillment:shipments:read']} missingPerms={['fulfillment:shipments:read']} /></div>;
  if (detail.loading) return <div style={{ padding: 32 }}><AdminLoadingSkeleton kvRows={8} /></div>;
  if (detail.error) return <div style={{ padding: 32 }}><AdminErrorState title="Unable to load shipment" message={detail.error} onRetry={detail.reload} /></div>;
  const d = detail.data;
  if (!d) return null;

  const s = d.shipment as unknown as Record<string, unknown> & { status: string };
  const asStr = (k: string) => (s[k] == null ? null : String(s[k]));
  const exceptionStatus = asStr('exceptionStatus');
  const exceptionType = asStr('exceptionType');
  const isRts = !!exceptionStatus && exceptionStatus.startsWith('RTS_');

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline', count: d.events.length },
    { key: 'exceptions', label: 'Exceptions & RTS' },
    { key: 'carrier', label: 'Carrier & Labels', count: d.labels.length },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Ship Operations', href: '/shipments' }]}
        backLabel="Back to Shipments"
        backHref="/shipments"
        title={`Shipment ${id.slice(0, 10)}`}
        subtitle={
          <>
            {d.store && <AdminEntityLink type="merchant" id={d.store.id} name={d.store.displayName} showIcon />}
            <span style={{ color: '#d9e2e6' }}> · </span>
            {exceptionStatus ? <AdminStatusDot status={exceptionStatus} color={exceptionTone(exceptionStatus)} /> : <span>no exception</span>}
          </>
        }
        status={String(s['status'])}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={tab} onChange={setTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {tab === 'overview' && (
          <AdminDetailSection title="Shipment">
            <AdminKeyValueGrid items={overviewItems(d)} />
          </AdminDetailSection>
        )}

        {tab === 'timeline' && (
          <AdminDetailSection title="Status timeline" description="Append-only shipment events (audit trail).">
            <AdminAuditTimeline
              entries={d.events.map((e) => ({
                id: e.id,
                timestamp: e.createdAt,
                action: e.eventType,
                actor: e.actorUserId || (e.carrierEventCode ? `carrier:${e.carrierEventCode}` : 'system'),
                actorType: e.actorType,
                detail: e.notes || e.locationText || undefined,
              }))}
            />
          </AdminDetailSection>
        )}

        {tab === 'exceptions' && (
          <>
            <AdminDetailSection title="Delivery exception">
              <AdminKeyValueGrid
                items={[
                  { key: 'exceptionStatus', label: 'State', value: exceptionStatus ? <AdminStatusDot status={exceptionStatus} color={exceptionTone(exceptionStatus)} /> : <span style={{ color: '#5b6b74' }}>No exception</span> },
                  { key: 'exceptionType', label: 'Type', value: exceptionType || '—' },
                  { key: 'exceptionAt', label: 'Raised', value: formatDate(asStr('exceptionAt')) },
                  { key: 'exceptionNotes', label: 'Notes', value: asStr('exceptionNotes') || '—' },
                  { key: 'attempts', label: 'Delivery attempts', value: `${d.shipment.deliveryAttempts} / ${d.shipment.maxDeliveryAttempts}` },
                ]}
              />
            </AdminDetailSection>
            <ExceptionActionsPanel id={id} exceptionStatus={exceptionStatus} exceptionType={exceptionType} onDone={detail.reload} />
            <RtsActionsPanel id={id} exceptionStatus={exceptionStatus} exceptionType={exceptionType} onDone={detail.reload} />
          </>
        )}

        {tab === 'carrier' && (
          <>
            <AdminDetailSection title="Carrier state">
              <AdminKeyValueGrid
                items={[
                  { key: 'provider', label: 'Provider', value: d.shipment.shippingProviderKey || '—' },
                  { key: 'carrierShipmentId', label: 'Carrier shipment', value: d.shipment.carrierShipmentId || '—' },
                  { key: 'carrierTrackingId', label: 'Tracking', value: d.shipment.carrierTrackingId || '—' },
                  { key: 'carrierCreateStatus', label: 'Create status', value: <AdminStatusDot status={d.shipment.carrierCreateStatus || 'NONE'} color={carrierTone(d.shipment.carrierCreateStatus)} /> },
                  { key: 'carrierCreateRetries', label: 'Create retries', value: String(d.shipment.carrierCreateRetries) },
                  { key: 'carrierCancelStatus', label: 'Cancel status', value: <AdminStatusDot status={d.shipment.carrierCancelStatus || 'NONE'} color={carrierTone(d.shipment.carrierCancelStatus)} /> },
                  { key: 'recoveryStatus', label: 'Recovery', value: asStr('recoveryStatus') || '—' },
                  { key: 'carrierStatusMapped', label: 'Mapped status', value: d.shipment.carrierStatusMapped || '—' },
                ]}
              />
            </AdminDetailSection>

            <CarrierActionsPanel
              id={id}
              carrierCreateStatus={d.shipment.carrierCreateStatus}
              cancelled={!!d.shipment.cancelledAt}
              recoverable={isRecoverable(d.shipment)}
              onDone={detail.reload}
            />

            <AdminDetailSection title="Labels" bare>
              <LabelsTable labels={d.labels} />
            </AdminDetailSection>

            {isRts && (
              <AdminDetailSection title="Return-to-Sender">
                <p style={{ margin: 0, fontSize: 13, color: '#5b6b74' }}>
                  This shipment is in an RTS cycle (<strong>{exceptionStatus}</strong>). Manage it from the Exceptions &amp; RTS tab.
                </p>
              </AdminDetailSection>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function overviewItems(d: ShipDetail): KVItem[] {
  const s = d.shipment as unknown as Record<string, unknown>;
  return [
    { key: 'status', label: 'Shipment status', value: <AdminStatusBadge status={String(s['status'])} /> },
    { key: 'order', label: 'Order', value: d.order ? <AdminEntityLink type="order" id={d.order.id} name={d.order.id.slice(0, 12) + '…'} showIcon /> : '—' },
    { key: 'orderStatus', label: 'Order status', value: d.order ? <AdminStatusBadge status={d.order.status} /> : '—' },
    { key: 'store', label: 'Store', value: d.store ? <AdminEntityLink type="merchant" id={d.store.id} name={d.store.displayName} showIcon /> : '—' },
    { key: 'provider', label: 'Provider', value: String(s['shippingProviderKey'] || '—') },
    { key: 'attempts', label: 'Delivery attempts', value: `${d.shipment.deliveryAttempts} / ${d.shipment.maxDeliveryAttempts}` },
    { key: 'pickedUp', label: 'Picked up', value: formatDate(d.shipment.pickedUpAt) },
    { key: 'outForDelivery', label: 'Out for delivery', value: formatDate(d.shipment.outForDeliveryAt) },
    { key: 'delivered', label: 'Delivered', value: formatDate(d.shipment.deliveredAt) },
    { key: 'cancelled', label: 'Cancelled', value: formatDate(d.shipment.cancelledAt) },
    { key: 'createdAt', label: 'Created', value: formatDate(d.shipment.createdAt) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(d.shipment.updatedAt) },
  ];
}

function isRecoverable(s: { carrierCreateStatus: string | null; carrierCancelStatus: string | null }): boolean {
  return ['PENDING', 'IN_PROGRESS', 'FAILED', 'RECOVERY_REQUIRED'].includes(s.carrierCreateStatus || '')
    || ['UNKNOWN', 'RECONCILIATION_REQUIRED'].includes(s.carrierCancelStatus || '');
}

// ── Exception actions (report / retry) ───────────────────────
function ExceptionActionsPanel({ id, exceptionStatus, exceptionType, onDone }: {
  id: string; exceptionStatus: string | null; exceptionType: string | null; onDone: () => void;
}) {
  const { hasAccess } = useRequirePerms(['fulfillment:shipments:write']);
  const action = useAdminMutation(onDone);
  const [type, setType] = useState(exceptionType || EXCEPTION_TYPES[0]);
  const [notes, setNotes] = useState('');
  if (!hasAccess) return null;
  const canRetry = exceptionStatus === 'OPEN' || exceptionStatus === 'RETRY_PENDING';
  return (
    <AdminDetailSection title="Exception actions">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={field}>
            {EXCEPTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...field, minWidth: 240 }} />
          <button
            type="button"
            disabled={action.busy}
            style={btn}
            onClick={() => action.run(`shipments/${encodeURIComponent(id)}/exception`, 'POST', { exceptionType: type, notes: notes.trim() || undefined })}
          >Report exception</button>
          {canRetry && (
            <button
              type="button"
              disabled={action.busy}
              style={{ ...btn, background: '#1b7a4b', borderColor: '#1b7a4b', color: '#fff' }}
              onClick={() => { if (window.confirm('Authorize another delivery attempt?')) action.run(`shipments/${encodeURIComponent(id)}/retry`, 'POST'); }}
            >Authorize retry</button>
          )}
        </div>
        <ActionError error={action.error} />
      </div>
    </AdminDetailSection>
  );
}

// ── RTS lifecycle actions ────────────────────────────────────
function RtsActionsPanel({ id, exceptionStatus, exceptionType, onDone }: {
  id: string; exceptionStatus: string | null; exceptionType: string | null; onDone: () => void;
}) {
  const { hasAccess } = useRequirePerms(['fulfillment:shipments:write']);
  const action = useAdminMutation(onDone);
  const [notes, setNotes] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  if (!hasAccess) return null;

  const rtsState = exceptionStatus && exceptionStatus.startsWith('RTS_') ? exceptionStatus : null;
  const isLost = exceptionType === 'LOST';

  return (
    <AdminDetailSection title="Return-to-Sender">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!rtsState && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isLost ? 'LOST justification (required)' : 'RTS request notes (optional)'} style={{ ...field, minWidth: 260 }} />
            <button
              type="button"
              disabled={action.busy || (isLost && !notes.trim())}
              style={{ ...btn, background: '#1d5fa8', borderColor: '#1d5fa8', color: '#fff' }}
              onClick={() => action.run(`shipments/${encodeURIComponent(id)}/rts`, 'POST', { notes: notes.trim() || undefined })}
            >
              {isLost ? 'Resolve as LOST (auto-approve RTS)' : 'Request RTS'}
            </button>
          </div>
        )}

        {rtsState === 'RTS_PENDING' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#5b6b74' }}>RTS requested — awaiting decision.</span>
            <button type="button" disabled={action.busy} style={{ ...btn, background: '#1b7a4b', borderColor: '#1b7a4b', color: '#fff' }}
              onClick={() => { if (window.confirm('Approve this return-to-sender?')) action.run(`shipments/${encodeURIComponent(id)}/rts/approve`, 'POST'); }}>
              Approve RTS</button>
            <input value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Rejection reason (required)" style={{ ...field, minWidth: 220 }} />
            <button type="button" disabled={action.busy || !rejectNotes.trim()} style={btn}
              onClick={() => action.run(`shipments/${encodeURIComponent(id)}/rts/reject`, 'POST', { notes: rejectNotes.trim() })}>
              Reject RTS</button>
          </div>
        )}

        {rtsState === 'RTS_IN_PROGRESS' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#5b6b74' }}>RTS approved — return in transit to sender.</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Completion notes (optional)" style={{ ...field, minWidth: 240 }} />
            <button type="button" disabled={action.busy} style={{ ...btn, background: '#1b7a4b', borderColor: '#1b7a4b', color: '#fff' }}
              onClick={() => { if (window.confirm('Confirm the physical return is complete?')) action.run(`shipments/${encodeURIComponent(id)}/rts/complete`, 'POST', { notes: notes.trim() || undefined }); }}>
              Complete RTS</button>
          </div>
        )}

        {rtsState === 'RTS_COMPLETED' && (
          <p style={{ margin: 0, fontSize: 13, color: '#1b7a4b' }}>RTS completed. No further action required.</p>
        )}

        <ActionError error={action.error} />
      </div>
    </AdminDetailSection>
  );
}

// ── Carrier create / cancel / recover actions ────────────────
function CarrierActionsPanel({ id, carrierCreateStatus, cancelled, recoverable, onDone }: {
  id: string; carrierCreateStatus: string | null; cancelled: boolean; recoverable: boolean; onDone: () => void;
}) {
  const { hasAccess: canWrite } = useRequirePerms(['fulfillment:shipments:write']);
  const { hasAccess: canRecover } = useRequirePerms(['admin:shipping:recovery']);
  const action = useAdminMutation(onDone);
  const [reason, setReason] = useState('');
  if (!canWrite && !canRecover) return null;

  return (
    <AdminDetailSection title="Carrier operations">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {canWrite && carrierCreateStatus !== 'SUCCESS' && !cancelled && (
            <button type="button" disabled={action.busy} style={{ ...btn, background: '#1d5fa8', borderColor: '#1d5fa8', color: '#fff' }}
              onClick={() => action.run(`shipments/${encodeURIComponent(id)}/create`, 'POST')}>
              Queue carrier create</button>
          )}
          {canWrite && !cancelled && (
            <>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cancellation reason" style={{ ...field, minWidth: 200 }} />
              <button type="button" disabled={action.busy} style={btn}
                onClick={() => action.run(`shipments/${encodeURIComponent(id)}/cancel`, 'POST', { reason: reason.trim() || 'Cancelled by admin' })}>
                Cancel shipment</button>
            </>
          )}
          {canRecover && recoverable && (
            <button type="button" disabled={action.busy} style={{ ...btn, background: '#b45309', borderColor: '#b45309', color: '#fff' }}
              onClick={() => { if (window.confirm('Run carrier reconciliation for this shipment?')) action.run(`carrier/shipments/${encodeURIComponent(id)}/recover`, 'POST'); }}>
              Reconcile / recover</button>
          )}
        </div>
        {cancelled && <p style={{ margin: 0, fontSize: 13, color: '#b3372f' }}>This shipment has been cancelled.</p>}
        <ActionError error={action.error} />
      </div>
    </AdminDetailSection>
  );
}

function LabelsTable({ labels }: { labels: ShipDetail['labels'] }) {
  if (labels.length === 0) return <div style={{ padding: 16 }}><AdminEmptyState title="No labels" description="No carrier labels have been generated for this shipment." /></div>;
  const cols: RelatedColumn[] = [
    { key: 'labelNumber', label: 'Label #', render: (v) => v ? String(v) : '—' },
    { key: 'labelType', label: 'Type', render: (v) => v ? String(v) : '—' },
    { key: 'mimeType', label: 'MIME', render: (v) => v ? String(v) : '—' },
    { key: 'trackingUrl', label: 'Tracking', render: (v, row) => row['isVoid'] ? <span style={{ color: '#b3372f' }}>void</span> : v ? <a href={String(v)} target="_blank" rel="noreferrer" style={{ color: '#1e6178' }}>open ↗</a> : '—' },
    { key: 'storageKey', label: 'Storage key', render: (v) => v ? <code style={{ fontSize: 11 }}>{String(v)}</code> : '—' },
    { key: 'createdAt', label: 'Created', render: (v) => formatDate(v as string) },
  ];
  return <AdminRelatedTable columns={cols} data={labels as unknown as Record<string, unknown>[]} />;
}

function ActionError({ error }: { error: string }) {
  if (!error) return null;
  return <div style={{ padding: '8px 12px', background: '#fbeeec', color: '#b3372f', borderRadius: 6, fontSize: 13 }} role="alert">{error}</div>;
}

const field: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13,
  background: '#fff', color: '#0f3340', fontFamily: 'inherit',
};
const btn: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff',
  color: '#0f3340', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
};

export default function ShipmentDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<div style={{ padding: 32 }}><AdminLoadingSkeleton kvRows={6} /></div>}><ShipmentDetailConsole id={id} /></Suspense>;
}
