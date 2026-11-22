import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api, auth } = vi.hoisted(() => ({
  auth: { user: { perms: ['merchant:orders:write', 'fulfillment:shipments:assign'] } },
  api: {
    fetchOrders: vi.fn(),
    fetchMerchantCustomersCached: vi.fn(),
    clearMerchantCustomersCache: vi.fn(),
    acceptMerchantOrder: vi.fn(),
    rejectMerchantOrder: vi.fn(),
    transitionOrderStatus: vi.fn(),
    prepareOrder: vi.fn(),
    readyOrder: vi.fn(),
    assignDriver: vi.fn(),
    fetchMyStores: vi.fn(),
  },
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({ fetchMyStores: (...args: unknown[]) => api.fetchMyStores(...args) }));
vi.mock('../lib/merchant-store', () => ({
  pickStore: (stores: Array<{ id: string }>) => stores[0] ?? null,
  rememberStoreId: vi.fn(),
}));
vi.mock('../lib/useMerchantRealtime', () => ({ useMerchantRealtime: () => undefined }));
vi.mock('../lib/buyer-api', () => Object.fromEntries(
  Object.entries(api)
    .filter(([key]) => key !== 'fetchMyStores')
    .map(([key, fn]) => [key, (...args: unknown[]) => fn(...args)]),
));
vi.mock('../components/Shared', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  formatMinor: () => '0.00',
  formatDateCompact: () => 'Today',
  EmptyState: ({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) => (
    <section><h2>{title}</h2>{description ? <p>{description}</p> : null}{action}</section>
  ),
  LoadingSpinner: () => <div>Loading orders</div>,
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert"><span>{message}</span>{onRetry ? <button onClick={onRetry}>Retry</button> : null}</div>
  ),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header>
  ),
}));

import MerchantOrdersPage from '../app/merchant/orders/page';

const stores = [{ id: 'store-1', displayName: 'North Store', verificationStatus: 'VERIFIED' }];

describe('merchant orders store and queue read recovery', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchMerchantCustomersCached.mockResolvedValue([]);
    api.fetchOrders.mockResolvedValue([]);
    api.fetchMyStores.mockResolvedValue(stores);
  });
  afterEach(() => cleanup());

  it('does not show a false empty queue when store discovery fails and supports retry', async () => {
    api.fetchMyStores
      .mockRejectedValueOnce(new Error('Store directory unavailable'))
      .mockResolvedValueOnce(stores);

    render(<MerchantOrdersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Store directory unavailable');
    expect(screen.queryByText('No orders yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No orders yet')).toBeTruthy();
    expect(api.fetchMyStores).toHaveBeenCalledTimes(2);
    expect(api.fetchOrders).toHaveBeenCalledWith({ storeId: 'store-1' });
  });

  it('does not show a false empty queue when the order read fails and retries the selected store', async () => {
    api.fetchOrders
      .mockRejectedValueOnce(new Error('Orders unavailable'))
      .mockResolvedValueOnce([]);

    render(<MerchantOrdersPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Orders unavailable');
    expect(screen.queryByText('No orders yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No orders yet')).toBeTruthy();
    expect(api.fetchOrders).toHaveBeenCalledTimes(2);
  });
});
