/**
 * StatusPill — consolidated status badge.
 *
 * Uses the unified statusColors map from tokens, replacing both the admin
 * orderStatusColors and the web Shared.tsx STATUS_COLORS.
 */
import React from 'react';
import { statusColors, radii } from '../tokens';

const DEFAULT_COLOR = { bg: '#eef1f3', fg: '#5b6b74' };

interface StatusPillProps {
  status: string;
  style?: React.CSSProperties;
}

export function StatusPill({ status, style }: StatusPillProps) {
  const c = statusColors[status] || DEFAULT_COLOR;
  const label = status.replace(/_/g, ' ');

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: radii.full,
      fontSize: 12,
      fontWeight: 600,
      background: c.bg,
      color: c.fg,
      textTransform: 'capitalize',
      lineHeight: 1.6,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {label}
    </span>
  );
}
