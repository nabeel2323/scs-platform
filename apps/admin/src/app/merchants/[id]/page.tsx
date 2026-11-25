'use client';

/**
 * Merchant/Store Detail Page — professional merchant detail view for Admin.
 *
 * Route: /merchants/[id]
 * Shows merchant identity, verification status, and related data.
 */
import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
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
  type KVItem,
} from '../../../components/detail';
import { PreviewImage, RecordFields } from '../../../components/RecordFields';

function MerchantDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['admin:merchants:read']);
  const [ready, setReady] = useState(false);
  const [merchant, setMerchant] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const requestVersion = useRef(0);

  useEffect(() => setReady(true), []);

  const load = useCallback(async () => {
    if (!ready || !hasAccess) return;
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await adminRequest<AdminRecord>(`admin/merchants/${encodeURIComponent(id)}`);
      if (requestId === requestVersion.current) setMerchant(data);
    } catch (err) {
      if (requestId === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to load merchant');
      }
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [id, ready, hasAccess]);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess)
    return (
      <div style={{ padding: 32, color: '#991b1b' }}>
        Access denied. Required: admin:merchants:read
      </div>
    );
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error)
    return <AdminErrorState title="Unable to load merchant" message={error} onRetry={load} />;
  if (!merchant) return null;

  const displayName = String(merchant['displayName'] || merchant['name'] || 'Merchant');
  const status = String(merchant['status'] || '');
  const verificationStatus = String(merchant['verificationStatus'] || '');
  const orgId = merchant['orgId'] as string | null;
  const orgName = merchant['orgName'] as string | null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'technical', label: 'Technical' },
  ];

  const overviewItems: KVItem[] = [
    { key: 'displayName', label: 'Display Name', value: displayName },
    {
      key: 'slug',
      label: 'Slug',
      value: merchant['slug'] ? (
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{String(merchant['slug'])}</span>
      ) : (
        'Not set'
      ),
    },
    {
      key: 'status',
      label: 'Status',
      value: status ? <AdminStatusBadge status={status} /> : 'Not set',
    },
    {
      key: 'verificationStatus',
      label: 'Verification',
      value: verificationStatus ? <AdminStatusBadge status={verificationStatus} /> : 'Not set',
    },
    { key: 'currency', label: 'Currency', value: String(merchant['currency'] || 'Not set') },
    { key: 'timezone', label: 'Timezone', value: String(merchant['timezone'] || 'Not set') },
    { key: 'locale', label: 'Locale', value: String(merchant['locale'] || 'Not set') },
    {
      key: 'popularityBadge',
      label: 'Popularity Badge',
      value: merchant['hidePopularityBadge'] === true ? 'Hidden' : 'Visible',
    },
    {
      key: 'description',
      label: 'Description',
      value: merchant['description'] ? String(merchant['description']) : '—',
    },
    {
      key: 'orgId',
      label: 'Organization',
      value: orgId ? (
        orgName ? (
          <AdminEntityLink type="organization" id={orgId} name={orgName} showIcon />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{orgId}</span>
            <AdminCopyButton value={orgId} label="" />
          </span>
        )
      ) : (
        'Not linked'
      ),
    },
    { key: 'createdAt', label: 'Created', value: formatDate(merchant['createdAt'] as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(merchant['updatedAt'] as string) },
  ];

  const technicalItems: KVItem[] = [
    {
      key: 'id',
      label: 'Store ID',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
          <AdminCopyButton value={id} label="" />
        </span>
      ),
    },
    { key: 'orgId', label: 'Organization ID', value: orgId || 'Not linked' },
    { key: 'slug', label: 'Store Slug', value: String(merchant['slug'] || 'Not set') },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Merchants', href: '/merchants' }]}
        backLabel="Back to Merchants"
        backHref="/merchants"
        title={displayName}
        subtitle={
          <>
            {merchant['slug'] && (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {String(merchant['slug'])}
              </span>
            )}
            {merchant['currency'] && (
              <>
                <span style={{ color: '#d9e2e6' }}> · </span>
                <span>{String(merchant['currency'])}</span>
              </>
            )}
          </>
        }
        status={status || verificationStatus || undefined}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <>
            <AdminDetailSection title="Store Information">
              <AdminKeyValueGrid items={overviewItems} />
            </AdminDetailSection>
            {(typeof merchant['logoUrl'] === 'string' ||
              typeof merchant['coverUrl'] === 'string') && (
              <AdminDetailSection title="Store Branding">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                  {typeof merchant['logoUrl'] === 'string' && (
                    <div>
                      <h3 style={{ fontSize: 13 }}>Logo</h3>
                      <PreviewImage reference={merchant['logoUrl']} />
                    </div>
                  )}
                  {typeof merchant['coverUrl'] === 'string' && (
                    <div>
                      <h3 style={{ fontSize: 13 }}>Cover image</h3>
                      <PreviewImage reference={merchant['coverUrl']} />
                    </div>
                  )}
                </div>
              </AdminDetailSection>
            )}
            {merchant['address'] &&
              typeof merchant['address'] === 'object' &&
              !Array.isArray(merchant['address']) && (
                <AdminDetailSection title="Store Address">
                  <RecordFields record={merchant['address'] as Record<string, unknown>} />
                </AdminDetailSection>
              )}
          </>
        )}

        {activeTab === 'technical' && (
          <AdminDetailSection title="Technical Identifiers">
            <AdminKeyValueGrid items={technicalItems} columns={1} />
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function MerchantDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return (
    <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}>
      <MerchantDetailContent id={id} />
    </Suspense>
  );
}
