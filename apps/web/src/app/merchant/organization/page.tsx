'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchProfile, fetchOrganization, updateOrganization,
  fetchOrgMembers, addOrgMember, removeOrgMember,
  lookupOrgMember, fetchRoles,
  Organization, OrgMember, UserLookupResult, RoleInfo,
} from '../../../lib/api';
import { LoadingSpinner, ErrorBanner, EmptyState, StatusBadge, formatDate } from '../../../components/Shared';

export default function MerchantOrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');

  // Members
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<UserLookupResult[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserLookupResult | null>(null);

  const populate = useCallback((o: Organization) => {
    setOrg(o);
    setName(o.name || '');
    setLegalName(o.legalName || '');
    setTaxId(o.taxId || '');
  }, []);

  const loadMembers = useCallback(async (orgId: string) => {
    try {
      setMembers(await fetchOrgMembers(orgId));
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchProfile();
        let orgId = profile.activeOrgId;
        if (!orgId) orgId = profile.organizations?.[0]?.id ?? null;
        if (!orgId) { setNoOrg(true); return; }
        // profile.organizations already carries the full org; fall back to a direct fetch
        const fromProfile = profile.organizations?.find(o => o.id === orgId);
        const full = fromProfile ? (fromProfile as Organization) : await fetchOrganization(orgId);
        populate(full);
        await loadMembers(full.id);
      } catch (err: any) {
        setError(err.message || 'Failed to load organization');
      } finally {
        setLoading(false);
      }
    })();
  }, [populate, loadMembers]);

  useEffect(() => {
    if (addOpen && roles.length === 0) {
      fetchRoles().then(setRoles).catch(() => {});
    }
  }, [addOpen, roles.length]);

  const handleSave = async () => {
    if (!org) return;
    if (!name.trim()) { setError('Organization name is required'); return; }
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const updated = await updateOrganization(org.id, {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        taxId: taxId.trim() || undefined,
      });
      populate(updated);
      setSavedMsg('Organization saved');
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!org || !newUserId.trim() || !newRoleId.trim()) return;
    setAddingMember(true);
    setError('');
    try {
      await addOrgMember(org.id, newUserId.trim(), newRoleId.trim());
      setNewUserId(''); setNewRoleId(''); setAddOpen(false);
      setLookupQuery(''); setLookupResults([]); setSelectedUser(null);
      await loadMembers(org.id);
    } catch (err: any) {
      setError(err.message || 'Add member failed');
    } finally {
      setAddingMember(false);
    }
  };

  const handleLookup = async () => {
    if (!org || !lookupQuery.trim() || lookupQuery.trim().length < 3) return;
    setLookingUp(true);
    try {
      const results = await lookupOrgMember(org.id, lookupQuery.trim());
      setLookupResults(results);
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSelectUser = (user: UserLookupResult) => {
    setSelectedUser(user);
    setNewUserId(user.id);
    setLookupResults([]);
    setLookupQuery('');
  };

  const handleRemoveMember = async (m: OrgMember) => {
    if (!org) return;
    if (!window.confirm(`Remove ${m.fullName || m.userId} from this organization?`)) return;
    setError('');
    try {
      await removeOrgMember(org.id, m.userId);
      await loadMembers(org.id);
    } catch (err: any) {
      setError(err.message || 'Remove member failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  if (noOrg || !org) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <h1 style={h1}>Organization</h1>
        <EmptyState
          title="No organization yet"
          description="Register a business organization to get started."
          action={<Link href="/merchant/register" style={primaryLink}>Register Organization</Link>}
        />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
      `}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header Banner */}
        <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Organization</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>{org.type} · {org.verificationStatus}</p>
        </div>
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <ErrorBanner message={error} />}
      {savedMsg && <div style={successBanner}>{savedMsg}</div>}

      <div style={card}>
        <h2 style={sectionTitle}>Business Details</h2>
        <div style={grid}>
          <label style={label}>Name *
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={input} />
          </label>
          <label style={label}>Legal Name
            <input type="text" value={legalName} onChange={e => setLegalName(e.target.value)} style={input} />
          </label>
          <label style={label}>Tax ID
            <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} style={input} />
          </label>
        </div>

        <div style={readOnlyRow}>
          <ReadOnlyField label="Country" value={org.country} />
          <ReadOnlyField label="Type" value={org.type} />
          <ReadOnlyField label="Invite Code" value={org.inviteCode || '—'} mono />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={handleSave} disabled={saving || !name.trim()} style={primaryBtn}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Members */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Members ({members.length})</h2>
          <button onClick={() => setAddOpen(v => !v)} style={ghostBtn}>{addOpen ? 'Close' : '+ Add Member'}</button>
        </div>

        {addOpen && (
          <div style={{ background: '#f7f9fa', border: '1px solid #d9e2e6', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: '#5b6b74', marginBottom: 10 }}>
              Search for a user by phone or email, then select a role.
            </p>
            
            {/* User Lookup */}
            {!selectedUser ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Phone or email (min 3 characters)"
                    value={lookupQuery}
                    onChange={e => setLookupQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLookup()}
                    style={{ ...input, flex: 1 }}
                  />
                  <button
                    onClick={handleLookup}
                    disabled={lookingUp || lookupQuery.trim().length < 3}
                    style={{ ...primaryBtn, whiteSpace: 'nowrap', opacity: lookingUp || lookupQuery.trim().length < 3 ? 0.5 : 1 }}
                  >
                    {lookingUp ? 'Searching...' : 'Search'}
                  </button>
                </div>
                {lookupResults.length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {lookupResults.map(user => (
                      <div
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f2f4', fontSize: 13 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f7f9fa')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        <div style={{ fontWeight: 600, color: '#0f3340' }}>{user.fullName || 'Unknown'}</div>
                        <div style={{ fontSize: 11, color: '#5b6b74' }}>
                          {user.phone}{user.email ? ` · ${user.email}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {lookupResults.length === 0 && lookupQuery.trim().length >= 3 && !lookingUp && (
                  <p style={{ fontSize: 12, color: '#8a9ba5', margin: '8px 0 0' }}>No users found. Try a different phone or email.</p>
                )}
              </div>
            ) : (
              <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 6, padding: '10px 12px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#2e7d32', fontSize: 13 }}>{selectedUser.fullName || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>{selectedUser.phone}{selectedUser.email ? ` · ${selectedUser.email}` : ''}</div>
                </div>
                <button
                  onClick={() => { setSelectedUser(null); setNewUserId(''); }}
                  style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 12 }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Role Selection */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#5b6b74', marginBottom: 4 }}>Role *</label>
              <select
                value={newRoleId}
                onChange={e => setNewRoleId(e.target.value)}
                style={{ ...input, fontSize: 13 }}
              >
                <option value="">Select a role...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.key})</option>
                ))}
              </select>
            </div>

            <button onClick={handleAddMember} disabled={addingMember || !newUserId.trim() || !newRoleId.trim()} style={primaryBtn}>
              {addingMember ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        )}

        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: '#5b6b74' }}>No members found.</p>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead><tr style={theadRow}>
                <th style={th}>Member</th><th style={th}>Phone</th><th style={th}>Role</th>
                <th style={th}>Status</th><th style={th}>Joined</th><th style={th}>Actions</th>
              </tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.userId} className="tbl-row" style={tbodyRow}>
                    <td style={td}><span style={{ fontWeight: 600, color: '#0f3340' }}>{m.fullName || 'Unknown'}</span></td>
                    <td style={td}>{m.phone || '—'}</td>
                    <td style={td}><span style={chip}>{m.roleKey}</span></td>
                    <td style={td}>{m.status}</td>
                    <td style={td}>{m.joinedAt ? formatDate(m.joinedAt) : '—'}</td>
                    <td style={td}>
                      <button onClick={() => handleRemoveMember(m)} style={deleteBtn}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </div>
      </div>
    </>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5b6b74', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f3340', fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 4 };
const backLink: React.CSSProperties = { fontSize: 13, color: '#5b6b74', textDecoration: 'none' };
const primaryLink: React.CSSProperties = { display: 'inline-block', padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', borderRadius: 6, textDecoration: 'none' };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 20 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b74', marginBottom: 8 };
const input: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#1f2937', background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '6px 14px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#5b6b74', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' };
const deleteBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' };
const successBanner: React.CSSProperties = { background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 };
const chip: React.CSSProperties = { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#edf2f7', color: '#4a5568' };
const readOnlyRow: React.CSSProperties = { display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 0 0', borderTop: '1px solid #eef2f5', marginTop: 4 };
const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
