'use client';

/**
 * User Detail Page — professional user detail view for Admin.
 *
 * Route: /users/[id]
 * Shows user identity, contact info, status, and organization memberships.
 */
import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { fetchAdminUserDetail, fetchRoleDetail, type AdminUserDetail, type RoleDetail } from '../../../lib/api';
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
  const [userError, setUserError] = useState('');
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('overview');
  const [roleDetails, setRoleDetails] = useState<Record<string, RoleDetail>>({});
  const [permsLoading, setPermsLoading] = useState(false);
  const userRequestVersion = useRef(0);
  const permissionsRequestVersion = useRef(0);

  useEffect(() => setReady(true), []);

  const loadUser = useCallback(async () => {
    if (!ready || !hasAccess) return;
    const requestId = ++userRequestVersion.current;
    setLoading(true);
    setUserError('');
    try {
      const data = await fetchAdminUserDetail(id);
      if (requestId === userRequestVersion.current) {
        setUser(data);
        setRoleDetails({});
        setRoleErrors({});
      }
    } catch (err) {
      if (requestId === userRequestVersion.current) {
        setUserError(err instanceof Error ? err.message : 'Failed to load user');
      }
    } finally {
      if (requestId === userRequestVersion.current) setLoading(false);
    }
  }, [id, ready, hasAccess]);

  useEffect(() => {
    void loadUser();
    return () => { userRequestVersion.current += 1; };
  }, [loadUser]);

  const loadRolePermissions = useCallback(async () => {
    if (!ready || !hasAccess || !user) return;
    const requestId = ++permissionsRequestVersion.current;
    const roleIds = Array.from(new Set(user.organizations.map(membership => membership.roleId).filter(Boolean)));
    setPermsLoading(true);
    setRoleErrors({});
    if (roleIds.length === 0) {
      setRoleDetails({});
      setPermsLoading(false);
      return;
    }
    try {
      const results = await Promise.all(roleIds.map(async roleId => {
        try {
          return { roleId, data: await fetchRoleDetail(roleId), error: '' };
        } catch (err) {
          return {
            roleId,
            data: null,
            error: err instanceof Error ? err.message : 'Failed to load assigned role permissions',
          };
        }
      }));
      if (requestId === permissionsRequestVersion.current) {
        setRoleDetails(Object.fromEntries(results.filter(result => result.data).map(result => [result.roleId, result.data!])));
        setRoleErrors(Object.fromEntries(results.filter(result => result.error).map(result => [result.roleId, result.error])));
      }
    } finally {
      if (requestId === permissionsRequestVersion.current) setPermsLoading(false);
    }
  }, [user, ready, hasAccess]);

  useEffect(() => {
    void loadRolePermissions();
    return () => { permissionsRequestVersion.current += 1; };
  }, [loadRolePermissions]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:users:read</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (userError) return <AdminErrorState title="Unable to load user" message={userError} onRetry={loadUser} />;
  if (!user) return null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'organizations', label: `Organizations (${user.organizations.length})` },
    { key: 'permissions', label: 'Role permissions' },
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
          <AdminDetailSection title="Permissions by assigned role">
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              These are the permissions configured on each organization membership role, not a live authorization decision. Actual access also depends on the user, organization, membership status and active organization context.
            </p>
            {permsLoading && <AdminLoadingSkeleton kvRows={4} />}
            {!permsLoading && user.organizations.length === 0 && (
              <AdminEmptyState title="No assigned roles" description="This user has no organization memberships from which role permissions can be displayed." />
            )}
            {!permsLoading && user.organizations.map(membership => {
              const role = roleDetails[membership.roleId];
              const roleError = roleErrors[membership.roleId];
              return (
                <section key={membership.orgId} style={{ marginBottom: 20, padding: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{membership.orgName}</h4>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{membership.roleName} ({membership.roleKey})</p>
                    </div>
                    <AdminStatusBadge status={membership.membershipStatus} />
                  </div>
                  {roleError ? (
                    <AdminErrorState title="Unable to load role permissions" message={roleError} onRetry={loadRolePermissions} />
                  ) : role ? (
                    role.permissions.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {role.permissions.map(permission => (
                          <code key={permission} style={{ padding: '4px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#0f766e' }}>{permission}</code>
                        ))}
                      </div>
                    ) : <AdminEmptyState title="No role permissions" description="This role currently has no configured permissions." />
                  ) : <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Role permissions are unavailable.</p>}
                </section>
              );
            })}
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
