/**
 * Card — surface container with border, optional shadow and header.
 */
import React from 'react';
import { colors, radii, shadows } from '../tokens';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: boolean;
  onClick?: () => void;
}

const paddingMap: Record<string, string> = {
  none: '0',
  sm: '12px 16px',
  md: '16px 20px',
  lg: '20px 24px',
};

export function Card({ children, style, className, padding = 'md', shadow = false, onClick }: CardProps) {
  const base: React.CSSProperties = {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: paddingMap[padding],
    boxShadow: shadow ? shadows.sm : 'none',
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
    cursor: onClick ? 'pointer' : undefined,
  };

  return (
    <div style={{ ...base, ...style }} className={className} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      {children}
    </div>
  );
}

/** Card with a distinct header section separated by a bottom border. */
export function CardWithHeader({
  header,
  children,
  footer,
  style,
  headerStyle,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md, overflow: 'hidden', ...style }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.borderLight}`, fontWeight: 600, fontSize: 14, color: colors.brand[700], display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...headerStyle }}>
        {header}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
      {footer && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${colors.borderLight}`, background: colors.bgSubtle }}>
          {footer}
        </div>
      )}
    </div>
  );
}
