'use client';

import React from 'react';
import { colors, radii, transitions, typeScale } from '@scs/ui-kit';

interface TablePaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export default function TablePagination({
  page,
  total,
  limit,
  onPageChange,
  onLimitChange,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : page * limit + 1;
  const end = Math.min((page + 1) * limit, total);

  const getVisiblePages = (): (number | 'dots')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: (number | 'dots')[] = [];
    if (page <= 3) {
      for (let i = 0; i < 5; i++) pages.push(i);
      pages.push('dots', totalPages - 1);
    } else if (page >= totalPages - 4) {
      pages.push(0, 'dots');
      for (let i = totalPages - 5; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0, 'dots', page - 1, page, page + 1, 'dots', totalPages - 1);
    }
    return pages;
  };

  const pgBtn = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    fontSize: typeScale.bodySm.fontSize,
    fontWeight: active ? 700 : 400,
    background: active ? colors.brand[700] : disabled ? colors.bgSubtle : colors.surface,
    color: active ? '#fff' : disabled ? colors.disabled : colors.ink,
    border: `1px solid ${active ? colors.brand[700] : colors.border}`,
    borderRadius: radii.sm,
    cursor: disabled ? 'default' : 'pointer',
    minWidth: 32,
    textAlign: 'center' as const,
    transition: `all ${transitions.fast}`,
    fontFamily: 'inherit',
  });

  const navBtn = (disabled: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: typeScale.bodySm.fontSize,
    fontWeight: 500,
    background: disabled ? colors.bgSubtle : colors.surface,
    color: disabled ? colors.disabled : colors.ink,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: disabled ? 'default' : 'pointer',
    transition: `all ${transitions.fast}`,
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
      flexWrap: 'wrap',
      gap: 12,
    }}>
      {/* Left: showing range */}
      <div style={{ fontSize: typeScale.bodySm.fontSize, color: colors.muted }}>
        Showing <strong style={{ color: colors.ink }}>{start}</strong>–<strong style={{ color: colors.ink }}>{end}</strong> of <strong style={{ color: colors.ink }}>{total}</strong>
      </div>

      {/* Center: page buttons */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button disabled={page === 0} onClick={() => onPageChange(page - 1)} style={navBtn(page === 0)}>
          ‹ Prev
        </button>
        {getVisiblePages().map((p, i) =>
          p === 'dots' ? (
            <span key={`d${i}`} style={{ padding: '0 4px', color: colors.disabled, fontSize: typeScale.bodySm.fontSize }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              disabled={p === page}
              style={pgBtn(p === page, p === page)}
            >
              {p + 1}
            </button>
          ),
        )}
        <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} style={navBtn(page >= totalPages - 1)}>
          Next ›
        </button>
      </div>

      {/* Right: page size selector */}
      {onLimitChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: typeScale.bodySm.fontSize, color: colors.muted }}>
          <span>Rows:</span>
          <select
            value={limit}
            onChange={e => onLimitChange(Number(e.target.value))}
            style={{
              padding: '4px 8px',
              border: `1px solid ${colors.border}`,
              borderRadius: radii.sm,
              fontSize: typeScale.bodySm.fontSize,
              background: colors.surface,
              cursor: 'pointer',
              color: colors.ink,
              fontFamily: 'inherit',
            }}
          >
            {[10, 25, 50, 100].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
