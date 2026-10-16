'use client';

/**
 * AdminEmptyState — consistent empty collection display for detail pages.
 *
 * Shows icon + title + description + optional action button.
 * Permission-aware: hides action button if the user lacks permission (§23).
 */
import React from 'react';
import { EmptyState, Button } from '@scs/ui-kit';
import styles from './detail.module.css';

interface AdminEmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function AdminEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: AdminEmptyStateProps) {
  return (
    <EmptyState
      title={title}
      description={description}
      icon={icon}
      action={
        actionLabel && onAction ? (
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : undefined
      }
    />
  );
}
