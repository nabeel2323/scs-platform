'use client';

/**
 * Role Detail & Permission Management — view and edit role permissions.
 * Route: /roles/[id]
 * Requires admin:users:read to view, admin:roles:write to edit permissions.
 */

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { fetchRoleDetail, updateRolePermissions, type RoleDetail } from '@/lib/api';
import { useRequirePerms } from '@/hooks/useRequirePerms';
import { AdminLoadingSkeleton, AdminErrorState } from '@/components/detail';

function RoleDetailContent({ id }: { id: string }) {
  const { hasAccess: canRead } = useRequirePerms(['admin:users:read']);
  const { hasAccess: canWrite } = useRequirePerms(['admin:roles:write']);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const requestVersion = useRef(0);
  const [saving, setSaving] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  useEffect(() => setReady(true), []);

  const load = useCallback(async () => {
    if (!ready || !canRead) return;
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchRoleDetail(id);
      if (requestId === requestVersion.current) {
        setRole(data);
        setSelectedPerms(data.permissions);
      }
    } catch (err) {
      if (requestId === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to load role');
      }
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [id, ready, canRead]);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  async function handleSave() {
    if (!canWrite) return;
    setSaving(true);
    setActionError('');
    try {
      await updateRolePermissions(id, selectedPerms);
      setRole((prev) => (prev ? { ...prev, permissions: selectedPerms } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role permissions');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!canRead)
    return (
      <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: admin:users:read</div>
    );
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load role" message={error} onRetry={load} />;
  if (!role) return null;

  const allPermissions = role.permissions;

  return (
    <div style={{ padding: '32px 32px 48px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{role.key}</h1>
          <p style={{ margin: 4, color: '#64748b' }}>
            {role.name} • {allPermissions.length} permission{allPermissions.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canWrite && (
          <button
            disabled={saving}
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: '#0f766e',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Permissions'}
          </button>
        )}
      </div>

      {role.key === 'SUPER_ADMIN' && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>
            <strong>Protected role:</strong> SUPER_ADMIN permissions cannot be modified. Changes
            require platform-level authorization.
          </p>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          {actionError}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid #f1f5f9',
            fontSize: 13,
            fontWeight: 600,
            color: '#475569',
          }}
        >
          Permission Assignments
        </div>
        <div style={{ padding: 16 }}>
          {!canWrite ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>
              You do not have permission to edit role permissions. Required:{' '}
              <code>admin:roles:write</code>.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                Select the permissions this role should grant, then save. Changes are audited.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                {allPermissions.map((permKey) => {
                  const checked = selectedPerms.includes(permKey);
                  return (
                    <label
                      key={permKey}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedPerms, permKey]
                            : selectedPerms.filter((p) => p !== permKey);
                          setSelectedPerms(next);
                        }}
                        disabled={!canWrite || role.key === 'SUPER_ADMIN'}
                        style={{ accentColor: '#0f766e' }}
                      />
                      <span style={{ color: '#334155' }}>{permKey}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {saving && <p style={{ fontSize: 12, color: '#0f766e', marginTop: 12 }}>Saving…</p>}
          {error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 12 }}>{error}</p>}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: '#94a3b8' }}>
        <p>
          <strong>Members:</strong> {role.memberCount} organization member(s) currently hold this
          role.
        </p>
        <p>Permission changes apply to all members of this role across all organizations.</p>
      </div>
    </div>
  );
}

export default function RoleDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return (
    <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}>
      <RoleDetailContent id={id} />
    </Suspense>
  );
}
