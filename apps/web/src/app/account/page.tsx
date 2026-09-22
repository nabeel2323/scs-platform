'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchProfile, updateProfile, fetchMyOrganizations, fetchDevices, unregisterDevice, UserProfile, DeviceToken } from '../../lib/buyer-api';
import { isAuthenticated, switchOrg } from '../../lib/auth';
import { ErrorBanner } from '../../components/Shared';

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orgs, setOrgs] = useState<unknown[]>([]);
  const [devices, setDevices] = useState<DeviceToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', locale: 'en' });
  const [saving, setSaving] = useState(false);
  const [deviceAction, setDeviceAction] = useState<string | null>(null);
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null);
  const [orgError, setOrgError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth/login');
      return;
    }
    Promise.all([
      fetchProfile().then(setProfile).catch(() => {}),
      fetchMyOrganizations().then(setOrgs).catch(() => {}),
      fetchDevices().then(setDevices).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({
        fullName: form.fullName,
        email: form.email || undefined,
        locale: form.locale,
      });
      setProfile(updated);
      setEditing(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  // A2-2: the JWT's activeOrg claim drives every merchant-side scope, so a user
  // belonging to several orgs must be able to change it (previously only the
  // registration wizard ever called switchOrg). switchOrg re-hydrates the cached
  // user, and the profile/orgs are refetched so this page reflects the new role.
  const handleSwitchOrg = async (orgId: string) => {
    setSwitchingOrg(orgId);
    setOrgError('');
    try {
      await switchOrg(orgId);
      const [p, list] = await Promise.all([
        fetchProfile().catch(() => null),
        fetchMyOrganizations().catch(() => null),
      ]);
      if (p) setProfile(p);
      if (list) setOrgs(list);
      router.refresh();
    } catch (err: any) {
      setOrgError(err.message || 'Failed to switch organization');
    } finally {
      setSwitchingOrg(null);
    }
  };

  const handleUnregisterDevice = async (token: string) => {
    if (!confirm('Unregister this device? You will no longer receive push notifications on it.')) return;
    setDeviceAction(token);
    try {
      await unregisterDevice(token);
      setDevices(prev => prev.filter(d => d.token !== token));
    } catch { /* ignore */ }
    finally { setDeviceAction(null); }
  };

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('android')) return '🤖';
    if (p.includes('ios') || p.includes('apple')) return '🍎';
    if (p.includes('web')) return '🌐';
    return '📱';
  };

  if (loading) return <div style={{ padding: 32, color: '#5b6b74' }}>Loading account...</div>;
  if (!profile) return <div style={{ padding: 32, color: '#991b1b' }}>Failed to load account.</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>My Account</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>{profile.fullName} · {profile.email || 'No email'}</p>
      </div>
      <div style={{ padding: '20px 24px 48px' }}>

      {/* Profile section */}
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', margin: 0 }}>Profile</h2>
          {!editing && (
            <button onClick={() => { setEditing(true); setForm({ fullName: profile.fullName, email: profile.email || '', locale: profile.locale }); }}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={labelStyle}>Full Name
              <input type="text" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>Email
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>Locale
              <select value={form.locale} onChange={e => setForm(f => ({ ...f, locale: e.target.value }))} style={inputStyle}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: '8px 16px', fontSize: 13, background: '#edf2f7', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
            <div><span style={{ color: '#5b6b74', fontSize: 12 }}>Full Name</span><br />{profile.fullName}</div>
            <div><span style={{ color: '#5b6b74', fontSize: 12 }}>Phone</span><br /><code style={{ fontSize: 13, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{profile.phone}</code></div>
            <div><span style={{ color: '#5b6b74', fontSize: 12 }}>Email</span><br />{profile.email || '—'}</div>
            <div><span style={{ color: '#5b6b74', fontSize: 12 }}>Locale</span><br />{profile.locale === 'ar' ? 'العربية' : 'English'}</div>
            <div><span style={{ color: '#5b6b74', fontSize: 12 }}>Status</span><br />
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                background: profile.status === 'ACTIVE' ? '#d1fae5' : '#fef3c7',
                color: profile.status === 'ACTIVE' ? '#065f46' : '#92400e',
              }}>{profile.status}</span>
            </div>
            <div><span style={{ color: '#5b6b74', fontSize: 12 }}>User ID</span><br /><code style={{ fontSize: 11, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{profile.id.slice(0, 8)}...</code></div>
          </div>
        )}
      </div>

      {/* Organizations */}
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>Organizations</h2>
        <p style={{ color: '#5b6b74', fontSize: 13, margin: '0 0 12px' }}>
          Merchant tools operate on the active organization{profile.role ? ` — your current role is ${profile.role}` : ''}.
        </p>
        {orgError && <ErrorBanner message={orgError} />}
        {orgs.length === 0 ? (
          <p style={{ color: '#5b6b74', fontSize: 13 }}>No organization memberships.</p>
        ) : (
          orgs.map((org: any, i: number) => {
            // GET /v1/me/organizations spreads the organizations row, so the id
            // is `id` (there is no `orgId`/`role`/`status` on it).
            const orgId: string | undefined = org.id || org.orgId;
            const isActive = !!orgId && orgId === profile.activeOrgId;
            return (
              <div key={orgId || i} style={{ padding: '10px 0', borderBottom: '1px solid #edf2f7', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div>
                      <strong>{org.name || orgId}</strong> — {org.type || 'ORG'} ·{' '}
                      {org.verificationStatus || org.membershipStatus || 'PENDING'}
                      {org.isActive === false && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                          DEACTIVATED
                        </span>
                      )}
                    </div>
                    {org.inviteCode && (
                      <div style={{ marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#5b6b74' }}>Invite code: </span>
                        <code style={{ fontSize: 12, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px' }}>{org.inviteCode}</code>
                      </div>
                    )}
                  </div>
                  {isActive ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: '#d1fae5', color: '#065f46', whiteSpace: 'nowrap' }}>
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => orgId && handleSwitchOrg(orgId)}
                      disabled={!orgId || !!switchingOrg}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', opacity: switchingOrg && switchingOrg !== orgId ? 0.5 : 1 }}
                    >
                      {switchingOrg === orgId ? 'Switching…' : 'Switch to'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Security */}
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 4 }}>Security</h2>
        <p style={{ color: '#5b6b74', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Set up email/password login and review your active sessions.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/profile/credentials')}
            style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Email &amp; Password
          </button>
          <button onClick={() => router.push('/profile/sessions')}
            style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#0f3340', border: '1px solid #d9e2e6', borderRadius: 6, cursor: 'pointer' }}>
            Active Sessions
          </button>
        </div>
      </div>

      {/* Devices */}
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Device Management</h2>
        <p style={{ color: '#5b6b74', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Manage devices registered for push notifications. Unregister devices you no longer use.
        </p>
        {devices.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#5b6b74', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
            <div>No devices registered for push notifications.</div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#8a9ba5' }}>Use the mobile app to register your device.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {devices.map((device) => (
              <div key={device.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: '#f8fafb',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>
                  {getPlatformIcon(device.platform)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', marginBottom: 2 }}>
                    {device.platform.charAt(0).toUpperCase() + device.platform.slice(1)}
                    {device.appVersion && <span style={{ fontWeight: 400, color: '#5b6b74', marginLeft: 6 }}>v{device.appVersion}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#5b6b74' }}>
                    Last active: {new Date(device.lastSeenAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleUnregisterDevice(device.token)}
                  disabled={deviceAction === device.token}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: '#fff',
                    color: deviceAction === device.token ? '#8a9ba5' : '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: 6,
                    cursor: deviceAction === device.token ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {deviceAction === device.token ? 'Removing...' : 'Unregister'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#5b6b74', display: 'flex', flexDirection: 'column', gap: 4 };
const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' };
