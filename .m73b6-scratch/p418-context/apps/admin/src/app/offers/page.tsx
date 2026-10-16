'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ManagementPage from '../../components/ManagementPage';

/**
 * PHASE 9: Offer Governance page.
 *
 * Wraps the generic ManagementPage with status filter tabs so admins can
 * quickly switch between offer states without navigating the advanced filter
 * panel. The tabs manipulate the `status` URL query parameter, which the
 * `useAdminTableQuery` hook already reads as a filter predicate.
 */

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Proposed', value: 'PROPOSED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Suspended', value: 'SUSPENDED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Withdrawn', value: 'WITHDRAWN' },
] as const;

function OffersPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const currentStatus = params.get('status') || '';

  const switchTab = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set('status', value);
      else next.delete('status');
      // Reset to first page when switching tabs
      next.delete('page');
      router.push(`/offers?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  return (
    <div>
      {/* Status filter tabs */}
      <nav
        style={{
          display: 'flex',
          gap: 4,
          padding: '16px 24px 0',
          borderBottom: '1px solid #e0e6ed',
          flexWrap: 'wrap',
        }}
        aria-label="Offer status filter"
      >
        {STATUS_TABS.map(tab => {
          const isActive = currentStatus === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchTab(tab.value)}
              aria-pressed={isActive}
              style={{
                padding: '8px 18px',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#1a5c7a' : '#5a6977',
                background: isActive ? '#e8f2f7' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #1a5c7a' : '2px solid transparent',
                borderRadius: '6px 6px 0 0',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Delegate to the generic management table */}
      <ManagementPage entity="offers" />
    </div>
  );
}

export default function OffersPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading offers…</div>}>
      <OffersPageContent />
    </Suspense>
  );
}
