'use client';

import { useState, useEffect } from 'react';
import { getSessions, revokeSessionsByDevice } from '@/lib/auth';
import { PageHeader, colors, radii, shadows } from '@scs/ui-kit';

interface Session {
  id: string;
  device: string;
  deviceId: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
  isRevoked: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Revoke all sessions for this device?')) return;

    setError('');
    setSuccess('');

    try {
      await revokeSessionsByDevice(deviceId);
      setSuccess('Sessions revoked successfully');
      await loadSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke sessions');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getDeviceName = (session: Session) => {
    if (session.device) {
      if (session.device.includes('Chrome')) return 'Chrome Browser';
      if (session.device.includes('Firefox')) return 'Firefox Browser';
      if (session.device.includes('Safari')) return 'Safari Browser';
      if (session.device.includes('Edge')) return 'Edge Browser';
      return session.device.substring(0, 50);
    }
    return 'Unknown Device';
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 48, textAlign: 'center', color: colors.muted }}>
        Loading sessions...
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tbl-row { transition: background 0.15s ease; }
        .tbl-row:hover { background: #f7f9fa !important; }
        .tbl-row:nth-child(even) { background: #f7f9fa; }
        .tbl-row:nth-child(even):hover { background: #f7f9fa !important; }
      `}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Active Sessions" subtitle="Manage your active sessions across devices" />
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <div style={{ background: colors.errBg, border: `1px solid ${colors.errBorder}`, color: colors.err, padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {success && <div style={{ background: colors.okBg, border: `1px solid ${colors.okBorder}`, color: colors.ok, padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{success}</div>}

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr style={theadRow}>
              <th style={th}>Device</th>
              <th style={th}>IP Address</th>
              <th style={th}>Last Active</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} className="tbl-row" style={tbodyRow}>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: colors.brand[700] }}>
                    {getDeviceName(session)}
                    {session.isCurrent && (
                      <span style={{ marginLeft: 8, padding: '1px 8px', fontSize: 10, fontWeight: 600, background: colors.okBg, color: colors.ok, borderRadius: 8 }}>
                        Current
                      </span>
                    )}
                  </div>
                  {session.deviceId && (
                    <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      ID: {session.deviceId.substring(0, 8)}...
                    </div>
                  )}
                </td>
                <td style={td}>{session.ip || 'Unknown'}</td>
                <td style={td}>{formatDate(session.createdAt)}</td>
                <td style={td}>
                  {session.isRevoked ? (
                    <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: colors.errBg, color: colors.err, borderRadius: 8 }}>
                      Revoked
                    </span>
                  ) : (
                    <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: colors.okBg, color: colors.ok, borderRadius: 8 }}>
                      Active
                    </span>
                  )}
                </td>
                <td style={td}>
                  {!session.isCurrent && !session.isRevoked && session.deviceId && (
                    <button
                      onClick={() => handleRevokeDevice(session.deviceId!)}
                      style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: colors.err, border: `1px solid ${colors.border}`, borderRadius: 4, cursor: 'pointer' }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: colors.muted, fontSize: 13 }}>
            No active sessions found
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, background: '#dbeafe', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: colors.brand[700], marginBottom: 8 }}>About Sessions</h3>
        <div style={{ fontSize: 13, color: colors.brand[700], lineHeight: 1.6 }}>
          <div>• Sessions track where you're logged in across devices</div>
          <div>• Revoking a session will log you out on that device</div>
          <div>• The "Current" session is the one you're using now</div>
          <div>• Sessions automatically expire after 30 days of inactivity</div>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}

const tableWrap: React.CSSProperties = { background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: colors.brand[700] };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
