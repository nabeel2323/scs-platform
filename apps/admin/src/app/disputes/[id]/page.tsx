'use client';

/**
 * Dispute Detail Page — professional dispute detail view for Admin.
 *
 * Route: /disputes/[id]
 * Shows dispute information, parties, and resolution status.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminRequest, type AdminRecord } from '../../../lib/api';
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
  const { hasAccess } = useRequirePerms(['admin:disputes:read']);
  const [ready, setReady] = useState(false);
  const [dispute, setDispute] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    adminRequest<AdminRecord>(`admin/disputes/${encodeURIComponent(id)}`)
      .then(data => { setDispute(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load dispute'); setLoading(false); });
  }, [id, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:disputes:read</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load dispute" message={error} />;
  if (!dispute) return null;

  const status = String(dispute['status'] || '');
  const orderId = dispute['orderId'] as string | null;
  const buyerId = dispute['buyerId'] as string | null;
  const merchantId = dispute['merchantId'] as string | null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'technical', label: 'Technical' },
  ];

  const overviewItems: KVItem[] = [
    { key: 'status', label: 'Status', value: status ? <AdminStatusBadge status={status} /> : 'Not set' },
    { key: 'reason', label: 'Reason', value: String(dispute['reason'] || dispute['disputeReason'] || '—') },
    { key: 'orderId', label: 'Order', value: orderId ? (
      <AdminEntityLink type="order" id={orderId} name={orderId.slice(0, 12) + '…'} showIcon />
    ) : 'Not linked' },
    { key: 'buyerId', label: 'Buyer', value: buyerId ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{buyerId}</span>
        <AdminCopyButton value={buyerId} label="" />
      </span>
    ) : '—' },
    { key: 'merchantId', label: 'Merchant', value: merchantId ? (
      <AdminEntityLink type="merchant" id={merchantId} name={String(dispute['merchantName'] || merchantId.slice(0, 12) + '…')} showIcon />
    ) : '—' },
    { key: 'amountMinor', label: 'Disputed Amount', value: dispute['amountMinor'] != null ? (
      formatCurrency(dispute['amountMinor'] as number, String(dispute['currency'] || 'SAR'))
    ) : '—' },
    { key: 'createdAt', label: 'Opened', value: formatDate(dispute['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(dispute['updatedAt'] as string) },
    { key: 'resolvedAt', label: 'Resolved', value: formatDate(dispute['resolvedAt'] as string) },
  ];

  const technicalItems: KVItem[] = [
    { key: 'id', label: 'Dispute ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
    { key: 'description', label: 'Description', value: String(dispute['description'] || dispute['notes'] || '—') },
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
            {dispute['amountMinor'] != null && <><span style={{ color: '#d9e2e6' }}> · </span><span>{formatCurrency(dispute['amountMinor'] as number, String(dispute['currency'] || 'SAR'))}</span></>}
          </>
        }
        status={status}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <AdminDetailSection title="Dispute Information">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'technical' && (
          <AdminDetailSection title="Technical Details">
            <AdminKeyValueGrid items={technicalItems} columns={1} />
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function DisputeDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><DisputeDetailContent id={id} /></Suspense>;
}
