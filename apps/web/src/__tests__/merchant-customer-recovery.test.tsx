import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ fetchMerchantCustomers: vi.fn() }));

vi.mock('../lib/buyer-api', () => ({
  fetchMerchantCustomers: (...args: unknown[]) =>
    api.fetchMerchantCustomers(...args),
}));
vi.mock('../lib/useMerchantRealtime', () => ({
  useMerchantRealtime: () => undefined,
}));
vi.mock('../components/Shared', () => ({
  formatMinor: (value: number) => String(value),
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
  colors: { muted: '#777' },
  typeScale: { body: {}, bodySm: {}, caption: {}, button: {} },
}));

import MerchantCustomersPage from '../app/merchant/customers/page';

const customer = {
  buyerId: 'buyer-1',
  buyerName: 'Test Buyer',
  buyerPhone: '+966500000001',
  buyerEmail: 'buyer@example.test',
  orderCount: 2,
  totalSpentMinor: 2500,
  lastOrderAt: '2026-11-22T10:00:00.000Z',
};

describe('merchant customer directory recovery', () => {
  beforeEach(() => {
    api.fetchMerchantCustomers.mockReset();
    api.fetchMerchantCustomers.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not report an empty customer directory after a failed read and supports retry', async () => {
    api.fetchMerchantCustomers
      .mockRejectedValueOnce(new Error('Customer directory unavailable'))
      .mockResolvedValueOnce([]);

    render(<MerchantCustomersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Customer directory unavailable',
    );
    expect(screen.queryByText('No customers yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No customers yet')).toBeTruthy();
    expect(api.fetchMerchantCustomers).toHaveBeenCalledTimes(2);
  });

  it('preserves the last successful customer list when a refresh fails', async () => {
    api.fetchMerchantCustomers
      .mockResolvedValueOnce([customer])
      .mockRejectedValueOnce(new Error('Refresh failed'));

    render(<MerchantCustomersPage />);

    expect(await screen.findByText('Test Buyer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('Refresh failed');
    expect(screen.getByText('Test Buyer')).toBeTruthy();
  });
});
