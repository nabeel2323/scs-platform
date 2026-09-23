/**
 * PageHeader — gradient banner used at the top of every page.
 *
 * Provides a consistent title bar with optional subtitle, breadcrumbs slot,
 * and action buttons slot.
 */
import React from 'react';
import { brand, typeScale } from '../tokens';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional content rendered to the right of the title (e.g. date, filters). */
  trailing?: React.ReactNode;
  /** Override the default gradient if needed. */
  background?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  trailing,
  background = `linear-gradient(135deg, ${brand[900]} 0%, ${brand[500]} 100%)`,
}: PageHeaderProps) {
  return (
    <div style={{ background, padding: '28px 32px 24px', color: '#fff' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        {breadcrumbs && <div style={{ marginBottom: 10 }}>{breadcrumbs}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{
              fontSize: typeScale.h1.fontSize,
              fontWeight: typeScale.h1.fontWeight,
              lineHeight: typeScale.h1.lineHeight,
              letterSpacing: typeScale.h1.letterSpacing,
              margin: 0,
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {trailing && <div style={{ textAlign: 'right' }}>{trailing}</div>}
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
