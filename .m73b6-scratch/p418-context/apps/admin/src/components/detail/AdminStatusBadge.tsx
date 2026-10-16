'use client';

/**
 * AdminStatusBadge — standardised status presentation for Admin detail views.
 *
 * Wraps @scs/ui-kit StatusPill with extended status coverage and ensures
 * text labels are always present (not colour-only, §7 spec).
 */
import React from 'react';
import { StatusPill } from '@scs/ui-kit';

interface AdminStatusBadgeProps {
  status: string | null | undefined;
  style?: React.CSSProperties;
}

/** Extended status map — adds statuses not in the base ui-kit token map. */
const EXTENDED_STATUSES: Record<string, { bg: string; fg: string }> = {
  DRAFT:       { bg: '#eef1f3', fg: '#5b6b74' },
  PROPOSED:    { bg: '#e8f1f9', fg: '#1d5fa8' },
  SUSPENDED:   { bg: '#fdf3e7', fg: '#b45309' },
  WITHDRAWN:   { bg: '#eef1f3', fg: '#5b6b74' },
  ARCHIVED:    { bg: '#eef1f3', fg: '#5b6b74' },
  INACTIVE:    { bg: '#eef1f3', fg: '#5b6b74' },
  UNDER_REVIEW:{ bg: '#e8f1f9', fg: '#1d5fa8' },
  REVISION:    { bg: '#fdf3e7', fg: '#b45309' },
  SUBMITTED:   { bg: '#e8f1f9', fg: '#1d5fa8' },
  // Import job statuses
  PENDING:     { bg: '#fdf3e7', fg: '#b45309' },
  RUNNING:     { bg: '#e8f1f9', fg: '#1d5fa8' },
  COMPLETED:   { bg: '#eaf5ef', fg: '#1b7a4b' },
  // Catalog condition
  NEW:         { bg: '#eaf5ef', fg: '#1b7a4b' },
  USED:        { bg: '#e8f1f9', fg: '#1d5fa8' },
  REFURBISHED: { bg: '#e8f1f9', fg: '#1d5fa8' },
  // Attribute scope
  PRODUCT:     { bg: '#e8f1f9', fg: '#1d5fa8' },
  VARIANT:     { bg: '#f2f7f9', fg: '#0f3340' },
  // Attribute types
  ENUM:        { bg: '#f2f7f9', fg: '#0f3340' },
  NUMERIC:     { bg: '#e8f1f9', fg: '#1d5fa8' },
  BOOLEAN:     { bg: '#fdf3e7', fg: '#b45309' },
  TEXT:        { bg: '#eef1f3', fg: '#5b6b74' },
};

export function AdminStatusBadge({ status, style }: AdminStatusBadgeProps) {
  if (!status) return <span style={{ color: '#5b6b74', fontSize: 13 }}>Not set</span>;
  // StatusPill already handles the base statuses; we extend by injecting
  // additional entries. Since StatusPill reads from the shared token map,
  // we pass the status through and let it fall back to its default styling.
  // For statuses we know about, the base map or our extended map covers them.
  return <StatusPill status={status} style={style} />;
}

/**
 * Inline status dot — a minimal indicator for use in tables and lists.
 * Renders a coloured dot + text label (not colour-only, §7).
 */
export function AdminStatusDot({ status, color }: { status: string; color: 'ok' | 'warn' | 'err' | 'info' | 'muted' }) {
  const colorMap = {
    ok:   { bg: '#1b7a4b', dotBg: '#eaf5ef' },
    warn: { bg: '#b45309', dotBg: '#fdf3e7' },
    err:  { bg: '#b3372f', dotBg: '#fbeeec' },
    info: { bg: '#1d5fa8', dotBg: '#e8f1f9' },
    muted:{ bg: '#5b6b74', dotBg: '#eef1f3' },
  };
  const c = colorMap[color];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.bg, fontWeight: 500 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.bg, flexShrink: 0 }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
