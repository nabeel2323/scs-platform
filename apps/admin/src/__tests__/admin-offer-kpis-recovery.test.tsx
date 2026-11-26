import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchOfferRevenueKpis } = vi.hoisted(() => ({ fetchOfferRevenueKpis: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/api', () => ({
  fetchOfferRevenueKpis: (...args: unknown[]) => fetchOfferRevenueKpis(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, trailing }: { title: string; trailing?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {trailing}
    </header>
  ),
  KpiCard: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}:{value}
    </div>
  ),
  IconActivity: () => null,
  IconDollar: () => null,
  IconPackage: () => null,
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
  colors: {
    border: '#ddd',
    surface: '#fff',
    muted: '#888',
    err: '#b00',
    errBg: '#fee',
    brand: { 50: '#eee', 700: '#333' },
    okBg: '#efe',
    infoBg: '#eef',
    bgSubtle: '#fafafa',
    borderLight: '#eee',
  },
  typeScale: { bodySm: {}, h2: {} },
  radii: { sm: 4, md: 8 },
}));

import OffersKpiPage from '../app/offers-kpis/page';

const emptyResponse = {
  from: '2026-01-01',
  to: '2026-01-31',
  filters: { storeId: null, status: null, limit: 100 },
  totals: { offersTouched: 0, byCurrency: [] },
  offers: [],
};

describe('admin offer KPI read recovery', () => {
  beforeEach(() => {
    fetchOfferRevenueKpis.mockReset();
    fetchOfferRevenueKpis.mockResolvedValue(emptyResponse);
  });
  afterEach(() => cleanup());

  it('does not display fabricated zero metrics or an empty sales state after a failed read', async () => {
    fetchOfferRevenueKpis
      .mockRejectedValueOnce(new Error('Offer KPI service unavailable'))
      .mockResolvedValueOnce(emptyResponse);

    render(<OffersKpiPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Offer KPI service unavailable',
    );
    expect(screen.getByText('Offers Touched:—')).toBeTruthy();
    expect(screen.queryByText('No offer-backed sales in this window.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry offer KPIs' }));
    expect(await screen.findByText('Offers Touched:0')).toBeTruthy();
    expect(await screen.findByText('No offer-backed sales in this window.')).toBeTruthy();
  });
});
