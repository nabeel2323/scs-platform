import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api, auth } = vi.hoisted(() => ({
  api: {
    fetchMyStores: vi.fn(),
    fetchMerchantReturns: vi.fn(),
  },
  auth: {
    user: { id: 'merchant-1', role: 'MERCHANT_OWNER' },
    loading: false,
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../lib/api', () => ({
  fetchMyStores: (...args: unknown[]) => api.fetchMyStores(...args),
}));
vi.mock('../lib/buyer-api', () => ({
  fetchMerchantReturns: (...args: unknown[]) => api.fetchMerchantReturns(...args),
}));
vi.mock('../components/Shared', () => ({
  formatDate: (value: string) => value,
  LoadingSpinner: () => <div>Loading</div>,
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </section>
  ),
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert">
      <span>{message}</span>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
  colors: { border: '#ddd', muted: '#777' },
  radii: { md: 6, lg: 8 },
}));

import MerchantReturnsPage from '../app/merchant/returns/page';

const stores = [
  { id: 'store-1', displayName: 'North Store' },
  { id: 'store-2', displayName: 'South Store' },
];
const returnRequest = {
  id: 'return-1',
  reason: 'DAMAGED',
  subOrderId: 'suborder-12345678',
  createdAt: '2026-11-22T10:00:00.000Z',
  items: [{ id: 'item-1', quantity: 1 }],
  status: 'REQUESTED',
  requestedRefundMinor: 12500,
};

describe('merchant returns store selection and recovery', () => {
  beforeEach(() => {
    api.fetchMyStores.mockReset().mockResolvedValue(stores);
    api.fetchMerchantReturns.mockReset().mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('loads the first available store without requiring a manually entered ID', async () => {
    api.fetchMerchantReturns.mockResolvedValueOnce([returnRequest]);
    render(<MerchantReturnsPage />);

    expect(await screen.findByText('DAMAGED — suborder-…')).toBeTruthy();
    expect(screen.getByLabelText('Select store')).toHaveProperty('value', 'store-1');
    expect(api.fetchMerchantReturns).toHaveBeenCalledWith('store-1', undefined);
  });

  it('loads returns for the selected store and status filter', async () => {
    render(<MerchantReturnsPage />);
    const storeSelect = await screen.findByLabelText('Select store');
    fireEvent.change(storeSelect, { target: { value: 'store-2' } });
    const statusSelect = screen.getByLabelText('Filter by status');
    fireEvent.change(statusSelect, { target: { value: 'REQUESTED' } });

    expect(api.fetchMerchantReturns).toHaveBeenCalledWith('store-2', 'REQUESTED');
  });

  it('shows a retry action instead of a false empty state after a failed read', async () => {
    api.fetchMerchantReturns
      .mockRejectedValueOnce(new Error('Returns unavailable'))
      .mockResolvedValueOnce([]);

    render(<MerchantReturnsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Returns unavailable');
    expect(screen.queryByText('No returns')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No returns')).toBeTruthy();
    expect(api.fetchMerchantReturns).toHaveBeenCalledTimes(2);
  });

  it('allows retrying a failed store directory read', async () => {
    api.fetchMyStores
      .mockRejectedValueOnce(new Error('Stores unavailable'))
      .mockResolvedValueOnce(stores);

    render(<MerchantReturnsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Stores unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByLabelText('Select store')).toBeTruthy();
    expect(api.fetchMyStores).toHaveBeenCalledTimes(2);
  });

  it('does not present a failed store directory read as an empty store list', async () => {
    api.fetchMyStores.mockRejectedValueOnce(new Error('Stores unavailable'));
    render(<MerchantReturnsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Stores unavailable');
    expect(screen.queryByText('No stores available')).toBeNull();
  });
});
