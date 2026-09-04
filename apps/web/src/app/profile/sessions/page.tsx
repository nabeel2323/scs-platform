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
      // Try to extract browser/device name from user agent
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
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">Loading sessions...</div>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Active Sessions</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Device
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Active
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sessions.map((session) => (
              <tr key={session.id} className={session.isRevoked ? 'bg-gray-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {getDeviceName(session)}
                    {session.isCurrent && (
                      <span className="ml-2 px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  {session.deviceId && (
                    <div className="text-xs text-gray-500">
                      ID: {session.deviceId.substring(0, 8)}...
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {session.ip || 'Unknown'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(session.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {session.isRevoked ? (
                    <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded">
                      Revoked
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {!session.isCurrent && !session.isRevoked && session.deviceId && (
                    <button
                      onClick={() => handleRevokeDevice(session.deviceId!)}
                      className="text-red-600 hover:text-red-900"
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
          <div className="text-center py-12 text-gray-500">
            No active sessions found
          </div>
        )}
      </div>
      
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">About Sessions</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Sessions track where you're logged in across devices</li>
          <li>• Revoking a session will log you out on that device</li>
          <li>• The "Current" session is the one you're using now</li>
          <li>• Sessions automatically expire after 30 days of inactivity</li>
        </ul>
      </div>
    </div>
  );
}
