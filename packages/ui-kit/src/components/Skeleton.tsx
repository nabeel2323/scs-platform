/**
 * Skeleton — loading placeholder primitives.
 *
 * Renders pulsing rectangles that match the final layout shape,
 * replacing generic spinners with structure-aware placeholders.
 */
import React from 'react';
import { colors, radii } from '../tokens';

const pulseKeyframes = `@keyframes taif-skeleton-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

function SkeletonBase({ width = '100%', height = 16, borderRadius = radii.sm, style }: SkeletonProps) {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{
        width,
        height,
        borderRadius,
        background: colors.borderLight,
        animation: 'taif-skeleton-pulse 1.5s ease-in-out infinite',
        ...style,
      }} />
    </>
  );
}

/** Single line skeleton. */
export function SkeletonLine({ width, height = 14, style }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return <SkeletonBase width={width} height={height} borderRadius={radii.sm} style={style} />;
}

/** Circle skeleton (for avatars, logos). */
export function SkeletonCircle({ size = 40, style }: { size?: number; style?: React.CSSProperties }) {
  return <SkeletonBase width={size} height={size} borderRadius="50%" style={style} />;
}

/** Rectangle skeleton (for images, cards). */
export function SkeletonRect({ width = '100%', height = 120, style }: { width?: string | number; height?: string | number; style?: React.CSSProperties }) {
  return <SkeletonBase width={width} height={height} borderRadius={radii.md} style={style} />;
}

/** Pre-built card skeleton — mimics a typical content card. */
export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ padding: 20, ...style }}>
      <SkeletonRect height={140} style={{ marginBottom: 12 }} />
      <SkeletonLine width="70%" height={16} style={{ marginBottom: 8 }} />
      <SkeletonLine width="50%" height={12} style={{ marginBottom: 12 }} />
      <SkeletonLine width="30%" height={14} />
    </div>
  );
}

/** Table skeleton — mimics table rows. */
export function SkeletonTable({ rows = 5, cols = 4, style }: { rows?: number; cols?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: 16, ...style }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${colors.borderLight}` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={`h${i}`} width="100%" height={12} />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={`${r}-${c}`} width={c === 0 ? '40%' : '100%'} height={13} />
          ))}
        </div>
      ))}
    </div>
  );
}
