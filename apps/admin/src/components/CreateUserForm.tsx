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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUser,
  type CreateUserRequest,
  fetchAdminOrganizations,
  type AdminOrg,
  fetchRoles,
  type RoleInfo,
} from '../lib/api';
import { useRequirePerms } from '../hooks/useRequirePerms';
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
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [orgsError, setOrgsError] = useState('');
  const [rolesError, setRolesError] = useState('');
  const orgsRequestVersion = useRef(0);
  const rolesRequestVersion = useRef(0);

  const loadOrganizations = useCallback(async () => {
    const requestId = ++orgsRequestVersion.current;
    setOrgsLoading(true);
    setOrgsError('');
    try {
      const rows = await fetchAdminOrganizations();
      if (requestId === orgsRequestVersion.current) setOrgs(rows);
    } catch (err) {
      if (requestId === orgsRequestVersion.current) {
        setOrgsError(err instanceof Error ? err.message : 'Unable to load organizations');
      }
    } finally {
      if (requestId === orgsRequestVersion.current) setOrgsLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    const requestId = ++rolesRequestVersion.current;
    setRolesLoading(true);
    setRolesError('');
    try {
      const rows = await fetchRoles();
      if (requestId === rolesRequestVersion.current) setRoles(rows);
    } catch (err) {
      if (requestId === rolesRequestVersion.current) {
        setRolesError(err instanceof Error ? err.message : 'Unable to load roles');
      }
    } finally {
      if (requestId === rolesRequestVersion.current) setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
    void loadRoles();
    return () => {
      orgsRequestVersion.current += 1;
      rolesRequestVersion.current += 1;
    };
  }, [loadOrganizations, loadRoles]);

  if (!hasAccess) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (Boolean(orgId) !== Boolean(roleId)) {
      setError('Select both an organization and a role, or leave both unselected.');
      return;
    }
    setBusy(true);
    try {
      const dto: CreateUserRequest = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
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
          <label htmlFor="create-user-full-name">
            Full Name <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="create-user-full-name"
            required
            maxLength={160}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="create-user-email">
            Email <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="create-user-email"
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="create-user-phone">Phone (optional)</label>
          <input
            id="create-user-phone"
            type="tel"
            maxLength={20}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555-0100"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="create-user-locale">Locale</label>
          <select
            id="create-user-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
        <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#64748b' }}>
          Initial Organization Membership (optional)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="create-user-organization">Organization</label>
            <ErrorNotice message={orgsError} retry={() => void loadOrganizations()} />
            <select
              id="create-user-organization"
              value={orgId}
              disabled={orgsLoading || Boolean(orgsError)}
              onChange={(e) => {
                setOrgId(e.target.value);
                setRoleId('');
              }}
            >
              <option value="">
                {orgsLoading
                  ? 'Loading organizations…'
                  : orgsError
                    ? 'Retry organization lookup above'
                    : 'None — unassigned user'}
              </option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.type})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="create-user-role">Role</label>
            <ErrorNotice message={rolesError} retry={() => void loadRoles()} />
            <select
              id="create-user-role"
              value={roleId}
              disabled={!orgId || rolesLoading || Boolean(rolesError)}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">
                {rolesLoading
                  ? 'Loading roles…'
                  : rolesError
                    ? 'Retry role lookup above'
                    : 'Select a role'}
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.key} — {role.name}
                </option>
              ))}
            </select>
            {roleId && roles.find((r) => r.id === roleId) && (
              <p style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                Permissions: {roles.find((r) => r.id === roleId)!.permissions.join(', ') || 'None'}
              </p>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Select both an organization and a role to create the membership, or leave both blank to
          create an unassigned user. A membership can be added later from the user detail page.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="create-user-status">Initial Account Status</label>
          <select
            id="create-user-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE')}
          >
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div className={styles['actions']} style={{ marginTop: 24 }}>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !fullName.trim() || !email.trim() || Boolean(orgId) !== Boolean(roleId)}
        >
          Create User
        </button>
      </div>
    </form>
  );
}
