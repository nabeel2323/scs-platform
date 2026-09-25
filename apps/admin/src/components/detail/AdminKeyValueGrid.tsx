'use client';

/**
 * AdminKeyValueGrid — responsive grid of label/value pairs for detail pages.
 *
 * Replaces RecordFields with a structured 2-column grid (1-column on mobile).
 * Values can be React nodes (links, badges, copy buttons).
 * Follows §6 and §25 of the spec.
 */
import React from 'react';
import { fieldLabel, formatValue } from './formatUtils';
import styles from './detail.module.css';

export interface KVItem {
  key: string;
  label?: string;
  value: React.ReactNode;
}

interface AdminKeyValueGridProps {
  items: KVItem[];
  /** Optional columns override (default 2 on desktop). */
  columns?: 1 | 2;
  style?: React.CSSProperties;
}

export function AdminKeyValueGrid({ items, columns, style }: AdminKeyValueGridProps) {
  const gridStyle: React.CSSProperties = {
    ...style,
    ...(columns === 1 ? { gridTemplateColumns: '1fr' } : {}),
  };

  return (
    <div className={styles['kvGrid']} style={gridStyle}>
      {items.map((item, i) => (
        <div key={item.key + i} className={styles['kvItem']}>
          <div className={styles['kvLabel']}>{item.label || fieldLabel(item.key)}</div>
          <div className={styles['kvValue']}>
            {item.value !== null && item.value !== undefined ? item.value : (
              <span style={{ color: '#5b6b74' }}>Not set</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Helper to build KVItem array from a raw record, omitting specified keys
 * and formatting values automatically.
 */
export function recordToKVItems(
  record: Record<string, unknown>,
  omit: string[] = [],
  overrides?: Record<string, React.ReactNode>,
): KVItem[] {
  const omitSet = new Set(omit);
  return Object.entries(record)
    .filter(([key]) => !omitSet.has(key))
    .map(([key, value]) => ({
      key,
      label: fieldLabel(key),
      value: overrides?.[key] ?? formatValue(value),
    }));
}
