'use client';

import { useState, useEffect } from 'react';
import { getSessions, revokeSessionsByDevice } from '@/lib/auth';

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
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 48, textAlign: 'center', color: '#5b6b74' }}>
        Loading sessions...
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
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Active Sessions</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>Manage your active sessions across devices</p>
        </div>
        <div style={{ padding: '20px 24px 48px' }}>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {success && <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{success}</div>}

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
                  <div style={{ fontWeight: 600, color: '#0f3340' }}>
                    {getDeviceName(session)}
                    {session.isCurrent && (
                      <span style={{ marginLeft: 8, padding: '1px 8px', fontSize: 10, fontWeight: 600, background: '#d1fae5', color: '#065f46', borderRadius: 8 }}>
                        Current
                      </span>
                    )}
                  </div>
                  {session.deviceId && (
                    <div style={{ fontSize: 11, color: '#5b6b74', marginTop: 2 }}>
                      ID: {session.deviceId.substring(0, 8)}...
                    </div>
                  )}
                </td>
                <td style={td}>{session.ip || 'Unknown'}</td>
                <td style={td}>{formatDate(session.createdAt)}</td>
                <td style={td}>
                  {session.isRevoked ? (
                    <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#991b1b', borderRadius: 8 }}>
                      Revoked
                    </span>
                  ) : (
                    <span style={{ padding: '2px 8px', fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46', borderRadius: 8 }}>
                      Active
                    </span>
                  )}
                </td>
                <td style={td}>
                  {!session.isCurrent && !session.isRevoked && session.deviceId && (
                    <button
                      onClick={() => handleRevokeDevice(session.deviceId!)}
                      style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}
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
          <div style={{ textAlign: 'center', padding: 32, color: '#5b6b74', fontSize: 13 }}>
            No active sessions found
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>About Sessions</h3>
        <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
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

const tableWrap: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,35,43,.06), 0 4px 14px rgba(22,35,43,.04)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: 'linear-gradient(135deg, #0f3340 0%, #1a4a5c 100%)' };
const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #e2e8f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '14px 18px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.6px' };
const td: React.CSSProperties = { padding: '14px 18px', color: '#1e2d35', fontSize: 13 };
