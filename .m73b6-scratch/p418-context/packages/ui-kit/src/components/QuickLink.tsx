/**
 * QuickLink — navigation card with icon, title, and description.
 *
 * Renders a non-clickable card surface. Wrap with your router's Link component
 * (e.g. Next.js `<Link>`) to add navigation.
 */
import React from 'react';
import { colors, radii, shadows, transitions, typeScale } from '../tokens';

interface QuickLinkProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

export function QuickLink({ icon, title, desc }: QuickLinkProps) {
  return (
    <>
      <style>{`
        .taif-quick:hover{box-shadow:${shadows.lg};transform:translateY(-2px)}
        .taif-quick:hover .taif-quick-arrow{stroke:${colors.brand[700]}}
      `}</style>
      <div className="taif-quick" style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px',
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        boxShadow: shadows.sm,
        transition: `box-shadow ${transitions.normal}, transform ${transitions.normal}`,
        cursor: 'pointer',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: radii.md,
          background: colors.bgSubtle,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: colors.brand[700], flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...typeScale.body, fontWeight: 600, color: colors.brand[700], marginBottom: 2 }}>{title}</div>
          <div style={{ ...typeScale.bodySm, color: colors.muted, lineHeight: 1.4 }}>{desc}</div>
        </div>
        <svg className="taif-quick-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={colors.disabled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: `stroke ${transitions.normal}` }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </>
  );
}
