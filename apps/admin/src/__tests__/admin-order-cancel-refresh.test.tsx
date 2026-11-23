import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAdminOrderDetail, cancelAdminOrder, hasAccess } = vi.hoisted(() => ({
  fetchAdminOrderDetail: vi.fn(),
  cancelAdminOrder: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'order-123456789' }) }));
vi.mock('../lib/api', () => ({
  fetchAdminOrderDetail: (...args: unknown[]) => fetchAdminOrderDetail(...args),
  cancelAdminOrder: (...args: unknown[]) => cancelAdminOrder(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ status }: { status: string }) => <header>Order status: {status}</header>,
  AdminDetailTabs: () => <nav>Order tabs</nav>,
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  AdminKeyValueGrid: () => <div>Order fields</div>,
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: () => null,
  AdminCopyButton: () => null,
  AdminRelatedTable: () => null,
  AdminAuditTimeline: () => null,
  AdminLoadingSkeleton: () => <div>Loading order</div>,
  AdminErrorState: ({ title, message }: { title: string; message: string }) => (
    <div role="alert">
      {title}: {message}
    </div>
  ),
  AdminEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  formatDate: (value: string) => value,
  formatCurrency: (value: number, currency: string) => `${value} ${currency}`,
}));

import OrderDetailPage from '../app/orders/[id]/page';

const order = (status: string) => ({
  id: 'order-123456789',
  status,
  buyerId: 'buyer-1',
  storeId: 'store-1',
  fulfillmentMethod: 'DELIVERY',
  totalMinor: 10000,
  currency: 'SAR',
  masterOrderId: null,
  createdAt: '2026-11-22T10:00:00.000Z',
  updatedAt: '2026-11-22T10:00:00.000Z',
  subtotalMinor: 9000,
  deliveryFeeMinor: 1000,
  items: [],
  history: [],
  deliveryAddress: null,
  notes: null,
});

describe('admin order cancellation refresh recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    fetchAdminOrderDetail.mockReset().mockResolvedValue(order('ACCEPTED'));
    cancelAdminOrder.mockReset().mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reports cancellation success truthfully when the follow-up detail read fails', async () => {
    fetchAdminOrderDetail
      .mockResolvedValueOnce(order('ACCEPTED'))
      .mockRejectedValueOnce(new Error('Order read unavailable'));

    render(<OrderDetailPage />);

    expect(await screen.findByText('Order actions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));

    expect(
      await screen.findByText(
        'Order cancellation succeeded, but the latest order details could not be refreshed.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Order read unavailable');
    expect(screen.getByText('Order status: ACCEPTED')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('allows retrying the detail read after a successful cancellation', async () => {
    fetchAdminOrderDetail
      .mockResolvedValueOnce(order('ACCEPTED'))
      .mockRejectedValueOnce(new Error('Temporary order read failure'))
      .mockResolvedValueOnce(order('CANCELLED'));

    render(<OrderDetailPage />);

    expect(await screen.findByText('Order actions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(await screen.findByRole('button', { name: 'Retry order details' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry order details' }));
    expect(await screen.findByText('Order status: CANCELLED')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Order cancelled successfully.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
