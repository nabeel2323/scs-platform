'use client';

/**
 * AdminErrorState — consistent error display for detail pages.
 *
 * Shows icon + message + retry button. Does not expose stack traces (§24).
 */
import React from 'react';
import { IconAlertTriangle, Button } from '@scs/ui-kit';
import styles from './detail.module.css';

interface AdminErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function AdminErrorState({
  title = 'Unable to load',
  message,
  onRetry,
}: AdminErrorStateProps) {
  return (
    <div className={styles['errorState']} role="alert">
      <div className={styles['errorStateIcon']}>
        <IconAlertTriangle size={24} />
      </div>
      <h3 className={styles['errorStateTitle']}>{title}</h3>
      {message && (
        <p className={styles['errorStateMsg']}>{message}</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
