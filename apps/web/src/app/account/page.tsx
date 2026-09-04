'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchProfile, updateProfile, fetchMyOrganizations, UserProfile } from '../../lib/buyer-api';
import { isAuthenticated } from '../../lib/auth';

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orgs, setOrgs] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', locale: 'en' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth/login');
      return;
    }
    Promise.all([
      fetchProfile().then(setProfile).catch(() => {}),
      fetchMyOrganizations().then(setOrgs).catch(() => {}),
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

  if (loading) return <div style={{ padding: 32, color: '#5b6b74' }}>Loading account...</div>;
  if (!profile) return <div style={{ padding: 32, color: '#991b1b' }}>Failed to load account.</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340', marginBottom: 24 }}>My Account</h1>

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
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Organizations</h2>
        {orgs.length === 0 ? (
          <p style={{ color: '#5b6b74', fontSize: 13 }}>No organization memberships.</p>
        ) : (
          orgs.map((org: any, i: number) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7', fontSize: 13 }}>
              <strong>{org.name || org.orgId}</strong> — {org.role || 'Member'} ({org.status || 'ACTIVE'})
            </div>
          ))
        )}
      </div>

      {/* Devices */}
      <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Device Management</h2>
        <p style={{ color: '#5b6b74', fontSize: 13 }}>Manage your registered devices for push notifications. Use the mobile app to register/unregister devices.</p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#5b6b74', display: 'flex', flexDirection: 'column', gap: 4 };
const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d9e2e6', borderRadius: 6, fontSize: 13, background: '#fff' };
