import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api, auth } = vi.hoisted(() => ({
  api: {
    fetchReturn: vi.fn(),
    approveReturn: vi.fn(),
    rejectReturn: vi.fn(),
    receiveReturn: vi.fn(),
    inspectReturn: vi.fn(),
    rejectReturnAfterInspection: vi.fn(),
  },
  auth: {
    user: { id: 'merchant-1', role: 'MERCHANT_OWNER' },
    loading: false,
  },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'return-1' }) }));
vi.mock('../components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../lib/buyer-api', () =>
  Object.fromEntries(
    Object.entries(api).map(([key, fn]) => [key, (...args: unknown[]) => fn(...args)]),
  ),
);
vi.mock('../components/Shared', () => ({
  formatDate: (value: string) => value,
  LoadingSpinner: () => <div>Loading</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
  Breadcrumb: () => <nav>Breadcrumb</nav>,
  colors: { border: '#ddd', muted: '#777', brand: { 700: '#123' } },
  radii: { md: 6, lg: 8 },
}));

import MerchantReturnDetailPage from '../app/merchant/returns/[id]/page';

const returnRequest = {
  id: 'return-1',
  status: 'REQUESTED',
  subOrderId: 'suborder-12345678',
  createdAt: '2026-11-22T10:00:00.000Z',
  requestedRefundMinor: 2500,
  reason: 'DAMAGED',
  description: null,
  items: [{ id: 'item-1', orderItemId: 'order-item-1', quantity: 1 }],
  events: [],
};

describe('merchant return detail recovery', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchReturn.mockResolvedValue(returnRequest);
  });
  afterEach(() => cleanup());

  it('shows a retry action after a failed detail read', async () => {
    api.fetchReturn
      .mockRejectedValueOnce(new Error('Return detail unavailable'))
      .mockResolvedValueOnce(returnRequest);

    render(<MerchantReturnDetailPage />);

    expect((await screen.findByText('Return detail unavailable')).textContent).toContain(
      'Return detail unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Return: Pending Review')).toBeTruthy();
    expect(api.fetchReturn).toHaveBeenCalledTimes(2);
  });
});
