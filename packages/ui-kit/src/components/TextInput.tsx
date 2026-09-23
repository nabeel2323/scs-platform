/**
 * TextInput — form input with label, help text, and error state.
 */
import React from 'react';
import { colors, radii, transitions, typeScale } from '../tokens';

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string;
  helpText?: string;
  error?: string;
  inputSize?: 'sm' | 'md';
  /** Optional element rendered inside the input on the left (e.g. search icon). */
  prefix?: React.ReactNode;
}

export function TextInput({
  label,
  helpText,
  error,
  inputSize = 'md',
  prefix,
  style,
  id,
  ...rest
}: TextInputProps) {
  const inputId = id || rest.name;
  const padding = inputSize === 'sm' ? '6px 10px' : '9px 12px';
  const fontSize = inputSize === 'sm' ? typeScale.bodySm.fontSize : typeScale.body.fontSize;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && (
        <label htmlFor={inputId} style={{
          fontSize: typeScale.label.fontSize,
          fontWeight: typeScale.label.fontWeight,
          color: error ? colors.err : colors.ink,
          letterSpacing: typeScale.label.letterSpacing,
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <div style={{ position: 'absolute', left: 10, display: 'flex', color: colors.muted, pointerEvents: 'none' }}>
            {prefix}
          </div>
        )}
        <input
          id={inputId}
          style={{
            width: '100%',
            padding: prefix ? `${padding} ${padding} ${padding} 34px` : padding,
            fontSize,
            fontFamily: 'inherit',
            color: colors.ink,
            background: colors.surface,
            border: `1px solid ${error ? colors.err : colors.border}`,
            borderRadius: radii.sm,
            outline: 'none',
            transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
          }}
          {...rest}
        />
      </div>
      {error && (
        <span style={{ fontSize: typeScale.caption.fontSize, color: colors.err }} role="alert">
          {error}
        </span>
      )}
      {helpText && !error && (
        <span style={{ fontSize: typeScale.caption.fontSize, color: colors.muted }}>
          {helpText}
        </span>
      )}
    </div>
  );
}
