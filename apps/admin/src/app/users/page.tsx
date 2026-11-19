'use client';

import { useEffect, useState } from 'react';
import ManagementPage from '../../components/ManagementPage';
import { CreateUserForm } from '../../components/CreateUserForm';
import { useRequirePerms } from '../../hooks/useRequirePerms';

export default function UsersPage() {
  const { hasAccess: canCreateUser } = useRequirePerms(['admin:users:write']);
  const [creatingUser, setCreatingUser] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div style={{ padding: '0 32px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Users</h1>
          <p style={{ margin: 4, color: '#64748b' }}>Manage platform users and their organization memberships.</p>
        </div>
        {ready && canCreateUser && (
          <button
            onClick={() => setCreatingUser(true)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#1e6178', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Create User
          </button>
        )}
      </div>
      {creatingUser && (
        <CreateUserForm onCancel={() => setCreatingUser(false)} onDone={() => setCreatingUser(false)} />
      )}
      <ManagementPage entity="users" />
    </div>
  );
}
