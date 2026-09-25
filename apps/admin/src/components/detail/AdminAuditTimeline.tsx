'use client';

/**
 * AdminAuditTimeline — renders audit/status history as a vertical timeline.
 *
 * Shows timestamp, actor, action, and optional change details.
 * Falls back to an empty state when no entries exist (§20).
 */
import React from 'react';
import { IconActivity } from '@scs/ui-kit';
import { formatDate } from './formatUtils';
import { AdminEmptyState } from './AdminEmptyState';
import styles from './detail.module.css';

export interface TimelineEntry {
  id?: string;
  timestamp: string;
  action: string;
  actor?: string | null;
  actorType?: string;
  detail?: string | null;
  /** Optional metadata rendered as key-value lines. */
  metadata?: Record<string, unknown> | null;
}

interface AdminAuditTimelineProps {
  entries: TimelineEntry[];
  /** Title shown above the timeline. */
  title?: string;
}

export function AdminAuditTimeline({ entries, title }: AdminAuditTimelineProps) {
  if (entries.length === 0) {
    return <AdminEmptyState title="No audit history" description="No changes have been recorded for this entity." icon={<IconActivity size={24} />} />;
  }

  // Sort newest-first
  const sorted = [...entries].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div>
      {title && (
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 16 }}>
          {title}
        </div>
      )}
      <div className={styles['timeline']} role="list" aria-label="Audit timeline">
        {sorted.map((entry, i) => {
          const isLast = i === sorted.length - 1;
          const metaEntries = entry.metadata
            ? Object.entries(entry.metadata).filter(([, v]) => v != null && v !== '')
            : [];

          return (
            <div key={entry.id || i} className={styles['timelineItem']} role="listitem">
              <div className={`${styles['timelineDot']} ${isLast ? styles['timelineDotMuted'] : ''}`} />
              <div className={styles['timelineTime']}>{formatDate(entry.timestamp)}</div>
              <div className={styles['timelineAction']}>{entry.action}</div>
              {entry.actor && (
                <div className={styles['timelineActor']}>
                  {entry.actorType ? `${entry.actorType}: ` : ''}{entry.actor}
                </div>
              )}
              {entry.detail && (
                <div className={styles['timelineDetail']}>{entry.detail}</div>
              )}
              {metaEntries.length > 0 && (
                <div className={styles['timelineDetail']}>
                  {metaEntries.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#5b6b74', fontWeight: 600, minWidth: 80 }}>{k}:</span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
