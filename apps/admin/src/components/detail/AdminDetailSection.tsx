'use client';

/**
 * AdminDetailSection — card-based section container for detail pages.
 *
 * Wraps content in a bordered card with an optional title, description,
 * and action slot. Supports collapsible sections.
 */
import React, { useState } from 'react';
import { IconChevronDown, IconChevronUp } from '@scs/ui-kit';
import styles from './detail.module.css';

interface AdminDetailSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Optional action slot (top-right of header). */
  action?: React.ReactNode;
  /** Whether the section starts collapsed. */
  defaultCollapsed?: boolean;
  /** Force the section to be collapsible. */
  collapsible?: boolean;
  /** Remove body padding (for tables, full-bleed content). */
  bare?: boolean;
  style?: React.CSSProperties;
}

export function AdminDetailSection({
  title,
  description,
  children,
  action,
  defaultCollapsed = false,
  collapsible = false,
  bare = false,
  style,
}: AdminDetailSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const canCollapse = collapsible || defaultCollapsed;

  return (
    <div className={styles['sectionCard']} style={style}>
      {(title || action) && (
        <div className={styles['sectionHeader']}>
          <div>
            {title && <h3 className={styles['sectionTitle']}>{title}</h3>}
            {description && <p className={styles['sectionDescription']}>{description}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {action}
            {canCollapse && (
              <button
                type="button"
                onClick={() => setCollapsed(c => !c)}
                aria-label={collapsed ? 'Expand section' : 'Collapse section'}
                aria-expanded={!collapsed}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: '#5b6b74',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
              </button>
            )}
          </div>
        </div>
      )}
      {!collapsed && (
        <div className={bare ? styles['sectionBodyBare'] : styles['sectionBody']}>
          {children}
        </div>
      )}
    </div>
  );
}
