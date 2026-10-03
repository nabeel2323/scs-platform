'use client';

/**
 * M7.3-B.6 — Admin Ship Operations: carrier configuration & recovery.
 *
 * Read-only visibility into per-organization carrier credentials and
 * configurations, plus the platform carrier-recovery queue with a
 * reconciliation trigger for each stuck shipment.
 *
 * Permissions: admin:carrier:read (config visibility),
 *              admin:shipping:recovery (recovery queue + recover action).
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequirePerms, AccessDenied } from '../../hooks/useRequirePerms';
import { useAdminResource } from '../../hooks/useAdminTable';
import { useAdminMutation } from '../../components/EntityActions';
import {
  CarrierCredential,
  CarrierConfiguration,
  RecoveryQueueRow,
} from '../../lib/shipops';
import { AdminOrg } from '../../lib/api';
import {
  AdminStatusDot,
  AdminDetailSection,
  AdminRelatedTable,
  AdminEmptyState,
  AdminErrorState,
  formatDate,
  type RelatedColumn,
} from '../../components/detail';
import { SkeletonTable } from '@scs/ui-kit';

type Tone = 'ok' | 'warn' | 'err' | 'info' | 'muted';
function carrierTone(s: string | null | undefined): Tone {
  if (!s) return 'muted';
  if (s === 'SUCCESS') return 'ok';
  if (['FAILED', 'RECOVERY_REQUIRED', 'RECONCILIATION_REQUIRED'].includes(s)) return 'err';
  if (['IN_PROGRESS', 'PENDING', 'UNKNOWN'].includes(s)) return 'warn';
  return 'info';
}

function CarrierConsole() {
  const { hasAccess: canReadCarrier } = useRequirePerms(['admin:carrier:read']);
  const { hasAccess: canRecover } = useRequirePerms(['admin:shipping:recovery']);
  const [ready, setReady] = useState(false);
  const [orgId, setOrgId] = useState('');
  useEffect(() => setReady(true), []);

  const orgs = useAdminResource<AdminOrg[]>(ready && canReadCarrier ? 'admin/organizations' : null, ready && canReadCarrier);
  const credentials = useAdminResource<{ credentials: CarrierCredential[] }>(
    orgId && canReadCarrier ? `carrier/credentials?orgId=${encodeURIComponent(orgId)}` : null, ready && canReadCarrier);
  const configs = useAdminResource<{ configurations: CarrierConfiguration[] }>(
    orgId && canReadCarrier ? `carrier/configurations?orgId=${encodeURIComponent(orgId)}` : null, ready && canReadCarrier);
  const queue = useAdminResource<{ queue: RecoveryQueueRow[]; count: number }>(
    canRecover ? 'carrier/recovery/queue?limit=100' : null, ready && canRecover);

  if (!ready) return <div style={{ padding: 32 }}><SkeletonTable rows={5} cols={4} /></div>;
  if (!canReadCarrier && !canRecover) {
    return <div style={{ padding: 32 }}><AccessDenied requiredPerms={['admin:carrier:read']} missingPerms={['admin:carrier:read', 'admin:shipping:recovery']} /></div>;
  }

  return (
    <div style={{ padding: '0 0 48px' }}>
      <header style={{ padding: '24px 32px', borderBottom: '1px solid #e5eef1' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f3340' }}>Carrier Configuration &amp; Recovery</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#5b6b74' }}>
          Carrier credentials, per-organization routing configuration and the shipment recovery queue.
        </p>
      </header>

      <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {canReadCarrier && (
          <AdminDetailSection title="Organization">
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#5b6b74', maxWidth: 420 }}>
              Select organization to view carrier setup
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={field}>
                <option value="">Choose an organization…</option>
                {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
              </select>
            </label>
            {orgs.error && <AdminErrorState title="Unable to load organizations" message={orgs.error} onRetry={orgs.reload} />}
          </AdminDetailSection>
        )}

        {canReadCarrier && orgId && (
          <>
            <AdminDetailSection title="Carrier credentials" description="Secrets are masked and never returned in plaintext." bare>
              {credentials.loading ? <div style={{ padding: 16 }}><SkeletonTable rows={3} cols={4} /></div>
                : credentials.error ? <div style={{ padding: 16 }}><AdminErrorState message={credentials.error} onRetry={credentials.reload} /></div>
                : <CredentialTable rows={credentials.data?.credentials ?? []} />}
            </AdminDetailSection>

            <AdminDetailSection title="Carrier configurations" bare>
              {configs.loading ? <div style={{ padding: 16 }}><SkeletonTable rows={3} cols={5} /></div>
                : configs.error ? <div style={{ padding: 16 }}><AdminErrorState message={configs.error} onRetry={configs.reload} /></div>
                : <ConfigTable rows={configs.data?.configurations ?? []} />}
            </AdminDetailSection>
          </>
        )}

        {canRecover && (
          <AdminDetailSection title={`Recovery queue (${queue.data?.count ?? 0})`} description="Shipments with a stuck or uncertain carrier create/cancel lifecycle." bare>
            {queue.loading ? <div style={{ padding: 16 }}><SkeletonTable rows={4} cols={6} /></div>
              : queue.error ? <div style={{ padding: 16 }}><AdminErrorState message={queue.error} onRetry={queue.reload} /></div>
              : (queue.data?.queue.length ?? 0) === 0 ? <div style={{ padding: 16 }}><AdminEmptyState title="Recovery queue is clear" description="No shipments currently require carrier reconciliation." /></div>
              : <RecoveryTable rows={queue.data?.queue ?? []} onRecovered={queue.reload} />}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

function CredentialTable({ rows }: { rows: CarrierCredential[] }) {
  if (rows.length === 0) return <AdminEmptyState title="No credentials" description="This organization has no carrier credentials configured." />;
  const cols: RelatedColumn[] = [
    { key: 'providerKey', label: 'Provider' },
    { key: 'label', label: 'Label', render: (v) => v ? String(v) : '—' },
    { key: 'isActive', label: 'Active', render: (v) => <AdminStatusDot status={v ? 'ACTIVE' : 'INACTIVE'} color={v ? 'ok' : 'muted'} /> },
    { key: 'createdAt', label: 'Created', render: (v) => formatDate(v as string) },
  ];
  return <AdminRelatedTable columns={cols} data={rows as unknown as Record<string, unknown>[]} />;
}

function ConfigTable({ rows }: { rows: CarrierConfiguration[] }) {
  if (rows.length === 0) return <AdminEmptyState title="No configurations" description="This organization has no carrier routing configurations." />;
  const cols: RelatedColumn[] = [
    { key: 'providerKey', label: 'Provider' },
    { key: 'storeId', label: 'Store', render: (v) => v ? <code style={{ fontSize: 11 }}>{String(v).slice(0, 10)}…</code> : <span style={{ color: '#5b6b74' }}>All stores</span> },
    { key: 'isDefault', label: 'Default', render: (v) => v ? 'Yes' : 'No' },
    { key: 'isActive', label: 'Active', render: (v) => <AdminStatusDot status={v ? 'ACTIVE' : 'INACTIVE'} color={v ? 'ok' : 'muted'} /> },
    { key: 'credentialId', label: 'Credential', render: (v) => v ? <code style={{ fontSize: 11 }}>{String(v).slice(0, 10)}…</code> : '—' },
  ];
  return <AdminRelatedTable columns={cols} data={rows as unknown as Record<string, unknown>[]} />;
}

function RecoveryTable({ rows, onRecovered }: { rows: RecoveryQueueRow[]; onRecovered: () => void }) {
  const action = useAdminMutation(onRecovered);
  const cols: RelatedColumn[] = [
    { key: 'id', label: 'Shipment', render: (v) => <Link href={`/shipments/${v}`} style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e6178' }}>{String(v).slice(0, 10)}…</Link> },
    { key: 'shippingProviderKey', label: 'Provider', render: (v) => v ? String(v) : '—' },
    { key: 'carrierCreateStatus', label: 'Create', render: (v) => <AdminStatusDot status={String(v || 'NONE')} color={carrierTone(v as string)} /> },
    { key: 'carrierCancelStatus', label: 'Cancel', render: (v) => <AdminStatusDot status={String(v || 'NONE')} color={carrierTone(v as string)} /> },
    { key: 'carrierCreateRetries', label: 'Retries' },
    { key: 'recoveryStatus', label: 'Recovery', render: (v) => v ? String(v) : '—' },
    { key: 'nextReconciliationAt', label: 'Next recon.', render: (v) => formatDate(v as string) },
    { key: '_action', label: 'Action', sortable: false, render: (_v, row) => (
      <button type="button" disabled={action.busy} style={btn}
        onClick={() => { if (window.confirm('Run carrier reconciliation for this shipment?')) action.run(`carrier/shipments/${encodeURIComponent(String(row['id']))}/recover`, 'POST'); }}>
        Reconcile</button>
    ) },
  ];
  return (
    <div>
      {action.error && <div style={{ padding: '8px 16px', color: '#b3372f', fontSize: 13 }}>{action.error}</div>}
      <AdminRelatedTable columns={cols} data={rows as unknown as Record<string, unknown>[]} />
    </div>
  );
}

const field: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13,
  background: '#fff', color: '#0f3340', fontFamily: 'inherit', cursor: 'pointer',
};
const btn: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid #b45309', borderRadius: 6, background: '#fdf3e7',
  color: '#b45309', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

export default function CarrierPage() {
  return <Suspense fallback={<div style={{ padding: 32 }}><SkeletonTable rows={5} cols={4} /></div>}><CarrierConsole /></Suspense>;
}
