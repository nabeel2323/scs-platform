'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminUsers, fetchAdminUserDetail, updateUserStatus, assignUserRole, fetchRoles,
  AdminUser, AdminUserDetail, RoleInfo,
} from '../../lib/api';

const STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({ orgId: '', roleId: '' });
  const [roleSaving, setRoleSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAdminUsers({
        status: statusFilter || undefined,
        search: search || undefined,
        limit,
        offset: page * limit,
      });
      setUsers(result.data);
      setTotal(result.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchRoles().then(setRoles).catch(() => {});
  }, []);

  const handleViewDetail = async (id: string) => {
    setDetailLoading(true);
    setSelectedUser(null);
    try {
      const detail = await fetchAdminUserDetail(id);
      setSelectedUser(detail);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  };

  const handleStatusChange = async (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') => {
    try {
      await updateUserStatus(id, status);
      setActionMsg(`User ${status === 'ACTIVE' ? 'activated' : 'suspended'} successfully`);
      setTimeout(() => setActionMsg(''), 3000);
      load();
      if (selectedUser?.id === id) {
        handleViewDetail(id);
      }
    } catch { /* ignore */ }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !roleForm.orgId || !roleForm.roleId) return;
    setRoleSaving(true);
    try {
      await assignUserRole(selectedUser.id, roleForm.orgId, roleForm.roleId);
      setActionMsg('Role assigned successfully');
      setTimeout(() => setActionMsg(''), 3000);
      setShowRoleModal(false);
      setRoleForm({ orgId: '', roleId: '' });
      handleViewDetail(selectedUser.id);
    } catch { /* ignore */ }
    finally { setRoleSaving(false); }
  };

  const statusColor = (s: string): string => {
    const map: Record<string, string> = { ACTIVE: '#065f46', SUSPENDED: '#991b1b', INACTIVE: '#5b6b74' };
    return map[s] || '#5b6b74';
  };

  const roleBadgeColor = (key: string): string => {
    const map: Record<string, string> = {
      SUPER_ADMIN: '#991b1b', ADMIN: '#1e40af', MODERATOR: '#7c3aed',
      MERCHANT_OWNER: '#065f46', MERCHANT_STAFF: '#92400e', BUYER: '#5b6b74',
    };
    return map[key] || '#5b6b74';
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>User Management</h1>
          <p style={{ color: '#5b6b74', fontSize: 14, margin: 0 }}>All registered platform users — {total} total</p>
        </div>
      </div>

      {actionMsg && (
        <div style={{ background: '#e8f5e9', color: '#2e7d32', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500 }}>
          {actionMsg}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Search</label>
          <input
            type="text"
            placeholder="Name, phone, or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ padding: '7px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Status</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
            style={{ padding: '7px 10px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' }}>
            <option value="">All</option>
            {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={load}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 380px' : '1fr', gap: 20 }}>
        {/* User table */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>Loading users...</div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#5b6b74' }}>No users found.</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f7f9fa', borderBottom: '1px solid #d9e2e6' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Phone</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Joined</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #edf2f7', background: selectedUser?.id === u.id ? '#f0f7ff' : 'transparent' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#0f3340' }}>{u.fullName}</div>
                        {u.email && <div style={{ fontSize: 11, color: '#a0aec0' }}>{u.email}</div>}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{u.phone}</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: `${statusColor(u.status)}18`, color: statusColor(u.status), fontWeight: 600,
                        }}>{u.status}</span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#5b6b74' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleViewDetail(u.id)}
                            style={{ padding: '3px 8px', fontSize: 11, background: '#e3f2fd', color: '#1565c0', border: '1px solid #bbdefb', borderRadius: 4, cursor: 'pointer' }}>
                            View
                          </button>
                          {u.status === 'ACTIVE' && (
                            <button onClick={() => handleStatusChange(u.id, 'SUSPENDED')}
                              style={{ padding: '3px 8px', fontSize: 11, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>
                              Suspend
                            </button>
                          )}
                          {u.status !== 'ACTIVE' && (
                            <button onClick={() => handleStatusChange(u.id, 'ACTIVE')}
                              style={{ padding: '3px 8px', fontSize: 11, background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9', borderRadius: 4, cursor: 'pointer' }}>
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{ padding: '6px 14px', fontSize: 12, background: page === 0 ? '#edf2f7' : '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#a0aec0' : '#0f3340' }}>
                Previous
              </button>
              <span style={{ fontSize: 12, color: '#5b6b74', padding: '6px 8px' }}>Page {page + 1} of {Math.ceil(total / limit)}</span>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 14px', fontSize: 12, background: '#fff', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', color: '#0f3340' }}>
                Next
              </button>
            </div>
          )}
        </div>

        {/* User detail panel */}
        {selectedUser && (
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 20, position: 'sticky', top: 20, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', margin: 0 }}>User Detail</h2>
              <button onClick={() => setSelectedUser(null)}
                style={{ padding: '2px 8px', fontSize: 14, background: 'transparent', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', color: '#5b6b74' }}>
                ×
              </button>
            </div>

            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#5b6b74' }}>Loading...</div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>{selectedUser.fullName}</div>
                  <div style={{ fontSize: 13, color: '#5b6b74', marginBottom: 2 }}>{selectedUser.phone}</div>
                  {selectedUser.email && <div style={{ fontSize: 13, color: '#5b6b74' }}>{selectedUser.email}</div>}
                  <div style={{ marginTop: 8 }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10,
                      background: `${statusColor(selectedUser.status)}18`, color: statusColor(selectedUser.status), fontWeight: 600,
                    }}>{selectedUser.status}</span>
                    <span style={{ fontSize: 11, color: '#a0aec0', marginLeft: 8 }}>Locale: {selectedUser.locale}</span>
                  </div>
                </div>

                {/* Org memberships */}
                <div style={{ borderTop: '1px solid #edf2f7', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', margin: 0 }}>
                      Organizations ({selectedUser.organizations.length})
                    </h3>
                    <button onClick={() => setShowRoleModal(true)}
                      style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      + Assign Role
                    </button>
                  </div>

                  {selectedUser.organizations.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#a0aec0', margin: '8px 0' }}>No organization memberships</p>
                  ) : (
                    selectedUser.organizations.map((org, i) => (
                      <div key={i} style={{ padding: '8px 0', borderBottom: i < selectedUser.organizations.length - 1 ? '1px solid #f0f4f6' : 'none' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>{org.orgName}</div>
                        <div style={{ fontSize: 11, color: '#a0aec0' }}>{org.orgType} · Joined {new Date(org.joinedAt).toLocaleDateString()}</div>
                        <div style={{ marginTop: 4 }}>
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 8,
                            background: `${roleBadgeColor(org.roleKey)}18`, color: roleBadgeColor(org.roleKey), fontWeight: 600,
                          }}>{org.roleKey}</span>
                          <span style={{ fontSize: 10, color: '#a0aec0', marginLeft: 4 }}>{org.roleName}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* Role assignment modal */}
            {showRoleModal && (
              <div style={{ marginTop: 16, padding: 16, background: '#f7f9fa', borderRadius: 8, border: '1px solid #d9e2e6' }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', margin: '0 0 12px' }}>Assign Role</h4>
                <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Organization ID</label>
                <input type="text" value={roleForm.orgId} onChange={e => setRoleForm(f => ({ ...f, orgId: e.target.value }))}
                  placeholder="UUID of organization" style={{ width: '100%', padding: '6px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
                <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>Role</label>
                <select value={roleForm.roleId} onChange={e => setRoleForm(f => ({ ...f, roleId: e.target.value }))}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d9e2e6', borderRadius: 4, fontSize: 12, marginBottom: 12, background: '#fff', boxSizing: 'border-box' }}>
                  <option value="">Select role...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.key} — {r.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={handleAssignRole} disabled={roleSaving || !roleForm.orgId || !roleForm.roleId}
                    style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: (roleSaving || !roleForm.orgId || !roleForm.roleId) ? 0.5 : 1 }}>
                    {roleSaving ? 'Assigning...' : 'Assign'}
                  </button>
                  <button onClick={() => { setShowRoleModal(false); setRoleForm({ orgId: '', roleId: '' }); }}
                    style={{ padding: '6px 14px', fontSize: 12, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#5b6b74', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };
