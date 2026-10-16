'use client';

/**
 * Analytics Events & Activity Page — admin view of platform event counts
 * and user activity feed.
 *
 * Route: /analytics
 * APIs: GET /v1/analytics/events?from=&to=  GET /v1/analytics/activity?limit=
 */
import { Suspense, useEffect, useState, useCallback } from 'react';
import { fetchAnalyticsEvents, fetchAnalyticsActivity, type AnalyticsEventCount, type AnalyticsActivityEntry } from '../../lib/api';
import { useRequirePerms } from '../../hooks/useRequirePerms';
import {
  AdminDetailSection,
  AdminLoadingSkeleton,
  formatDate,
} from '../../components/detail';

function AnalyticsContent() {
  const { hasAccess } = useRequirePerms(['analytics:read']);
  const [ready, setReady] = useState(false);
  const [activeView, setActiveView] = useState<'events' | 'activity'>('events');

  // Events state
  const [events, setEvents] = useState<AnalyticsEventCount[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Activity state
  const [activity, setActivity] = useState<AnalyticsActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityLimit, setActivityLimit] = useState(50);

  useEffect(() => setReady(true), []);

  const loadEvents = useCallback(() => {
    setEventsLoading(true);
    setEventsError('');
    fetchAnalyticsEvents(fromDate, toDate)
      .then((data: AnalyticsEventCount[]) => { setEvents(data); setEventsLoading(false); })
      .catch((err: unknown) => { setEventsError(err instanceof Error ? err.message : 'Failed to load events'); setEventsLoading(false); });
  }, [fromDate, toDate]);

  const loadActivity = useCallback(() => {
    setActivityLoading(true);
    setActivityError('');
    fetchAnalyticsActivity(activityLimit)
      .then((data: AnalyticsActivityEntry[]) => { setActivity(data); setActivityLoading(false); })
      .catch((err: unknown) => { setActivityError(err instanceof Error ? err.message : 'Failed to load activity'); setActivityLoading(false); });
  }, [activityLimit]);

  useEffect(() => {
    if (!ready || !hasAccess) return;
    if (activeView === 'events') loadEvents();
    else loadActivity();
  }, [ready, hasAccess, activeView, loadEvents, loadActivity]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: analytics:read</div>;

  const totalEvents = events.reduce((sum, e) => sum + e.count, 0);
  const maxCount = Math.max(...events.map(e => e.count), 1);

  return (
    <div style={{ padding: '24px 32px 48px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f3340', margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Platform event counts and user activity feed</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
        {(['events', 'activity'] as const).map(key => (
          <button
            key={key}
            onClick={() => setActiveView(key)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeView === key ? 600 : 400,
              color: activeView === key ? '#0f3340' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeView === key ? '#0f3340' : 'transparent'}`,
              marginBottom: -1,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {key === 'events' ? 'Event Counts' : 'Activity Feed'}
          </button>
        ))}
      </div>

      {activeView === 'events' && (
        <div>
          {/* Date range controls */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <button onClick={loadEvents}
              style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
              Refresh
            </button>
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
              {events.length} event types · {totalEvents.toLocaleString()} total events
            </span>
          </div>

          {eventsLoading && <div style={{ padding: 24, color: '#6b7280', fontSize: 13 }}>Loading event counts…</div>}
          {eventsError && <div style={{ padding: 16, color: '#991b1b', fontSize: 13, background: '#fef2f2', borderRadius: 6 }}>{eventsError}</div>}

          {!eventsLoading && !eventsError && events.length === 0 && (
            <div style={{ padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>No events found for this date range.</div>
          )}

          {events.length > 0 && (
            <AdminDetailSection title="Event Breakdown">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {events.sort((a, b) => b.count - a.count).map((ev, idx) => (
                  <div key={ev.eventType} style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: idx % 2 === 0 ? '#f9fafb' : '#fff',
                    borderBottom: '1px solid #e5e7eb',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f3340', minWidth: 200 }}>{ev.eventType}</span>
                    <div style={{ flex: 1, height: 20, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(ev.count / maxCount) * 100}%`,
                        background: 'linear-gradient(90deg, #0f3340, #1a6b7a)',
                        borderRadius: 4,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f3340', minWidth: 60, textAlign: 'right' }}>
                      {ev.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </AdminDetailSection>
          )}
        </div>
      )}

      {activeView === 'activity' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Limit:</label>
            <select value={activityLimit} onChange={e => setActivityLimit(Number(e.target.value))}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
              {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} entries</option>)}
            </select>
            <button onClick={loadActivity}
              style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: '#0f3340', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
              Refresh
            </button>
          </div>

          {activityLoading && <div style={{ padding: 24, color: '#6b7280', fontSize: 13 }}>Loading activity…</div>}
          {activityError && <div style={{ padding: 16, color: '#991b1b', fontSize: 13, background: '#fef2f2', borderRadius: 6 }}>{activityError}</div>}

          {!activityLoading && !activityError && activity.length === 0 && (
            <div style={{ padding: 24, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>No activity recorded.</div>
          )}

          {activity.length > 0 && (
            <AdminDetailSection title="Recent Activity">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {activity.map((entry, idx) => (
                  <div key={idx} style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: idx % 2 === 0 ? '#f9fafb' : '#fff',
                    borderBottom: '1px solid #e5e7eb',
                  }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: '#e0f2fe', color: '#0369a1',
                    }}>{entry.eventType}</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#6b7280', minWidth: 100 }}>
                      {entry.userId?.slice(0, 12)}{entry.userId?.length > 12 ? '…' : ''}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            </AdminDetailSection>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}><AnalyticsContent /></Suspense>;
}
