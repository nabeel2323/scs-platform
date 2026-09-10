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

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #e6f0f5 !important; }
        .tbl-row:nth-child(even) { background: #f3f6f9; }
        .tbl-row:nth-child(even):hover { background: #e6f0f5 !important; }
        .tbl-last td { border-bottom: none !important; }
      `}</style>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)',
        padding: '32px 40px 28px', color: '#fff',
      }}>
        <div style={{ maxWidth: 1320 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Account Security</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
            Manage your password and active sessions
            {user ? ` — signed in as ${user.fullName} (${user.role})` : ''}.
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* Set up password */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>
            Set up password
          </h2>
          <p style={{ color: '#5b6b74', fontSize: 12, marginBottom: 16 }}>
            If you sign in with OTP and have not set a password yet, create one here to enable
            email/password login.
          </p>
          <form onSubmit={handleSetup}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>
                Email
              </label>
              <input
                type="email"
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                style={inputStyle}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>
                  New password
                </label>
                <input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>
                  Confirm password
                </label>
                <input
                  type="password"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
            </div>
            {setupMsg && (
              <div
                style={{ fontSize: 12, marginBottom: 10, color: setupMsg.ok ? '#1b7a4b' : '#b3372f' }}
              >
                {setupMsg.text}
              </div>
            )}
            <button type="submit" style={btnPrimary} disabled={busy}>
              Set password
            </button>
          </form>
        </div>

        {/* Change password */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>
            Change password
          </h2>
          <p style={{ color: '#5b6b74', fontSize: 12, marginBottom: 16 }}>
            Rotate your password. Other active sessions are preserved; review them below.
          </p>
          <form onSubmit={handleChange}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>
                  New password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#5b6b74', display: 'block', marginBottom: 3 }}>
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={newConfirm}
                  onChange={(e) => setNewConfirm(e.target.value)}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
            </div>
            {changeMsg && (
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 10,
                  color: changeMsg.ok ? '#1b7a4b' : '#b3372f',
                }}
              >
                {changeMsg.text}
              </div>
            )}
            <button type="submit" style={btnPrimary} disabled={busy}>
              Change password
            </button>
          </form>
        </div>

        {/* Active sessions */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>
            Active sessions
          </h2>
          <p style={{ color: '#5b6b74', fontSize: 12, marginBottom: 16 }}>
            Devices currently signed in to your account. Revoke any you do not recognize.
          </p>
          {sessionsLoading ? (
            <div style={{ color: '#5b6b74', fontSize: 13 }}>Loading sessions…</div>
          ) : sessionsError ? (
            <div style={{ color: '#b3372f', fontSize: 13 }}>{sessionsError}</div>
          ) : sessions.length === 0 ? (
            <div style={{ color: '#5b6b74', fontSize: 13 }}>No active sessions.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                    background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)',
                  }}
                >
                  <th style={{ padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Device</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>IP</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Created</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Status</th>
                  <th style={{ padding: '14px 18px' }}></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="tbl-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#1e2d35' }}>{deviceLabel(s)}</td>
                    <td style={{ padding: '14px 18px', color: '#5b6b74', fontSize: 12, fontFamily: 'monospace' }}>{s.ip || '—'}</td>
                    <td style={{ padding: '14px 18px', color: '#5b6b74', fontSize: 12 }}>
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {s.isRevoked ? (
                        <span style={{ color: '#b3372f', fontSize: 11, fontWeight: 600 }}>
                          Revoked
                        </span>
                      ) : s.isCurrent ? (
                        <span style={{ color: '#1b7a4b', fontSize: 11, fontWeight: 600 }}>
                          Current
                        </span>
                      ) : (
                        <span style={{ color: '#5b6b74', fontSize: 11 }}>Active</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      {!s.isCurrent && !s.isRevoked && s.deviceId && (
                        <button
                          onClick={() => handleRevoke(s.deviceId!)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11,
                            color: '#b3372f',
                            background: '#fff',
                            border: '1px solid #e6c9c6',
                            borderRadius: 5,
                            cursor: 'pointer',
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid #d9e2e6',
  borderRadius: 6,
  width: '100%',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#0f3340',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 24,
  marginBottom: 20,
  boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)',
};
