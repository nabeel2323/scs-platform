import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api, auth } = vi.hoisted(() => ({
  api: {
    fetchMyStores: vi.fn(),
    fetchMerchantSettlements: vi.fn(),
  },
  auth: {
    user: { id: 'merchant-1', role: 'MERCHANT_OWNER', activeOrgId: 'org-1' },
    loading: false,
  },
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../lib/api', () => ({ fetchMyStores: (...args: unknown[]) => api.fetchMyStores(...args) }));
vi.mock('../lib/buyer-api', () => ({
  fetchMerchantSettlements: (...args: unknown[]) => api.fetchMerchantSettlements(...args),
}));
vi.mock('../lib/merchant-store', () => ({ pickStore: (stores: Array<{ id: string }>) => stores[0] }));
vi.mock('../components/Shared', () => ({
  formatDateCompact: (value: string) => value,
  formatMinor: (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`,
  LoadingSpinner: () => <div>Loading</div>,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <section><h2>{title}</h2>{description ? <p>{description}</p> : null}</section>
  ),
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert"><span>{message}</span>{onRetry ? <button onClick={onRetry}>Retry</button> : null}</div>
  ),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header>
  ),
  colors: { border: '#ddd', muted: '#777', text: '#222' },
  radii: { md: 6, lg: 8 },
}));

import MerchantSettlementsPage from '../app/merchant/settlements/page';

const stores = [
  { id: 'store-1', displayName: 'North Store' },
  { id: 'store-2', displayName: 'South Store' },
];
const adjustment = {
  id: 'settlement-adjustment-1',
  subOrderId: 'suborder-12345678',
  merchantStoreId: 'store-1',
  paymentRecordId: 'payment-1',
  grossMinor: 0,
  refundMinor: 0,
  commissionMinor: 125,
  feeMinor: 0,
  netMinor: 125,
  currency: 'SAR',
  status: 'PAID',
  metadata: { adjustmentId: 'adjustment-1' },
  paymentReference: 'ADJ-REF-1',
  paidAt: '2026-11-23T10:00:00.000Z',
  createdAt: '2026-11-23T09:00:00.000Z',
};

describe('merchant settlements projection and recovery', () => {
  beforeEach(() => {
    api.fetchMyStores.mockReset().mockResolvedValue(stores);
    api.fetchMerchantSettlements.mockReset().mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('loads the active store settlement list and displays adjustment payout details', async () => {
    api.fetchMerchantSettlements.mockResolvedValueOnce([adjustment]);
    render(<MerchantSettlementsPage />);

    expect(await screen.findByText('suborder…')).toBeTruthy();
    expect(screen.getByText('ADJUSTMENT · PAID')).toBeTruthy();
    expect(screen.getByText('ADJ-REF-1')).toBeTruthy();
    expect(api.fetchMerchantSettlements).toHaveBeenCalledWith('store-1', undefined);
  });

  it('loads the selected store and status filter', async () => {
    render(<MerchantSettlementsPage />);

    fireEvent.change(await screen.findByLabelText('Select store'), { target: { value: 'store-2' } });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'ADJUSTMENT' } });

    expect(api.fetchMerchantSettlements).toHaveBeenCalledWith('store-2', 'ADJUSTMENT');
  });

  it('shows a retry action instead of a false empty state after a failed read', async () => {
    api.fetchMerchantSettlements
      .mockRejectedValueOnce(new Error('Settlements unavailable'))
      .mockResolvedValueOnce([]);

    render(<MerchantSettlementsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Settlements unavailable');
    expect(screen.queryByText('No settlements')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No settlements')).toBeTruthy();
    expect(api.fetchMerchantSettlements).toHaveBeenCalledTimes(2);
  });

  it('does not treat a failed store directory read as an empty store list', async () => {
    api.fetchMyStores.mockRejectedValueOnce(new Error('Stores unavailable'));
    render(<MerchantSettlementsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Stores unavailable');
    expect(screen.queryByText('No stores available')).toBeNull();
  });
});
