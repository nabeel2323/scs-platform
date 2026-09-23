/**
 * KpiCard — key performance indicator card with accent border and icon.
 *
 * Used on admin dashboard and KPI dashboard pages.
 */
import React from 'react';
import { colors, radii, shadows, transitions, typeScale } from '../tokens';

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  tint: string;
}

export function KpiCard({ icon, label, value, accent, tint }: KpiCardProps) {
  return (
    <>
      <style>{`.taif-kpi:hover{box-shadow:${shadows.lg}}`}</style>
      <div className="taif-kpi" style={{
        background: colors.surface,
        borderRadius: radii.md,
        padding: '20px 22px',
        borderLeft: `4px solid ${accent}`,
        boxShadow: shadows.md,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        transition: `box-shadow ${transitions.normal}`,
        cursor: 'default',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 8,
          background: tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            ...typeScale.caption,
            color: colors.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 4,
          }}>{label}</div>
          <div style={{
            fontSize: 24, fontWeight: 700, color: accent,
            lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{value}</div>
        </div>
      </div>
    </>
  );
}
