/**
 * Select — form dropdown with label and error state.
 */
import React from 'react';
import { colors, radii, transitions, typeScale } from '../tokens';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  selectSize?: 'sm' | 'md';
}

export function Select({
  label,
  options,
  placeholder,
  error,
  selectSize = 'md',
  style,
  id,
  ...rest
}: SelectProps) {
  const selectId = id || rest.name;
  const padding = selectSize === 'sm' ? '5px 8px' : '8px 10px';
  const fontSize = selectSize === 'sm' ? typeScale.bodySm.fontSize : typeScale.body.fontSize;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && (
        <label htmlFor={selectId} style={{
          fontSize: typeScale.label.fontSize,
          fontWeight: typeScale.label.fontWeight,
          color: error ? colors.err : colors.ink,
          letterSpacing: typeScale.label.letterSpacing,
        }}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        style={{
          width: '100%',
          padding,
          fontSize,
          fontFamily: 'inherit',
          color: colors.ink,
          background: colors.surface,
          border: `1px solid ${error ? colors.err : colors.border}`,
          borderRadius: radii.sm,
          outline: 'none',
          cursor: 'pointer',
          transition: `border-color ${transitions.fast}`,
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ fontSize: typeScale.caption.fontSize, color: colors.err }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
