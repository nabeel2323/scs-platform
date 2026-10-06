'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchStoreMembers, fetchEligibleMembers, addStoreMember, removeStoreMember,
  changeMemberRole, activateMember, deactivateMember,
  StoreMember,
} from '../../../lib/api';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';
import { PageHeader } from '@scs/ui-kit';

const ROLE_COLORS: Record<string, string> = {
  OWNER: '#0f3340',
  ADMIN: '#0369a1',
  MEMBER: '#5b6b74',
};

export default function StoreMembersPage() {
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [noStore, setNoStore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<StoreMember[]>([]);

  // Add member form
  const [addOpen, setAddOpen] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<Array<{ id: string; email: string | null; fullName: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [addLoading, setAddLoading] = useState(false);

  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: string; userId: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Role change
  const [roleChangeUserId, setRoleChangeUserId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState('MEMBER');

  const loadMembers = useCallback(async (sid: string) => {
    try {
      const data = await fetchStoreMembers(sid);
      setMembers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await fetchMyStores();
        const s = pickStore(stores);
        if (!s) { setNoStore(true); setLoading(false); return; }
        setStoreId(s.id);
        setStoreName(s.displayName);
        await loadMembers(s.id);
      } catch (err: any) {
        setError(err.message || 'Failed to resolve store');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMembers]);

  const handleOpenAdd = async () => {
    setAddOpen(true);
    setError('');
    try {
      const users = await fetchEligibleMembers(storeId);
      setEligibleUsers(users);
    } catch (err: any) {
      setError(err.message || 'Failed to load eligible users');
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setAddLoading(true);
    setError('');
    try {
      await addStoreMember(storeId, selectedUserId, selectedRole);
      await loadMembers(storeId);
      setAddOpen(false);
      setSelectedUserId('');
      setSelectedRole('MEMBER');
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setAddLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    setError('');
    try {
      switch (confirmAction.type) {
        case 'remove':
          await removeStoreMember(storeId, confirmAction.userId);
          break;
        case 'activate':
          await activateMember(storeId, confirmAction.userId);
          break;
        case 'deactivate':
          await deactivateMember(storeId, confirmAction.userId);
          break;
      }
      await loadMembers(storeId);
      setConfirmAction(null);
    } catch (err: any) {
      setError(err.message || `Failed to ${confirmAction.type} member`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeRole = async (userId: string) => {
    setError('');
    try {
      await changeMemberRole(storeId, userId, newRole);
      await loadMembers(storeId);
      setRoleChangeUserId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to change role');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (noStore) return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Store Members" />
      <EmptyState title="No store found" description="You need to be associated with a store to manage members." />
    </div>
  );

  return (
    <div style={{ padding: '16px 24px', maxWidth: 900 }}>
      <PageHeader title={`Members — ${storeName}`} />

      {error && <ErrorBanner message={error} />}

      {/* Add member button */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleOpenAdd} style={{
          padding: '8px 16px', fontSize: 13, border: '1px solid #0f3340',
          borderRadius: 6, cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600,
        }}>
          + Add Member
        </button>
      </div>

      {/* Add member form */}
      {addOpen && (
        <div style={{ padding: 16, marginBottom: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Add Member</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#5b6b74' }}>User</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }}
              >
                <option value="">Select a user…</option>
                {eligibleUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.fullName}{u.email ? ` (${u.email})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#5b6b74' }}>Role</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 13 }}
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
            <button onClick={handleAddMember} disabled={!selectedUserId || addLoading} style={{
              padding: '6px 16px', fontSize: 13, border: 'none', borderRadius: 4, cursor: 'pointer',
              background: '#0f3340', color: '#fff', opacity: !selectedUserId || addLoading ? 0.5 : 1,
            }}>
              {addLoading ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setAddOpen(false)} style={{
              padding: '6px 12px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, maxWidth: 400, width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>
              {confirmAction.type === 'remove' ? 'Remove Member' : confirmAction.type === 'deactivate' ? 'Deactivate Member' : 'Activate Member'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#5b6b74' }}>
              {confirmAction.type === 'remove' ? `Remove ${confirmAction.name} from this store?` :
               confirmAction.type === 'deactivate' ? `Deactivate ${confirmAction.name}'s membership?` :
               `Activate ${confirmAction.name}'s membership?`}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmAction(null)} disabled={actionLoading} style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>Cancel</button>
              <button onClick={handleConfirmAction} disabled={actionLoading} style={{
                padding: '6px 12px', fontSize: 13, border: 'none', borderRadius: 4, cursor: 'pointer',
                background: confirmAction.type === 'remove' ? '#c0392b' : '#0f3340', color: '#fff',
              }}>{actionLoading ? 'Processing…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Members table */}
      {members.length === 0 ? (
        <EmptyState title="No members yet" description="Add members to this store to get started." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#5b6b74' }}>User</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#5b6b74' }}>Role</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#5b6b74' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#5b6b74' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 600, color: '#0f3340' }}>{m.userId.slice(0, 8)}…</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {roleChangeUserId === m.userId ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select value={newRole} onChange={e => setNewRole(e.target.value)}
                          style={{ padding: '2px 6px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 4 }}>
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                          <option value="OWNER">Owner</option>
                        </select>
                        <button onClick={() => handleChangeRole(m.userId)} style={{ padding: '2px 8px', fontSize: 11, border: 'none', borderRadius: 4, cursor: 'pointer', background: '#0f3340', color: '#fff' }}>Save</button>
                        <button onClick={() => setRoleChangeUserId(null)} style={{ padding: '2px 8px', fontSize: 11, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>Cancel</button>
                      </div>
                    ) : (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: `${ROLE_COLORS[m.role] || '#5b6b74'}18`,
                        color: ROLE_COLORS[m.role] || '#5b6b74', fontWeight: 600,
                      }}>{m.role}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10,
                      background: m.status === 'ACTIVE' ? '#dcfce7' : '#fef2f2',
                      color: m.status === 'ACTIVE' ? '#166534' : '#991b1b', fontWeight: 600,
                    }}>{m.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setRoleChangeUserId(m.userId); setNewRole(m.role === 'OWNER' ? 'ADMIN' : 'MEMBER'); }}
                        style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
                        Change Role
                      </button>
                      {m.status === 'ACTIVE' ? (
                        <button onClick={() => setConfirmAction({ type: 'deactivate', userId: m.userId, name: m.userId.slice(0, 8) })}
                          style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #fbbf24', borderRadius: 4, cursor: 'pointer', background: '#fff', color: '#92400e' }}>
                          Deactivate
                        </button>
                      ) : (
                        <button onClick={() => setConfirmAction({ type: 'activate', userId: m.userId, name: m.userId.slice(0, 8) })}
                          style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #86efac', borderRadius: 4, cursor: 'pointer', background: '#fff', color: '#166534' }}>
                          Activate
                        </button>
                      )}
                      <button onClick={() => setConfirmAction({ type: 'remove', userId: m.userId, name: m.userId.slice(0, 8) })}
                        style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', background: '#fff', color: '#991b1b' }}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
