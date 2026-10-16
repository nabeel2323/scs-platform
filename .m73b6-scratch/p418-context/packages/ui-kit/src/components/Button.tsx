/**
 * Button — primary action component.
 *
 * Variants: primary, secondary, danger, ghost.
 * Sizes: sm, md, lg.
 * Supports loading state with spinner.
 */
import React from 'react';
import { colors, radii, transitions, typeScale } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '5px 10px', fontSize: '12px', borderRadius: radii.sm },
  md: { padding: '8px 14px', fontSize: '13px', borderRadius: radii.sm },
  lg: { padding: '10px 20px', fontSize: '14px', borderRadius: radii.md },
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: colors.brand[700],
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: colors.surface,
    color: colors.brand[700],
    border: `1px solid ${colors.border}`,
  },
  danger: {
    background: colors.err,
    color: '#fff',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: colors.muted,
    border: 'none',
  },
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: '#fff',
  borderRadius: '50%',
  animation: 'taif-spin 0.6s linear infinite',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontWeight: typeScale.button.fontWeight,
    lineHeight: typeScale.button.lineHeight,
    letterSpacing: typeScale.button.letterSpacing,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `background ${transitions.fast}, box-shadow ${transitions.fast}, border-color ${transitions.fast}`,
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    ...variantStyles[variant],
    ...sizeStyles[size],
  };

  return (
    <>
      <style>{`@keyframes taif-spin{to{transform:rotate(360deg)}}`}</style>
      <button
        {...rest}
        disabled={disabled || loading}
        style={{ ...base, ...style }}
      >
        {loading ? <span style={spinnerStyle} /> : icon}
        {children}
      </button>
    </>
  );
}
