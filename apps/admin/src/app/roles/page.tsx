'use client';

/**
 * Role Management List — lists all platform roles with their permission counts.
 * Route: /admin/roles
 * Requires admin:users:read
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchRoles, type RoleInfo } from '@/lib/api';
import { useRequirePerms } from '@/hooks/useRequirePerms';
import { AdminLoadingSkeleton, AdminErrorState } from '@/components/detail';

function RolesListContent() {
  const { hasAccess } = useRequirePerms(['admin:users:read']);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready || !hasAccess) return;
    setLoading(true);
    fetchRoles()
      .then(data => { setRoles(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load roles'); setLoading(false); });
  }, [ready, hasAccess]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:users:read</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load roles" message={error} />;

  return (
    <div style={{ padding: '32px 32px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Role Management</h1>
          <p style={{ margin: 4, color: '#64748b' }}>Manage platform roles and their permission assignments.</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: 12, textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Role</th>
            <th style={{ padding: 12, textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Permissions</th>
            <th style={{ padding: 12, textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.length === 0 ? (
            <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No roles found.</td></tr>
          ) : (
            roles.map(role => (
              <tr key={role.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 12, fontSize: 13 }}>
                  <Link href={`/roles/${role.id}`} style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>{role.key}</Link>
                  <br /><span style={{ fontSize: 11, color: '#64748b' }}>{role.name}</span>
                </td>
                <td style={{ padding: 12, fontSize: 13, color: '#64748b' }}>{role.permissions.length} permissions</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <Link href={`/roles/${role.id}`} style={{ padding: '6px 12px', fontSize: 13, background: '#f1f5f9', color: '#0f766e', borderRadius: 6, textDecoration: 'none' }}>View</Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesPage() {
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><RolesListContent /></Suspense>;
}
