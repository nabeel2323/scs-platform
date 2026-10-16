'use client';

import { StatusHistoryEntry } from '../lib/buyer-api';
import { formatDate } from './Shared';

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Order Placed',
  ACCEPTED: 'Accepted by Merchant',
  PARTIALLY_ACCEPTED: 'Partially Accepted',
  REJECTED: 'Rejected',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Being Prepared',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function OrderTimeline({ history }: { history: StatusHistoryEntry[] }) {
  const mainStatuses = [
    'SUBMITTED', 'ACCEPTED', 'CONFIRMED', 'PREPARING', 'READY',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED',
  ];

  // Build timeline from history
  const timeline = history.map(h => ({
    status: h.toStatus,
    date: h.createdAt,
    actor: h.actorType,
    reason: h.reason,
  }));

  const isTerminalCancelled = timeline.some(t => t.status === 'CANCELLED' || t.status === 'REJECTED');

  if (isTerminalCancelled) {
    const terminal = timeline.find(t => t.status === 'CANCELLED' || t.status === 'REJECTED');
    return (
      <div style={containerStyle}>
        <div style={lineStyle}>
          {timeline.filter(t => t.status !== 'CANCELLED' && t.status !== 'REJECTED').map((entry, i) => (
            <TimelineStep key={i} entry={entry} active completed />
          ))}
          <TimelineStep
            entry={terminal!}
            active
            completed
            isTerminal
          />
        </div>
      </div>
    );
  }

  const currentStatusIdx = mainStatuses.indexOf(timeline[timeline.length - 1]?.status || '');

  return (
    <div style={containerStyle}>
      <div style={lineStyle}>
        {mainStatuses.map((status, i) => {
          const entry = timeline.find(t => t.status === status);
          const completed = i <= currentStatusIdx;
          const active = i === currentStatusIdx;
          return (
            <TimelineStep
              key={status}
              entry={entry || { status, date: '', actor: '', reason: null }}
              active={active}
              completed={completed}
              label={STATUS_LABELS[status] || status}
            />
          );
        })}
      </div>
    </div>
  );
}

function TimelineStep({ entry, active, completed, isTerminal, label }: {
  entry: { status: string; date: string; actor: string; reason: string | null };
  active?: boolean;
  completed?: boolean;
  isTerminal?: boolean;
  label?: string;
}) {
  const dotColor = isTerminal ? '#e53e3e' : completed ? '#0f3340' : '#d9e2e6';
  const textColor = completed ? '#0f3340' : '#a0aec0';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 20,
      }}>
        <div style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: dotColor,
          border: active ? '3px solid #0f3340' : '2px solid transparent',
          boxSizing: 'border-box',
        }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: completed ? 600 : 400, color: textColor }}>
          {label || STATUS_LABELS[entry.status] || entry.status}
        </div>
        {entry.date && (
          <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 2 }}>
            {formatDate(entry.date)}
            {entry.actor && entry.actor !== 'SYSTEM' && ` by ${entry.actor}`}
          </div>
        )}
        {entry.reason && (
          <div style={{ fontSize: 11, color: '#e53e3e', marginTop: 2 }}>
            {entry.reason}
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '16px 0',
};

const lineStyle: React.CSSProperties = {
  position: 'relative',
};
