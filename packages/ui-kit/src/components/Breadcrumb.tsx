/**
 * Breadcrumb — navigation hierarchy shown on deep pages.
 */
import React from 'react';
import { colors, transitions } from '../tokens';
import { IconChevronRight } from '../icons';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  renderLink?: (href: string, label: string) => React.ReactNode;
}

export function Breadcrumb({ items, renderLink }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <IconChevronRight size={14} color="rgba(255,255,255,0.4)" />}
              {isLast || !item.href ? (
                <span style={{
                  fontSize: 12,
                  color: isLast ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
                  fontWeight: isLast ? 600 : 400,
                }}>
                  {item.label}
                </span>
              ) : (
                renderLink ? (
                  renderLink(item.href, item.label)
                ) : (
                  <a href={item.href} style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.6)',
                    textDecoration: 'none',
                    transition: `color ${transitions.fast}`,
                  }}>
                    {item.label}
                  </a>
                )
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Breadcrumb variant for use on white/light backgrounds. */
export function BreadcrumbDark({ items, renderLink }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <IconChevronRight size={14} color={colors.muted} />}
              {isLast || !item.href ? (
                <span style={{
                  fontSize: 12,
                  color: isLast ? colors.brand[700] : colors.muted,
                  fontWeight: isLast ? 600 : 400,
                }}>
                  {item.label}
                </span>
              ) : (
                renderLink ? (
                  renderLink(item.href, item.label)
                ) : (
                  <a href={item.href} style={{
                    fontSize: 12,
                    color: colors.info,
                    textDecoration: 'none',
                    transition: `color ${transitions.fast}`,
                  }}>
                    {item.label}
                  </a>
                )
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
