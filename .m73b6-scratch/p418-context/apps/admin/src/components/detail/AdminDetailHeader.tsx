'use client';

/**
 * AdminDetailHeader — standardised detail-page header.
 *
 * Provides breadcrumbs, back-link, entity title, subtitle metadata,
 * status badge, and action buttons. Responsive: stacks on mobile.
 */
import React from 'react';
import Link from 'next/link';
import { BreadcrumbDark, type BreadcrumbItem } from '@scs/ui-kit';
import { AdminStatusBadge } from './AdminStatusBadge';
import { AdminCopyButton } from './AdminCopyButton';
import styles from './detail.module.css';

interface AdminDetailHeaderProps {
  /** Breadcrumb items (excluding current page — it's auto-appended as last). */
  breadcrumbs: BreadcrumbItem[];
  /** Label for the back link (e.g. "Back to Products"). */
  backLabel: string;
  /** URL for the back link. */
  backHref: string;
  /** Primary entity name displayed as the title. */
  title: string;
  /** Optional subtitle parts rendered as secondary metadata. */
  subtitle?: React.ReactNode;
  /** Entity status string (rendered as a badge). */
  status?: string;
  /** Action buttons slot (right side of header). */
  actions?: React.ReactNode;
  /** Optional ID to show with a copy button in the subtitle. */
  entityId?: string;
}

export function AdminDetailHeader({
  breadcrumbs,
  backLabel,
  backHref,
  title,
  subtitle,
  status,
  actions,
  entityId,
}: AdminDetailHeaderProps) {
  return (
    <div>
      <div className={styles['breadcrumbRow']}>
        <BreadcrumbDark
          items={[...breadcrumbs, { label: title }]}
          renderLink={(href, label) => (
            <Link href={href} style={{ fontSize: 12, color: '#1e6178', textDecoration: 'none', fontWeight: 400 }}>
              {label}
            </Link>
          )}
        />
      </div>
      <div className={styles['detailHeader']}>
        <Link href={backHref} className={styles['backLink']}>
          ← {backLabel}
        </Link>
        <div className={styles['detailHeaderTop']}>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles['detailTitle']}>
              {title}
              {status && <AdminStatusBadge status={status} style={{ marginLeft: 12, verticalAlign: 'middle' }} />}
            </h1>
            {(subtitle || entityId) && (
              <div className={styles['detailSubtitle']}>
                {subtitle}
                {entityId && (
                  <>
                    {subtitle && <span className={styles['detailSubtitleSep']}>·</span>}
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#5b6b74' }}>
                      {entityId.length > 16 ? entityId.slice(0, 16) + '…' : entityId}
                    </span>
                    <AdminCopyButton value={entityId} label="" />
                  </>
                )}
              </div>
            )}
          </div>
          {actions && (
            <div className={styles['detailActions']}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
