'use client';

/**
 * AdminEntityLink — clickable link to related entity detail pages.
 *
 * Shows entity name with navigation affordance. Handles missing/deleted
 * entities gracefully by rendering muted text instead of a broken link (§10).
 */
import React from 'react';
import Link from 'next/link';
import { IconExternalLink } from '@scs/ui-kit';
import styles from './detail.module.css';

/** Supported entity types with their detail route patterns. */
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  product:    (id) => `/products/${id}`,
  variant:    (id) => `/variants/${id}`,
  offer:      (id) => `/offers/${id}`,
  category:   (id) => `/categories/${id}`,
  brand:      (id) => `/brands/${id}`,
  'product-type': (id) => `/product-types/${id}`,
  productType:(id) => `/product-types/${id}`,
  merchant:   (id) => `/merchants/${id}`,
  store:      (id) => `/merchants/${id}`,
  order:      (id) => `/orders/${id}`,
  user:       (id) => `/users/${id}`,
  organization:(id) => `/organizations/${id}`,
  attribute:  (id) => `/attributes/${id}`,
  verification:(id) => `/verification/${id}`,
};

interface AdminEntityLinkProps {
  /** Entity type (determines the route pattern). */
  type: keyof typeof ENTITY_ROUTES | string;
  /** Entity ID. */
  id: string;
  /** Display name for the entity. */
  name: string;
  /** Optional status to show alongside. */
  status?: string;
  /** Whether to show the external-link icon. */
  showIcon?: boolean;
  /** Custom style override. */
  style?: React.CSSProperties;
}

export function AdminEntityLink({
  type,
  id,
  name,
  showIcon = false,
  style,
}: AdminEntityLinkProps) {
  const routeBuilder = ENTITY_ROUTES[type];

  if (!routeBuilder || !id) {
    // No route or no ID — render as muted text
    return (
      <span className={styles['entityLinkMuted']} style={style}>
        {name || 'Unknown'}
      </span>
    );
  }

  return (
    <Link href={routeBuilder(id)} className={styles['entityLink']} style={style}>
      {name || id}
      {showIcon && <IconExternalLink size={13} />}
    </Link>
  );
}

/**
 * Build a detail-page href for a given entity type + ID.
 * Returns null if the entity type is unknown.
 */
export function getEntityHref(type: string, id: string): string | null {
  const builder = ENTITY_ROUTES[type];
  return builder ? builder(id) : null;
}
