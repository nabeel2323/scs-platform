'use client';

/**
 * CreateUserForm — modal form for creating a new platform user via POST /v1/admin/users.
 *
 * Creates a user account through the secure identity lifecycle:
 * - Validates email/phone uniqueness on the server
 * - Optionally creates an organization membership with role assignment
 * - All user creation is audited server-side
 * - Requires admin:users:write permission
 */

import { useEffect, useState } from 'react';
import { createUser, type CreateUserRequest } from '../lib/api';
import { useRequirePerms } from '../hooks/useRequirePerms';
import { fetchAdminOrganizations, type AdminOrg } from '../lib/api';
import { fetchRoles, type RoleInfo } from '../lib/api';
import { ErrorNotice } from './RecordFields';
import styles from './management.module.css';

interface CreateUserFormProps {
  onCancel: () => void;
  onDone: () => void;
}

export function CreateUserForm({ onCancel, onDone }: CreateUserFormProps) {
  const { hasAccess } = useRequirePerms(['admin:users:write']);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState('en');
  const [status, setStatus] = useState('ACTIVE');
  const [orgId, setOrgId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);

  useEffect(() => {
    fetchAdminOrganizations().then(setOrgs).catch(() => setOrgs([]));
    fetchRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  if (!hasAccess) return null;

  // Pre-load organizations and roles
  // These run once on mount via useEffect-like pattern
  // (React 18 + Next.js App Router: fetch in body is fine for initial load)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const dto: CreateUserRequest = {
        fullName,
        email,
        phone: phone || undefined,
        locale,
        status: status as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
        orgId: orgId || undefined,
        roleId: roleId || undefined,
      };
      await createUser(dto);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles['card']} onSubmit={handleSubmit}>
      <div className={styles['toolbar']}>
        <h3>Create User</h3>
      </div>
      <ErrorNotice message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
          <input required maxLength={160} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>Email <span style={{ color: '#ef4444' }}>*</span></label>
          <input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>Phone</label>
          <input required maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-0100" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>Locale</label>
          <select value={locale} onChange={e => setLocale(e.target.value)}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
        <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#64748b' }}>Initial Organization Membership (optional)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label>Organization</label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)}>
              <option value="">None — unassigned user</option>
              {orgs.map(org => <option key={org.id} value={org.id}>{org.name} ({org.type})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label>Role</label>
            <select value={roleId} onChange={e => setRoleId(e.target.value)}>
              <option value="">None</option>
              {roles.map(role => <option key={role.id} value={role.id}>{role.key} — {role.name}</option>)}
            </select>
            {roleId && roles.find(r => r.id === roleId) && (
              <p style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                Permissions: {roles.find(r => r.id === roleId)!.permissions.join(', ') || 'None'}
              </p>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Leaving both Organization and Role unselected creates a user without organization membership.
          A membership can be added later from the user detail page.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>Initial Account Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE')}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div className={styles['actions']} style={{ marginTop: 24 }}>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy || !fullName || !email}>Create User</button>
      </div>
    </form>
  );
}