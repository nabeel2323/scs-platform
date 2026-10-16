'use client';

/**
 * AdminLoadingSkeleton — pre-composed skeleton layouts for detail pages.
 *
 * Renders a skeleton that resembles the final detail-page layout to
 * reduce visual layout shift during loading (§22).
 */
import React from 'react';
import { SkeletonLine, SkeletonRect, SkeletonCircle } from '@scs/ui-kit';
import styles from './detail.module.css';

interface AdminLoadingSkeletonProps {
  /** Number of key-value rows to skeletonise. */
  kvRows?: number;
  /** Whether to show a table skeleton below the KV grid. */
  showTable?: boolean;
  /** Number of table rows. */
  tableRows?: number;
}

export function AdminLoadingSkeleton({
  kvRows = 6,
  showTable = false,
  tableRows = 4,
}: AdminLoadingSkeletonProps) {
  return (
    <div className={styles['detailShell']}>
      {/* Breadcrumb area */}
      <div className={styles['breadcrumbRow']}>
        <SkeletonLine width={200} height={12} />
      </div>

      {/* Header area */}
      <div className={styles['detailHeader']}>
        <SkeletonLine width={120} height={13} style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <SkeletonLine width="60%" height={28} style={{ marginBottom: 10 }} />
            <SkeletonLine width="40%" height={14} />
          </div>
          <SkeletonRect width={80} height={32} style={{ borderRadius: 6 }} />
        </div>
      </div>

      {/* Tabs area */}
      <div className={styles['tabsContainer']}>
        <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid #e5ecf0', paddingBottom: 8 }}>
          <SkeletonLine width={70} height={14} />
          <SkeletonLine width={70} height={14} />
          <SkeletonLine width={70} height={14} />
          <SkeletonLine width={70} height={14} />
        </div>
      </div>

      {/* Content area */}
      <div className={styles['detailContent']}>
        {/* KV grid skeleton */}
        <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: '16px 20px' }}>
          <SkeletonLine width={120} height={14} style={{ marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px' }}>
            {Array.from({ length: kvRows }).map((_, i) => (
              <div key={i}>
                <SkeletonLine width={80} height={11} style={{ marginBottom: 6 }} />
                <SkeletonLine width="70%" height={14} />
              </div>
            ))}
          </div>
        </div>

        {/* Table skeleton */}
        {showTable && (
          <div style={{ background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, padding: '16px 20px' }}>
            <SkeletonLine width={140} height={14} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #e5ecf0' }}>
              <SkeletonLine width="25%" height={12} />
              <SkeletonLine width="20%" height={12} />
              <SkeletonLine width="15%" height={12} />
              <SkeletonLine width="20%" height={12} />
            </div>
            {Array.from({ length: tableRows }).map((_, r) => (
              <div key={r} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <SkeletonLine width="25%" height={13} />
                <SkeletonLine width="20%" height={13} />
                <SkeletonLine width="15%" height={13} />
                <SkeletonLine width="20%" height={13} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact skeleton for use inside a single section card. */
export function AdminSectionSkeleton({ rows = 4, cols = 2 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, marginBottom: 14 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c}>
              <SkeletonLine width={70} height={11} style={{ marginBottom: 6 }} />
              <SkeletonLine width="80%" height={14} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
