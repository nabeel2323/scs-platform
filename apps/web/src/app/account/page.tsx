'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchProfile, updateProfile, fetchMyOrganizations, fetchDevices, unregisterDevice, UserProfile, DeviceToken } from '../../lib/buyer-api';
import { isAuthenticated, switchOrg, hasMerchantAccess, requestEmailOtp, requestOtp, linkEmail, linkPhone, unlinkEmail, unlinkPhone } from '../../lib/auth';
import { ErrorBanner } from '../../components/Shared';
import { classifyOtpDelivery, type OtpDeliveryOutcome } from '@scs/contracts';
import { PageHeader, colors, radii } from '@scs/ui-kit';

/**
 * What the user is told when an OTP request was NOT accepted.
 *
 * A 2xx from the request route means "processed", not "sent" — the provider's
 * answer travels in the body. Mirrors the login page's wording so the two
 * surfaces cannot drift apart.
 */
function linkDeliveryMessage(
  outcome: Exclude<OtpDeliveryOutcome, 'delivered'>,
  destination: string,
  channelLabel: string,
): string {
  switch (outcome) {
    case 'unavailable':
      return `${channelLabel} delivery isn't available right now, so nothing was sent to ${destination}.`;
    case 'uncertain':
      return `We couldn't confirm that a code reached ${destination}. It may still arrive — if it does, you can enter it.`;
    default:
      return `The code couldn't be sent to ${destination}. Check the address and try again.`;
  }
}

/** Label shown next to the code field once a challenge exists. */
function linkDeliveryLabel(note: 'sent' | 'uncertain', destination: string): string {
  return note === 'sent'
    ? `Code sent to ${destination}`
    : `Code not confirmed for ${destination} — it may still arrive`;
}

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

  // Account linking state (S1.38 F-17)
  const [linkEmailAddr, setLinkEmailAddr] = useState('');
  const [linkEmailOtp, setLinkEmailOtp] = useState('');
  const [linkEmailStage, setLinkEmailStage] = useState<'idle' | 'verify'>('idle');
  const [linkEmailNote, setLinkEmailNote] = useState<'sent' | 'uncertain'>('sent');
  const [linkEmailError, setLinkEmailError] = useState('');
  const [linkPhoneNum, setLinkPhoneNum] = useState('');
  const [linkPhoneOtp, setLinkPhoneOtp] = useState('');
  const [linkPhoneStage, setLinkPhoneStage] = useState<'idle' | 'verify'>('idle');
  const [linkPhoneNote, setLinkPhoneNote] = useState<'sent' | 'uncertain'>('sent');
  const [linkPhoneError, setLinkPhoneError] = useState('');
  const [linkAction, setLinkAction] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState('');

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

  // ── Account linking handlers (S1.38 F-17) ──

  const handleRequestLinkEmail = async () => {
    setLinkEmailError('');
    setLinkSuccess('');
    if (!linkEmailAddr) return;
    setLinkAction('req-email');
    try {
      // Only an accepted send is a send. An uncertain outcome still leaves a
      // live challenge, so code entry is offered but labelled unconfirmed.
      const outcome = classifyOtpDelivery(await requestEmailOtp(linkEmailAddr));
      if (outcome === 'delivered' || outcome === 'uncertain') {
        setLinkEmailNote(outcome === 'delivered' ? 'sent' : 'uncertain');
        setLinkEmailStage('verify');
      } else {
        setLinkEmailError(linkDeliveryMessage(outcome, linkEmailAddr, 'Email'));
      }
    } catch (err: any) {
      setLinkEmailError(err.message || 'Failed to send OTP');
    } finally { setLinkAction(null); }
  };

  const handleLinkEmail = async () => {
    setLinkEmailError('');
    setLinkSuccess('');
    if (!linkEmailAddr || !linkEmailOtp) return;
    setLinkAction('link-email');
    try {
      await linkEmail(linkEmailAddr, linkEmailOtp);
      setLinkSuccess(`Email ${linkEmailAddr} linked successfully.`);
      setLinkEmailAddr('');
      setLinkEmailOtp('');
      setLinkEmailStage('idle');
      // Refresh profile to reflect new email
      const p = await fetchProfile().catch(() => null);
      if (p) setProfile(p);
    } catch (err: any) {
      setLinkEmailError(err.message || 'Failed to link email');
    } finally { setLinkAction(null); }
  };

  const handleRequestLinkPhone = async () => {
    setLinkPhoneError('');
    setLinkSuccess('');
    if (!linkPhoneNum) return;
    setLinkAction('req-phone');
    try {
      // Phone linking stays available for the future SMS phase, but under the
      // email-only release the API answers SMS_CHANNEL_DISABLED. That must be
      // reported as "nothing was sent", never as a code on its way.
      const outcome = classifyOtpDelivery(await requestOtp(linkPhoneNum, 'sms'));
      if (outcome === 'delivered' || outcome === 'uncertain') {
        setLinkPhoneNote(outcome === 'delivered' ? 'sent' : 'uncertain');
        setLinkPhoneStage('verify');
      } else {
        setLinkPhoneError(linkDeliveryMessage(outcome, linkPhoneNum, 'SMS'));
      }
    } catch (err: any) {
      setLinkPhoneError(err.message || 'Failed to send OTP');
    } finally { setLinkAction(null); }
  };

  const handleLinkPhone = async () => {
    setLinkPhoneError('');
    setLinkSuccess('');
    if (!linkPhoneNum || !linkPhoneOtp) return;
    setLinkAction('link-phone');
    try {
      await linkPhone(linkPhoneNum, linkPhoneOtp);
      setLinkSuccess(`Phone ${linkPhoneNum} linked successfully.`);
      setLinkPhoneNum('');
      setLinkPhoneOtp('');
      setLinkPhoneStage('idle');
      const p = await fetchProfile().catch(() => null);
      if (p) setProfile(p);
    } catch (err: any) {
      setLinkPhoneError(err.message || 'Failed to link phone');
    } finally { setLinkAction(null); }
  };

  const handleUnlinkEmail = async () => {
    if (!confirm('Remove email from your account? You will no longer be able to use email OTP to sign in.')) return;
    setLinkEmailError('');
    setLinkSuccess('');
    setLinkAction('unlink-email');
    try {
      await unlinkEmail();
      setLinkSuccess('Email removed from account.');
      const p = await fetchProfile().catch(() => null);
      if (p) setProfile(p);
    } catch (err: any) {
      setLinkEmailError(err.message || 'Failed to unlink email');
    } finally { setLinkAction(null); }
  };

  const handleUnlinkPhone = async () => {
    if (!confirm('Remove phone from your account? You will no longer be able to use phone OTP to sign in.')) return;
    setLinkPhoneError('');
    setLinkSuccess('');
    setLinkAction('unlink-phone');
    try {
      await unlinkPhone();
      setLinkSuccess('Phone removed from account.');
      const p = await fetchProfile().catch(() => null);
      if (p) setProfile(p);
    } catch (err: any) {
      setLinkPhoneError(err.message || 'Failed to unlink phone');
    } finally { setLinkAction(null); }
  };

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('android')) return '🤖';
    if (p.includes('ios') || p.includes('apple')) return '🍎';
    if (p.includes('web')) return '🌐';
    return '📱';
  };

  if (loading) return <div style={{ padding: 32, color: colors.muted }}>Loading account...</div>;
  if (!profile) return <div style={{ padding: 32, color: colors.err }}>Failed to load account.</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader title="My Account" subtitle={`${profile.fullName} · ${profile.email || 'No email'}`} />
      <div style={{ padding: '20px 24px 48px' }}>

      {/* Profile section */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], margin: 0 }}>Profile</h2>
          {!editing && (
            <button onClick={() => { setEditing(true); setForm({ fullName: profile.fullName, email: profile.email || '', locale: profile.locale }); }}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: colors.brand[700], color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
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
            <div><span style={{ color: colors.muted, fontSize: 12 }}>Full Name</span><br />{profile.fullName}</div>
            <div><span style={{ color: colors.muted, fontSize: 12 }}>Phone</span><br /><code style={{ fontSize: 13, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{profile.phone || '—'}</code></div>
            <div><span style={{ color: colors.muted, fontSize: 12 }}>Email</span><br />{profile.email || '—'}</div>
            <div><span style={{ color: colors.muted, fontSize: 12 }}>Locale</span><br />{profile.locale === 'ar' ? 'العربية' : 'English'}</div>
            <div><span style={{ color: colors.muted, fontSize: 12 }}>Status</span><br />
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                background: profile.status === 'ACTIVE' ? colors.okBg : colors.warnBg,
                color: profile.status === 'ACTIVE' ? colors.ok : colors.warn,
              }}>{profile.status}</span>
            </div>
            <div><span style={{ color: colors.muted, fontSize: 12 }}>User ID</span><br /><code style={{ fontSize: 11, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{profile.id.slice(0, 8)}...</code></div>
          </div>
        )}
      </div>

      {/* Authentication Methods (S1.38 F-17) */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>Authentication Methods</h2>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Link or remove sign-in methods. You must keep at least one active method.
        </p>

        {linkSuccess && (
          <div style={{ background: colors.okBg, color: colors.ok, padding: '8px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{linkSuccess}</div>
        )}

        {/* Email */}
        <div style={{ padding: '12px 0', borderBottom: '1px solid #edf2f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: colors.muted, fontSize: 12 }}>Email</span><br />
              {profile.email ? <code style={{ fontSize: 13, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{profile.email}</code> : <span style={{ color: colors.muted }}>Not linked</span>}
            </div>
            {profile.email && (
              <button onClick={handleUnlinkEmail} disabled={linkAction === 'unlink-email'}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: `1px solid ${colors.errBorder}`, borderRadius: 6, cursor: 'pointer' }}>
                {linkAction === 'unlink-email' ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
          {!profile.email && (
            <div style={{ marginTop: 8 }}>
              {linkEmailStage === 'idle' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="email" value={linkEmailAddr} onChange={e => setLinkEmailAddr(e.target.value)} placeholder="you@example.com" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                  <button onClick={handleRequestLinkEmail} disabled={!linkEmailAddr || linkAction === 'req-email'}
                    style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: colors.brand[700], color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {linkAction === 'req-email' ? 'Sending...' : 'Send OTP'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.muted, whiteSpace: 'nowrap' }}>{linkDeliveryLabel(linkEmailNote, linkEmailAddr)}</span>
                  <input type="text" value={linkEmailOtp} onChange={e => setLinkEmailOtp(e.target.value)} placeholder="123456" maxLength={6} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                  <button onClick={handleLinkEmail} disabled={!linkEmailOtp || linkAction === 'link-email'}
                    style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    {linkAction === 'link-email' ? 'Linking...' : 'Link'}
                  </button>
                  <button onClick={() => { setLinkEmailStage('idle'); setLinkEmailOtp(''); setLinkEmailError(''); }}
                    style={{ padding: '8px 10px', fontSize: 12, background: '#edf2f7', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {/* S1.38.2: an unlink failure happens while the identity is still linked,
              so the message must render outside the “not linked” branch. */}
          {linkEmailError && <div role="alert" style={{ color: colors.err, fontSize: 12, marginTop: 4 }}>{linkEmailError}</div>}
        </div>

        {/* Phone */}
        <div style={{ padding: '12px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: colors.muted, fontSize: 12 }}>Phone</span><br />
              {profile.phone ? <code style={{ fontSize: 13, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4 }}>{profile.phone}</code> : <span style={{ color: colors.muted }}>Not linked</span>}
            </div>
            {profile.phone && (
              <button onClick={handleUnlinkPhone} disabled={linkAction === 'unlink-phone'}
                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: `1px solid ${colors.errBorder}`, borderRadius: 6, cursor: 'pointer' }}>
                {linkAction === 'unlink-phone' ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
          {!profile.phone && (
            <div style={{ marginTop: 8 }}>
              {linkPhoneStage === 'idle' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="tel" value={linkPhoneNum} onChange={e => setLinkPhoneNum(e.target.value)} placeholder="+966 5XX XXX XXXX" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                  <button onClick={handleRequestLinkPhone} disabled={!linkPhoneNum || linkAction === 'req-phone'}
                    style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: colors.brand[700], color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {linkAction === 'req-phone' ? 'Sending...' : 'Send OTP'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.muted, whiteSpace: 'nowrap' }}>{linkDeliveryLabel(linkPhoneNote, linkPhoneNum)}</span>
                  <input type="text" value={linkPhoneOtp} onChange={e => setLinkPhoneOtp(e.target.value)} placeholder="123456" maxLength={6} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                  <button onClick={handleLinkPhone} disabled={!linkPhoneOtp || linkAction === 'link-phone'}
                    style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#065f46', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    {linkAction === 'link-phone' ? 'Linking...' : 'Link'}
                  </button>
                  <button onClick={() => { setLinkPhoneStage('idle'); setLinkPhoneOtp(''); setLinkPhoneError(''); }}
                    style={{ padding: '8px 10px', fontSize: 12, background: '#edf2f7', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {linkPhoneError && <div role="alert" style={{ color: colors.err, fontSize: 12, marginTop: 4 }}>{linkPhoneError}</div>}
        </div>
      </div>

      {/* Organizations */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>Organizations</h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
          Merchant tools operate on the active organization{profile.role ? ` — your current role is ${profile.role}` : ''}.
        </p>
        {orgError && <ErrorBanner message={orgError} />}
        {orgs.length === 0 ? (
          <p style={{ color: colors.muted, fontSize: 13 }}>No organization memberships.</p>
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
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: colors.errBg, color: colors.err, border: `1px solid ${colors.errBorder}` }}>
                          DEACTIVATED
                        </span>
                      )}
                    </div>
                    {org.inviteCode && (
                      <div style={{ marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: colors.muted }}>Invite code: </span>
                        <code style={{ fontSize: 12, background: '#f0f4f6', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px' }}>{org.inviteCode}</code>
                      </div>
                    )}
                  </div>
                  {isActive ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: colors.okBg, color: colors.ok, whiteSpace: 'nowrap' }}>
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => orgId && handleSwitchOrg(orgId)}
                      disabled={!orgId || !!switchingOrg}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: colors.brand[700], color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', opacity: switchingOrg && switchingOrg !== orgId ? 0.5 : 1 }}
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

      {/* Become a Merchant CTA — shown when user has no org memberships */}
      {orgs.length === 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
          borderRadius: 10, padding: 24, marginBottom: 20, color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)',
            }}>
              🏪
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Become a Merchant</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Register your business to sell products on the platform. You&apos;ll create an organization, set up your first store, and submit for verification.
              </p>

              {/* Benefits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 16 }}>
                {[
                  { icon: '📦', text: 'List unlimited products' },
                  { icon: '💰', text: 'Set your own pricing & promotions' },
                  { icon: '📊', text: 'Track orders & analytics' },
                  { icon: '🏢', text: 'Manage stores & warehouses' },
                ].map(b => (
                  <div key={b.text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                    <span>{b.icon}</span> {b.text}
                  </div>
                ))}
              </div>

              {/* Responsibilities */}
              <div style={{
                padding: '10px 14px', background: 'rgba(0,0,0,0.15)',
                borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,0.75)',
                marginBottom: 16, lineHeight: 1.5,
              }}>
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Merchant responsibilities:</strong>{' '}
                Maintain accurate product listings, fulfill orders promptly, handle returns per platform policy, and keep business documents up to date for verification.
              </div>

              <Link href="/merchant/register" style={{
                display: 'inline-block',
                padding: '10px 24px', fontSize: 14, fontWeight: 600,
                background: '#fff', color: colors.ok,
                borderRadius: 6, textDecoration: 'none',
              }}>
                Start Registration &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Merchant Dashboard link — shown when user already has merchant access */}
      {orgs.length > 0 && hasMerchantAccess() && (
        <div style={{
          background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10,
          padding: '16px 24px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], margin: '0 0 2px' }}>Merchant Dashboard</h2>
            <p style={{ fontSize: 13, color: colors.muted, margin: 0 }}>
              Manage your store, catalog, orders, and organization settings.
            </p>
          </div>
          <Link href="/merchant" style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 600,
            background: colors.brand[700], color: '#fff', borderRadius: 6,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Go to Dashboard &rarr;
          </Link>
        </div>
      )}

      {/* Security */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], marginBottom: 4 }}>Security</h2>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Set up email/password login and review your active sessions.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/profile/credentials')}
            style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: colors.brand[700], color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Email &amp; Password
          </button>
          <button onClick={() => router.push('/profile/sessions')}
            style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: colors.brand[700], border: `1px solid ${colors.border}`, borderRadius: 6, cursor: 'pointer' }}>
            Active Sessions
          </button>
        </div>
      </div>

      {/* Devices */}
      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.brand[700], marginBottom: 12 }}>Device Management</h2>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Manage devices registered for push notifications. Unregister devices you no longer use.
        </p>
        {devices.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: colors.muted, fontSize: 13 }}>
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.brand[700], marginBottom: 2 }}>
                    {device.platform.charAt(0).toUpperCase() + device.platform.slice(1)}
                    {device.appVersion && <span style={{ fontWeight: 400, color: colors.muted, marginLeft: 6 }}>v{device.appVersion}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted }}>
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
                    border: `1px solid ${colors.errBorder}`,
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

const labelStyle: React.CSSProperties = { fontSize: 12, color: colors.muted, display: 'flex', flexDirection: 'column', gap: 4 };
const inputStyle: React.CSSProperties = { padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13, background: '#fff' };
