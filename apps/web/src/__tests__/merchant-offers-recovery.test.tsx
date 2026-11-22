import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api, auth } = vi.hoisted(() => ({
  api: {
    fetchMyStores: vi.fn(),
    fetchMerchantOffers: vi.fn(),
    fetchMerchantOfferAnalytics: vi.fn(),
    fetchMerchantOfferTrend: vi.fn(),
    fetchStoreProducts: vi.fn(),
    createMerchantOffer: vi.fn(),
    proposeOffer: vi.fn(),
    withdrawOffer: vi.fn(),
  },
  auth: {
    user: { id: 'merchant-1', perms: [] },
    loading: false,
  },
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../lib/api', () => ({ fetchMyStores: (...args: unknown[]) => api.fetchMyStores(...args) }));
vi.mock('../lib/merchant-store', () => ({ pickStore: (stores: Array<{ id: string }>) => stores[0] ?? null }));
vi.mock('../lib/buyer-api', () => Object.fromEntries(
  Object.entries(api).map(([key, fn]) => [key, (...args: unknown[]) => fn(...args)]),
));
vi.mock('../components/Shared', () => ({
  LoadingSpinner: () => <div>Loading</div>,
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert"><span>{message}</span>{onRetry ? <button onClick={onRetry}>Retry</button> : null}</div>
  ),
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <section><h2>{title}</h2>{description ? <p>{description}</p> : null}</section>
  ),
  formatMinor: (value: number) => String(value),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header>
  ),
  colors: {
    bgSubtle: '#eee', muted: '#777', infoBg: '#def', info: '#1565c0',
    okBg: '#def', ok: '#167', warnBg: '#fed', warn: '#b70',
    errBg: '#fee', err: '#c00', disabled: '#999', border: '#ddd',
    brand: { 500: '#167', 700: '#123' },
  },
  typeScale: { button: {} },
  radii: { sm: 4, md: 6 },
}));

import MerchantOffersPage from '../app/merchant/offers/page';

const stores = [{ id: 'store-1', displayName: 'North Store' }];
const offer = {
  id: 'offer-1',
  status: 'ACTIVE',
  productId: 'product-1',
  variantId: null,
  basePriceMinor: 12500,
  currency: 'SAR',
  moq: 1,
  leadTimeDays: 3,
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('merchant offers read recovery', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchMyStores.mockResolvedValue(stores);
    api.fetchMerchantOffers.mockResolvedValue([]);
    api.fetchMerchantOfferAnalytics.mockResolvedValue([]);
    api.fetchMerchantOfferTrend.mockResolvedValue([]);
    api.fetchStoreProducts.mockResolvedValue({ items: [] });
  });
  afterEach(() => cleanup());

  it('shows a retry action instead of remaining in loading after store discovery fails', async () => {
    api.fetchMyStores
      .mockRejectedValueOnce(new Error('Store directory unavailable'))
      .mockResolvedValueOnce(stores);

    render(<MerchantOffersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Store directory unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No offers')).toBeTruthy();
    expect(api.fetchMyStores).toHaveBeenCalledTimes(2);
  });

  it('does not report zero sales when the analytics read fails', async () => {
    api.fetchMerchantOffers.mockResolvedValueOnce([offer]);
    api.fetchMerchantOfferAnalytics.mockRejectedValueOnce(new Error('Offer analytics unavailable'));

    render(<MerchantOffersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Offer analytics unavailable');
    const row = screen.getByRole('table').querySelector('tbody tr');
    expect(row?.textContent).toContain('—');
    expect(row?.textContent).not.toContain('0');
  });

  it('does not present a failed offers read as a successful empty list', async () => {
    api.fetchMerchantOffers.mockRejectedValueOnce(new Error('Offers unavailable'));

    render(<MerchantOffersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Offers unavailable');
    expect(screen.queryByText('No offers')).toBeNull();
  });
});
