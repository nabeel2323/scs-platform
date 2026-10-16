'use client';

/**
 * Organization Detail Page — professional organization detail view for Admin.
 *
 * Route: /organizations/[id]
 * Shows organization identity, stores, warehouses, documents, and members.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchAdminOrganizationDetail, type AdminOrgDetail } from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminEntityLink,
  AdminCopyButton,
  AdminRelatedTable,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  type KVItem,
  type RelatedColumn,
} from '../../../components/detail';

function OrgDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['admin:users:read']);
  const [ready, setReady] = useState(false);
  const [org, setOrg] = useState<AdminOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    fetchAdminOrganizationDetail(id)
      .then(data => { setOrg(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load organization'); setLoading(false); });
  }, [id, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={8} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:users:read</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={8} />;
  if (error) return <AdminErrorState title="Unable to load organization" message={error} />;
  if (!org) return null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'stores', label: `Stores (${org.stores.length})` },
    { key: 'warehouses', label: `Warehouses (${org.warehouses.length})` },
    { key: 'members', label: `Members (${org.members.length})` },
    { key: 'documents', label: `Documents (${org.documents.length})` },
  ];

  const overviewItems: KVItem[] = [
    { key: 'name', label: 'Organization Name', value: org.name },
    { key: 'legalName', label: 'Legal Name', value: org.legalName || '—' },
    { key: 'type', label: 'Type', value: <AdminStatusBadge status={org.type} /> },
    { key: 'country', label: 'Country', value: org.country || '—' },
    { key: 'taxId', label: 'Tax ID', value: org.taxId ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{org.taxId}</span>
        <AdminCopyButton value={org.taxId} label="" />
      </span>
    ) : '—' },
    { key: 'verificationStatus', label: 'Verification', value: <AdminStatusBadge status={org.verificationStatus} /> },
    { key: 'isActive', label: 'Status', value: org.isActive ? (
      <AdminStatusBadge status="ACTIVE" />
    ) : (
      <AdminStatusBadge status="DEACTIVATED" />
    )},
    { key: 'inviteCode', label: 'Invite Code', value: org.inviteCode ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{org.inviteCode}</span>
        <AdminCopyButton value={org.inviteCode} label="" />
      </span>
    ) : '—' },
    { key: 'createdAt', label: 'Registered', value: formatDate(org.createdAt) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(org.updatedAt) },
    { key: 'id', label: 'Organization ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  // Stores table
  const storeColumns: RelatedColumn[] = [
    { key: 'displayName', label: 'Store Name', sortable: true, render: (val) => String(val || '—') },
    { key: 'slug', label: 'Slug', render: (val) => val ? (
      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(val)}</span>
    ) : '—' },
    { key: 'currency', label: 'Currency', render: (val) => String(val || '—') },
    { key: 'locale', label: 'Locale', render: (val) => String(val || '—') },
    { key: 'verificationStatus', label: 'Verification', render: (val) => val ? <AdminStatusBadge status={String(val)} /> : '—' },
  ];

  // Warehouses table
  const warehouseColumns: RelatedColumn[] = [
    { key: 'name', label: 'Name', sortable: true, render: (val) => String(val || '—') },
    { key: 'managerName', label: 'Manager', render: (val) => String(val || 'No manager') },
    { key: 'managerPhone', label: 'Phone', render: (val) => String(val || '—') },
    { key: 'status', label: 'Status', render: (val) => val ? <AdminStatusBadge status={String(val)} /> : '—' },
  ];

  // Members table
  const memberColumns: RelatedColumn[] = [
    { key: 'user', label: 'Name', sortable: true, render: (_val, row) => {
      const u = row['user'] as { fullName: string; phone: string; email: string | null } | undefined;
      return u ? String(u.fullName || u.phone || 'Unknown') : '—';
    }},
    { key: 'role', label: 'Role', render: (_val, row) => {
      const r = row['role'] as { name: string } | undefined;
      return r ? String(r.name) : '—';
    }},
    { key: 'status', label: 'Status', render: (val) => val ? <AdminStatusBadge status={String(val)} /> : '—' },
    { key: 'createdAt', label: 'Joined', render: (val) => val ? formatDate(String(val)) : '—' },
  ];

  // Documents table
  const docColumns: RelatedColumn[] = [
    { key: 'fileName', label: 'File Name', sortable: true, render: (val) => String(val || '—') },
    { key: 'docType', label: 'Type', render: (val) => String(val || '—').replace(/_/g, ' ') },
    { key: 'fileSize', label: 'Size', render: (val) => val ? `${(Number(val) / 1024).toFixed(1)} KB` : '—' },
    { key: 'verificationStatus', label: 'Verification', render: (val) => val ? <AdminStatusBadge status={String(val)} /> : '—' },
    { key: 'createdAt', label: 'Uploaded', render: (val) => val ? formatDate(String(val)) : '—' },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Organizations', href: '/organizations' }]}
        backLabel="Back to Organizations"
        backHref="/organizations"
        title={org.name}
        subtitle={
          <>
            <span>{org.legalName || org.type}</span>
            <span style={{ color: '#d9e2e6' }}> · </span>
            <span>{org.country}</span>
          </>
        }
        status={org.isActive ? 'ACTIVE' : 'DEACTIVATED'}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <AdminDetailSection title="Organization Identity">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'stores' && (
          <AdminDetailSection title={`Stores (${org.stores.length})`}>
            {org.stores.length > 0 ? (
              <AdminRelatedTable columns={storeColumns} data={org.stores as unknown as Record<string, unknown>[]} />
            ) : (
              <AdminEmptyState title="No stores" description="This organization has no registered stores." />
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'warehouses' && (
          <AdminDetailSection title={`Warehouses (${org.warehouses.length})`}>
            {org.warehouses.length > 0 ? (
              <AdminRelatedTable columns={warehouseColumns} data={org.warehouses as unknown as Record<string, unknown>[]} />
            ) : (
              <AdminEmptyState title="No warehouses" description="This organization has no configured warehouses." />
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'members' && (
          <AdminDetailSection title={`Members (${org.members.length})`}>
            {org.members.length > 0 ? (
              <AdminRelatedTable columns={memberColumns} data={org.members as unknown as Record<string, unknown>[]} />
            ) : (
              <AdminEmptyState title="No members" description="This organization has no members." />
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'documents' && (
          <AdminDetailSection title={`Documents (${org.documents.length})`}>
            {org.documents.length > 0 ? (
              <AdminRelatedTable columns={docColumns} data={org.documents as unknown as Record<string, unknown>[]} />
            ) : (
              <AdminEmptyState title="No documents" description="This organization has no uploaded documents." />
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function OrganizationDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}><OrgDetailContent id={id} /></Suspense>;
}
