import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAdminOfferTrend } = vi.hoisted(() => ({ fetchAdminOfferTrend: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({ fetchAdminOfferTrend: (...args: unknown[]) => fetchAdminOfferTrend(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: React.ReactNode }) => <header><h1>{title}</h1><p>{subtitle}</p>{trailing}</header>,
  colors: {
    border: '#ddd', muted: '#888', err: '#b00', errBg: '#fee', brand: { 700: '#333' },
    bgSubtle: '#fafafa', borderLight: '#eee',
  },
  typeScale: { bodySm: { fontSize: 12 }, h2: { fontSize: 18 } },
  radii: { sm: 4, md: 8 },
}));

import OffersTrendPage from '../app/offers-trend/page';

const emptyResponse = {
  granularity: 'day' as const,
  from: '2026-01-01',
  to: '2026-03-31',
  filters: { storeId: null, offerId: null, status: null, topStores: 10 },
  buckets: [],
  topStores: [],
};

describe('admin offer trend read recovery', () => {
  beforeEach(() => {
    fetchAdminOfferTrend.mockReset();
    fetchAdminOfferTrend.mockResolvedValue(emptyResponse);
  });
  afterEach(() => cleanup());

  it('suppresses empty leaderboard after a failed trend read and retries', async () => {
    fetchAdminOfferTrend
      .mockRejectedValueOnce(new Error('Offer trend service unavailable'))
      .mockResolvedValueOnce(emptyResponse);

    render(<OffersTrendPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Offer trend service unavailable');
    expect(screen.queryByText('No offer-backed sales in this window.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry offer trend' }));
    expect(await screen.findByText('No offer-backed sales in this window.')).toBeTruthy();
  });
});
