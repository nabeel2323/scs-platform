import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { adminRequest, hasAccess } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'offer-1' }) }));
vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title }: { title: string }) => <header>{title}</header>,
  AdminDetailTabs: ({
    tabs,
    onChange,
  }: {
    tabs: { key: string; label: string }[];
    onChange: (key: string) => void;
  }) => (
    <nav>
      {tabs.map((tab) => (
        <button key={tab.key} onClick={() => onChange(tab.key)}>
          {tab.label}
        </button>
      ))}
    </nav>
  ),
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  AdminKeyValueGrid: ({
    items,
  }: {
    items: { key: string; label: string; value: React.ReactNode }[];
  }) => (
    <div>
      {items.map((item) => (
        <div key={item.key}>
          {item.label}:{item.value}
        </div>
      ))}
    </div>
  ),
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: () => null,
  AdminCopyButton: () => null,
  AdminLoadingSkeleton: () => <div>Loading offer</div>,
  AdminErrorState: ({
    title,
    message,
    onRetry,
  }: {
    title: string;
    message: string;
    onRetry: () => void;
  }) => (
    <div role="alert">
      <strong>{title}</strong>
      <span>{message}</span>
      <button onClick={onRetry}>Retry inventory</button>
    </div>
  ),
  formatDate: (value: string) => value,
  formatCurrency: (value: number, currency: string) => `${value} ${currency}`,
  formatBoolean: (value: boolean) => String(value),
}));

import OfferDetailPage from '../app/offers/[id]/page';

const offer = {
  id: 'offer-1',
  variantId: 'variant-1',
  status: 'ACTIVE',
  productId: 'product-1',
  storeId: 'store-1',
  storeName: 'Merchant Store',
  productTitle: 'Canonical Product',
  variantSku: 'SKU-1',
  basePriceMinor: 10000,
  currency: 'SAR',
  moq: 1,
  leadTimeDays: 2,
  isAvailable: true,
  activatedAt: null,
  createdAt: '2026-11-22T10:00:00.000Z',
  updatedAt: '2026-11-22T10:00:00.000Z',
};
const inventory = { totalAvailable: 7, totalOnHand: 9, warehouseCount: 2 };

describe('admin offer detail inventory recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    adminRequest.mockReset();
    adminRequest.mockImplementation((path: string) => {
      if (path === 'offers/offer-1') return Promise.resolve(offer);
      return Promise.resolve(inventory);
    });
  });

  afterEach(() => cleanup());

  it('preserves the last successful inventory summary when a refresh fails', async () => {
    adminRequest
      .mockImplementationOnce(() => Promise.resolve(offer))
      .mockImplementationOnce(() => Promise.resolve(inventory))
      .mockImplementationOnce(() => Promise.reject(new Error('Inventory service unavailable')));

    render(<OfferDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Inventory' }));
    expect(await screen.findByText('Total Available:7')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh inventory' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Inventory service unavailable',
    );
    expect(screen.getByText('Total Available:7')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('last successfully loaded inventory');
  });
});
