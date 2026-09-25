'use client';

/**
 * AdminDetailTabs — standardised tab navigation for detail pages.
 *
 * Thin wrapper around @scs/ui-kit Tabs with consistent container styling.
 */
import React from 'react';
import { Tabs } from '@scs/ui-kit';
import styles from './detail.module.css';

interface DetailTab {
  key: string;
  label: string;
  count?: number;
}

interface AdminDetailTabsProps {
  tabs: DetailTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function AdminDetailTabs({ tabs, activeKey, onChange }: AdminDetailTabsProps) {
  return (
    <div className={styles['tabsContainer']}>
      <Tabs tabs={tabs} activeKey={activeKey} onChange={onChange} />
    </div>
  );
}
