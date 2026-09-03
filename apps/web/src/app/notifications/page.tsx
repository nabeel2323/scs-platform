'use client';

import { useState, useEffect } from 'react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, Notification } from '../../lib/buyer-api';
import { formatDate, EmptyState, LoadingSpinner } from '../../components/Shared';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    await load();
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    await load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f3340' }}>Notifications</h1>
        <button onClick={handleMarkAllRead} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Mark All Read
        </button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="No notifications" description="You're all caught up!" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.readAt && handleMarkRead(n.id)}
              style={{
                background: n.readAt ? '#fff' : '#f0f7ff',
                border: `1px solid ${n.readAt ? '#d9e2e6' : '#93c5fd'}`,
                borderRadius: 8,
                padding: '12px 16px',
                cursor: n.readAt ? 'default' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340' }}>{n.title || n.template}</span>
                <span style={{ fontSize: 11, color: '#a0aec0' }}>{formatDate(n.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#5b6b74' }}>{n.body}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#edf2f7', color: '#4a5568' }}>{n.channel}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#edf2f7', color: '#4a5568' }}>{n.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
