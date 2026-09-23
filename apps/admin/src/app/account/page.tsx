'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getUser,
  setupCredentials,
  changePassword,
  getSessions,
  revokeSessionsByDevice,
  type AdminSessionInfo,
} from '../../lib/auth';
import {
  PageHeader, Card, Button, TextInput,
  colors, typeScale, fonts, radii, shadows, transitions,
} from '@scs/ui-kit';

/**
 * Admin → Account Security (ADM-B1).
 *
 * Ports the credential self-service that previously existed only in the web app:
 * set up a password, change a password, and review/revoke active sessions.
 * Platform staff are high-privilege, so they must be able to rotate their own
 * credentials and audit their sessions without leaving the admin console.
 */

function deviceLabel(s: AdminSessionInfo): string {
  const base = s.device || 'unknown device';
  return s.deviceId ? `${base} · ${s.deviceId.slice(0, 8)}` : base;
}

export default function AccountSecurityPage() {
  const user = getUser();

  // Set-up password form
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');

  const [setupMsg, setSetupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changeMsg, setChangeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<AdminSessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      setSessions(await getSessions());
    } catch (err) {
      setSessionsError((err as Error).message || 'Failed to load sessions');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupMsg(null);
    if (!setupEmail.trim()) {
      setSetupMsg({ ok: false, text: 'Email is required' });
      return;
    }
    if (setupPassword.length < 8) {
      setSetupMsg({ ok: false, text: 'Password must be at least 8 characters' });
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupMsg({ ok: false, text: 'Passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      await setupCredentials(setupEmail.trim(), setupPassword);
      setSetupMsg({ ok: true, text: 'Password set. You can now use email/password login.' });
      setSetupPassword('');
      setSetupConfirm('');
    } catch (err) {
      setSetupMsg({ ok: false, text: (err as Error).message || 'Setup failed' });
    } finally {
      setBusy(false);
    }
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setChangeMsg(null);
    if (!currentPassword) {
      setChangeMsg({ ok: false, text: 'Current password is required' });
      return;
    }
    if (newPassword.length < 8) {
      setChangeMsg({ ok: false, text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== newConfirm) {
      setChangeMsg({ ok: false, text: 'Passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setChangeMsg({ ok: true, text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setNewConfirm('');
      loadSessions();
    } catch (err) {
      setChangeMsg({ ok: false, text: (err as Error).message || 'Change failed' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(deviceId: string) {
    if (!deviceId) return;
    try {
      await revokeSessionsByDevice(deviceId);
      loadSessions();
    } catch (err) {
      setSessionsError((err as Error).message || 'Failed to revoke session');
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '14px 18px', fontWeight: 600,
    color: 'rgba(255,255,255,0.92)', fontSize: typeScale.caption.fontSize,
    textTransform: 'uppercase', letterSpacing: '0.6px',
  };

  return (
    <>
      <style>{`
        .tbl-row { transition: background ${transitions.fast}; }
        .tbl-row:hover { background: #e5f2f8 !important; }
        .tbl-row:nth-child(even) { background: ${colors.bgSubtle}; }
        .tbl-row:nth-child(even):hover { background: #e5f2f8 !important; }
        .tbl-last td { border-bottom: none !important; }
      `}</style>

      <PageHeader
        title="Account Security"
        subtitle={`Manage your password and active sessions${user ? ` — signed in as ${user.fullName} (${user.role})` : ''}.`}
      />

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Set up password */}
        <Card style={{ marginBottom: 20, padding: 24 }} shadow>
          <h2 style={{ ...typeScale.h3, color: colors.brand[700], marginBottom: 4 }}>
            Set up password
          </h2>
          <p style={{ color: colors.muted, ...typeScale.bodySm, marginBottom: 16 }}>
            If you sign in with OTP and have not set a password yet, create one here to enable
            email/password login.
          </p>
          <form onSubmit={handleSetup}>
            <TextInput
              label="Email"
              type="email"
              value={setupEmail}
              onChange={(e) => setSetupEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              style={{ marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <TextInput
                label="New password"
                type="password"
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                autoComplete="new-password"
                style={{ flex: 1 }}
              />
              <TextInput
                label="Confirm password"
                type="password"
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                autoComplete="new-password"
                style={{ flex: 1 }}
              />
            </div>
            {setupMsg && (
              <div style={{ fontSize: typeScale.bodySm.fontSize, marginBottom: 10, color: setupMsg.ok ? colors.ok : colors.err }}>
                {setupMsg.text}
              </div>
            )}
            <Button type="submit" disabled={busy}>Set password</Button>
          </form>
        </Card>

        {/* Change password */}
        <Card style={{ marginBottom: 20, padding: 24 }} shadow>
          <h2 style={{ ...typeScale.h3, color: colors.brand[700], marginBottom: 4 }}>
            Change password
          </h2>
          <p style={{ color: colors.muted, ...typeScale.bodySm, marginBottom: 16 }}>
            Rotate your password. Other active sessions are preserved; review them below.
          </p>
          <form onSubmit={handleChange}>
            <TextInput
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              style={{ marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <TextInput
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                style={{ flex: 1 }}
              />
              <TextInput
                label="Confirm new password"
                type="password"
                value={newConfirm}
                onChange={(e) => setNewConfirm(e.target.value)}
                autoComplete="new-password"
                style={{ flex: 1 }}
              />
            </div>
            {changeMsg && (
              <div style={{ fontSize: typeScale.bodySm.fontSize, marginBottom: 10, color: changeMsg.ok ? colors.ok : colors.err }}>
                {changeMsg.text}
              </div>
            )}
            <Button type="submit" disabled={busy}>Change password</Button>
          </form>
        </Card>

        {/* Active sessions */}
        <Card style={{ padding: 24 }} shadow>
          <h2 style={{ ...typeScale.h3, color: colors.brand[700], marginBottom: 4 }}>
            Active sessions
          </h2>
          <p style={{ color: colors.muted, ...typeScale.bodySm, marginBottom: 16 }}>
            Devices currently signed in to your account. Revoke any you do not recognize.
          </p>
          {sessionsLoading ? (
            <div style={{ color: colors.muted, ...typeScale.body }}>Loading sessions…</div>
          ) : sessionsError ? (
            <div style={{ color: colors.err, ...typeScale.body }}>{sessionsError}</div>
          ) : sessions.length === 0 ? (
            <div style={{ color: colors.muted, ...typeScale.body }}>No active sessions.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typeScale.body.fontSize }}>
              <thead>
                <tr style={{ textAlign: 'left', background: 'linear-gradient(135deg, #103744 0%, #1a4a5c 100%)' }}>
                  <th style={thStyle}>Device</th>
                  <th style={thStyle}>IP</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ padding: '14px 18px' }}></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="tbl-row" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <td style={{ padding: '14px 18px', fontSize: typeScale.body.fontSize, color: colors.ink }}>{deviceLabel(s)}</td>
                    <td style={{ padding: '14px 18px', color: colors.muted, ...typeScale.bodySm, fontFamily: fonts.mono }}>{s.ip || '—'}</td>
                    <td style={{ padding: '14px 18px', color: colors.muted, ...typeScale.bodySm }}>
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {s.isRevoked ? (
                        <span style={{ color: colors.err, ...typeScale.caption, fontWeight: 600 }}>Revoked</span>
                      ) : s.isCurrent ? (
                        <span style={{ color: colors.ok, ...typeScale.caption, fontWeight: 600 }}>Current</span>
                      ) : (
                        <span style={{ color: colors.muted, ...typeScale.caption }}>Active</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      {!s.isCurrent && !s.isRevoked && s.deviceId && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRevoke(s.deviceId!)}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
