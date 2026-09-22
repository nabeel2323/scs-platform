'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  type Notification,
} from '../../lib/buyer-api';
import { onNotification } from '../../lib/realtime';
import { formatDate, EmptyState, LoadingSpinner } from '../../components/Shared';

type Filter = 'ALL' | 'UNREAD' | 'READ';

/**
 * Notify the navbar badge that the unread count may have changed so it can
 * refetch without requiring a realtime push or a socket reconnect.
 */
function notifyBadgeChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('unreadCountChanged'));
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  // Track IDs that are mid-transition so the button shows a spinner and
  // repeated clicks are suppressed.
  const [working, setWorking] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch { /* silently swallow — the empty state covers it */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Live in-app notifications over the realtime gateway (WEB-B6) — new items
  // appear without a manual refresh.
  useEffect(() => onNotification(() => { void load(); }), [load]);

  const unreadCount = notifications.filter(n => !n.readAt).length;

  // ── Individual toggle ────────────────────────────────────────
  async function toggleRead(n: Notification) {
    const id = n.id;
    const wasRead = !!n.readAt;
    setWorking(prev => { const s = new Set(prev); s.add(id); return s; });

    // Optimistic update
    setNotifications(prev => prev.map(x =>
      x.id === id
        ? { ...x, readAt: wasRead ? null : new Date().toISOString(), status: wasRead ? 'SENT' : 'READ' }
        : x,
    ));

    try {
      if (wasRead) {
        await markNotificationUnread(id);
      } else {
        await markNotificationRead(id);
      }
      notifyBadgeChanged();
    } catch {
      // Revert on failure
      setNotifications(prev => prev.map(x =>
        x.id === id ? { ...x, readAt: wasRead ? x.readAt : null, status: wasRead ? 'READ' : 'SENT' } : x,
      ));
    } finally {
      setWorking(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Mark all read ────────────────────────────────────────────
  async function handleMarkAllRead() {
    setWorking(prev => { const s = new Set(prev); s.add('__all__'); return s; });
    const prev = notifications;

    // Optimistic: mark every unread item as read
    setNotifications(p => p.map(x => x.readAt ? x : { ...x, readAt: new Date().toISOString(), status: 'READ' }));

    try {
      await markAllNotificationsRead();
      notifyBadgeChanged();
    } catch {
      setNotifications(prev);
    } finally {
      setWorking(prev => { const s = new Set(prev); s.delete('__all__'); return s; });
    }
  }

  const isAllWorking = working.has('__all__');

  // ── Filtered list ────────────────────────────────────────────
  const visible = filter === 'UNREAD'
    ? notifications.filter(n => !n.readAt)
    : filter === 'READ'
      ? notifications.filter(n => !!n.readAt)
      : notifications;

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '28px 24px 24px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Notifications</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : "You're all caught up!"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => void handleMarkAllRead()}
              disabled={isAllWorking}
              style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 600,
                background: isAllWorking ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 6, cursor: isAllWorking ? 'wait' : 'pointer',
                opacity: isAllWorking ? 0.7 : 1,
              }}
            >
              {isAllWorking ? 'Marking…' : `Mark All Read (${unreadCount})`}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 24px 48px' }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f0f4f7', borderRadius: 8, padding: 4, width: 'fit-content' }}>
          {([['ALL', 'All'], ['UNREAD', 'Unread'], ['READ', 'Read']] as const).map(([key, label]) => {
            const count = key === 'ALL' ? notifications.length : key === 'UNREAD' ? unreadCount : notifications.length - unreadCount;
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#0f3340' : '#5b6b74',
                  border: active ? '1px solid #d9e2e6' : '1px solid transparent',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={filter === 'UNREAD' ? 'No unread notifications' : filter === 'READ' ? 'No read notifications' : 'No notifications'}
            description={filter === 'UNREAD' ? 'All caught up!' : 'Notifications will appear here as they arrive.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visible.map(n => {
              const isRead = !!n.readAt;
              const isBusy = working.has(n.id);
              return (
                <div
                  key={n.id}
                  style={{
                    background: isRead ? '#fff' : '#f0f7ff',
                    border: `1px solid ${isRead ? '#e2e8f0' : '#93c5fd'}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                    transition: 'background 0.2s ease, border-color 0.2s ease',
                    opacity: isBusy ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Unread dot indicator */}
                    <div style={{ paddingTop: 4, flexShrink: 0 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: isRead ? 'transparent' : '#3b82f6',
                        border: isRead ? '2px solid #d9e2e6' : '2px solid #3b82f6',
                        transition: 'all 0.2s ease',
                      }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: isRead ? 500 : 700,
                          color: isRead ? '#5b6b74' : '#0f3340',
                        }}>
                          {n.title || n.template}
                        </span>
                        <span style={{ fontSize: 11, color: '#a0aec0', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {formatDate(n.createdAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: isRead ? '#8a9ba5' : '#5b6b74', lineHeight: 1.5 }}>{n.body}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#edf2f7', color: '#4a5568', fontWeight: 500 }}>{n.channel}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#edf2f7', color: '#4a5568', fontWeight: 500 }}>{n.type}</span>
                        {isRead && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontWeight: 600 }}>✓ Read</span>
                        )}
                      </div>
                    </div>

                    {/* Action button */}
                    <button
                      onClick={() => void toggleRead(n)}
                      disabled={isBusy}
                      aria-label={isRead ? `Mark "${n.title || n.template}" as unread` : `Mark "${n.title || n.template}" as read`}
                      style={{
                        padding: '6px 14px', fontSize: 11, fontWeight: 600,
                        borderRadius: 6, cursor: isBusy ? 'wait' : 'pointer',
                        border: isRead ? '1px solid #d9e2e6' : '1px solid #93c5fd',
                        background: isRead ? '#fff' : '#dbeafe',
                        color: isRead ? '#5b6b74' : '#1e40af',
                        whiteSpace: 'nowrap', flexShrink: 0,
                        opacity: isBusy ? 0.6 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isBusy ? '…' : isRead ? 'Mark Unread' : '✓ Mark Read'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
