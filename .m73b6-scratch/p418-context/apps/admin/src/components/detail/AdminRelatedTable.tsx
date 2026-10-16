'use client';

/**
 * AdminRelatedTable — compact data table for related entities in detail pages.
 *
 * Supports column definitions, sorting, entity links, status badges,
 * empty states, and pagination. Reuses the existing table aesthetic
 * from management.module.css (§26).
 */
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { AdminStatusBadge } from './AdminStatusBadge';
import { AdminEmptyState } from './AdminEmptyState';
import styles from './detail.module.css';

export interface RelatedColumn {
  key: string;
  label: string;
  /** Render the cell value. Default: plain text. */
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  /** Whether this column is sortable. */
  sortable?: boolean;
  /** Maximum width for the column. */
  maxWidth?: number;
  /** Align cell content. */
  align?: 'left' | 'right' | 'center';
}

interface AdminRelatedTableProps {
  columns: RelatedColumn[];
  data: Record<string, unknown>[];
  /** Message shown when data is empty. */
  emptyMessage?: string;
  /** Optional title shown above the table. */
  title?: string;
  /** Default sort column key. */
  defaultSort?: string;
  /** Default sort direction. */
  defaultDirection?: 'asc' | 'desc';
  /** Optional pagination: items per page (0 = no pagination). */
  pageSize?: number;
}

export function AdminRelatedTable({
  columns,
  data,
  emptyMessage = 'No data available.',
  title,
  defaultSort,
  defaultDirection = 'asc',
  pageSize = 0,
}: AdminRelatedTableProps) {
  const [sortKey, setSortKey] = useState(defaultSort || '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDirection);
  const [page, setPage] = useState(0);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const paginated = pageSize > 0
    ? sorted.slice(page * pageSize, (page + 1) * pageSize)
    : sorted;

  const totalPages = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;

  if (data.length === 0) {
    return <AdminEmptyState title={emptyMessage} />;
  }

  return (
    <div>
      {title && (
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>
          {title} <span style={{ fontWeight: 400, color: '#5b6b74' }}>({data.length})</span>
        </div>
      )}
      <div className={styles['relTableWrap']}>
        <table className={styles['relTable']}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ textAlign: col.align || 'left', maxWidth: col.maxWidth }}>
                  {col.sortable ? (
                    <button type="button" onClick={() => handleSort(col.key)}>
                      {col.label}
                      {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, ri) => (
              <tr key={(row['id'] as string) || ri}>
                {columns.map(col => (
                  <td key={col.key} style={{ maxWidth: col.maxWidth, textAlign: col.align || 'left' }}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : row[col.key] != null ? String(row[col.key]) : <span style={{ color: '#5b6b74' }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, color: '#5b6b74' }}>
          <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d9e2e6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Cell renderer: status badge. */
export function statusCell(status: unknown) {
  if (!status) return <span style={{ color: '#5b6b74' }}>—</span>;
  return <AdminStatusBadge status={String(status)} />;
}

/** Cell renderer: entity link. */
export function linkCell(type: string, id: unknown, name: unknown) {
  if (!id) return <span style={{ color: '#5b6b74' }}>—</span>;
  return (
    <Link href={`/${type}s/${id}`} className={styles['entityLink']}>
      {String(name || id)}
    </Link>
  );
}
