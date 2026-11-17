'use client';

/**
 * User Detail Page — professional user detail view for Admin.
 *
 * Route: /users/[id]
 * Shows user identity, contact info, status, and organization memberships.
 */
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchAdminUserDetail, type AdminUserDetail } from '../../../lib/api';
import { fetchPermissions, type PermissionCatalog } from '../../../lib/api';
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

function UserDetailContent({ id }: { id: string }) {
  const { hasAccess } = useRequirePerms(['admin:users:read']);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [permissions, setPermissions] = useState<PermissionCatalog | null>(null);
  const [permsLoading, setPermsLoading] = useState(false);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    fetchAdminUserDetail(id)
      .then(data => { setUser(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load user'); setLoading(false); });
  }, [id, ready, hasAccess]);

  useEffect(() => {
    if (!ready || !hasAccess || !user) return;
    setPermsLoading(true);
    fetchPermissions()
      .then(data => { setPermissions(data); setPermsLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load permissions'); setPermsLoading(false); });
  }, [user, ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:users:read</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load user" message={error} />;
  if (!user) return null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'organizations', label: `Organizations (${user.organizations.length})` },
    { key: 'permissions', label: 'Permissions' },
  ];

  const overviewItems: KVItem[] = [
    { key: 'fullName', label: 'Full Name', value: user.fullName || 'Not set' },
    { key: 'phone', label: 'Phone', value: user.phone || '—' },
    { key: 'email', label: 'Email', value: user.email || '—' },
    { key: 'emailVerified', label: 'Email Verified', value: user.emailVerifiedAt ? 'Yes' : 'No' },
    { key: 'status', label: 'Status', value: <AdminStatusBadge status={user.status} /> },
    { key: 'locale', label: 'Locale', value: user.locale || '—' },
    { key: 'createdAt', label: 'Registered', value: formatDate(user.createdAt) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(user.updatedAt) },
    { key: 'id', label: 'User ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  const orgColumns: RelatedColumn[] = [
    { key: 'orgName', label: 'Organization', sortable: true, render: (_val, row) => {
      const orgId = String(row['orgId'] || '');
      const orgName = String(row['orgName'] || '');
      return orgId ? (
        <AdminEntityLink type="organization" id={orgId} name={orgName || orgId.slice(0, 12) + '…'} showIcon />
      ) : '—';
    }},
    { key: 'orgType', label: 'Type', render: (val) => String(val || '—') },
    { key: 'roleName', label: 'Role', render: (val) => String(val || '—') },
    { key: 'membershipStatus', label: 'Status', render: (val) => val ? <AdminStatusBadge status={String(val)} /> : '—' },
    { key: 'joinedAt', label: 'Joined', render: (val) => val ? formatDate(String(val)) : '—' },
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Users', href: '/users' }]}
        backLabel="Back to Users"
        backHref="/users"
        title={user.fullName || user.phone}
        subtitle={
          <>
            {user.email && <span>{user.email}</span>}
            {user.phone && <><span style={{ color: '#d9e2e6' }}> · </span><span>{user.phone}</span></>}
          </>
        }
        status={user.status}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <AdminDetailSection title="User Information">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'organizations' && (
          <AdminDetailSection title={`Organization Memberships (${user.organizations.length})`}>
            {user.organizations.length > 0 ? (
              <AdminRelatedTable
                columns={orgColumns}
                data={user.organizations as unknown as Record<string, unknown>[]}
              />
            ) : (
              <AdminEmptyState title="No memberships" description="This user is not a member of any organization." />
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'permissions' && (
          <AdminDetailSection title="Effective Permissions">
            {permsLoading ? <AdminLoadingSkeleton kvRows={4} /> : (
              permissions ? (
                <>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                    Permissions shown below are those the user currently receives through their active
                    organization memberships. Permissions may differ if the user switches organizations.
                  </p>
                  {permissions.domains.map(domain => (
                    <div key={domain.domain} style={{ marginBottom: 20 }}>
                      <h4 style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{domain.domain}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {domain.permissions.map(p => (
                          <span key={p.key} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0',
                            borderRadius: 9999, fontSize: 12, color: '#334155',
                          }}>
                            <code style={{ fontSize: 11, fontWeight: 600, color: '#0f766e' }}>{p.key}</code>
                            <span>{p.description}</span>
                          </span>
                        ))}
                        {domain.permissions.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>No permissions</span>}
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
                    Total permissions: {permissions.total}
                  </p>
                </>
              ) : (
                <AdminEmptyState title="No permissions" description="This user has no effective permissions from any organization membership." />
              )
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><UserDetailContent id={id} /></Suspense>;
}
