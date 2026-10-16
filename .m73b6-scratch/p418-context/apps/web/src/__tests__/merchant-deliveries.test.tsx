import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * M7.3-B.6 — Merchant Delivery Operations web console tests.
 *
 * Covers the tenant-scoped deliveries list and the per-shipment delivery console,
 * mocking the auth context and the ship-ops network client. Verifies that a
 * merchant can operate delivery end-to-end through the UI (list → open → carrier
 * create / cancel / exception / RTS) without any direct API usage.
 */

const ctl = vi.hoisted(() => ({
  auth: { user: { id: 'u-1', role: 'MERCHANT_OWNER', fullName: 'Merchant', perms: [] as string[] }, loading: false },
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ship-1' }),
  useRouter: () => ({ replace: ctl.replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/merchant/deliveries',
}));
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ctl.auth,
}));
vi.mock('../lib/shipops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/shipops')>();
  return {
    ...actual,
    listShipments: vi.fn(),
    getShipmentDetail: vi.fn(),
    createCarrierShipment: vi.fn(),
    cancelShipment: vi.fn(),
    reportException: vi.fn(),
    retryShipment: vi.fn(),
    requestRTS: vi.fn(),
    completeRTS: vi.fn(),
  };
});

import * as shipops from '../lib/shipops';
import MerchantDeliveriesPage from '../app/merchant/deliveries/page';
import MerchantDeliveryDetailPage from '../app/merchant/deliveries/[id]/page';

const row = {
  id: 'ship-1', orderId: 'order-1', storeId: 'store-1', status: 'IN_TRANSIT',
  carrierTrackingId: 'TRK-1', carrierShipmentId: 'cs-1', shippingProviderKey: 'aramex',
  carrierStatusMapped: null, carrierCreateStatus: 'SUCCESS', carrierCancelStatus: null,
  recoveryStatus: null, exceptionStatus: 'OPEN', exceptionType: 'DAMAGED', exceptionAt: null,
  deliveryAttempts: 1, maxDeliveryAttempts: 3, cancelledAt: null, deliveredAt: null,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
  storeName: 'Acme Store', orderStatus: 'OUT_FOR_DELIVERY',
};

function detailFixture(over: Record<string, unknown> = {}) {
  return {
    shipment: { ...row, ...over },
    store: { id: 'store-1', displayName: 'Acme Store', orgId: 'org-1' },
    order: { id: 'order-1', status: 'OUT_FOR_DELIVERY' },
    events: [{ id: 'e1', eventType: 'CREATED', actorType: 'SYSTEM', locationText: null, notes: null, sequence: 1, createdAt: '2026-09-01T00:00:00Z' }],
    labels: [{ id: 'l1', labelNumber: 'LBL-9', storageKey: 'k', mimeType: 'application/pdf', trackingUrl: 'https://x/y', isVoid: false, labelType: 'SHIPPING', createdAt: '2026-09-01T00:00:00Z' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ctl.auth = { user: { id: 'u-1', role: 'MERCHANT_OWNER', fullName: 'Merchant', perms: [] }, loading: false };
  vi.mocked(shipops.listShipments).mockResolvedValue({ data: [row], total: 1, limit: 25, offset: 0 });
  vi.mocked(shipops.getShipmentDetail).mockResolvedValue(detailFixture() as never);
  for (const fn of [shipops.createCarrierShipment, shipops.cancelShipment, shipops.reportException, shipops.retryShipment, shipops.requestRTS, shipops.completeRTS]) {
    vi.mocked(fn as (...a: unknown[]) => Promise<unknown>).mockResolvedValue({} as never);
  }
});
afterEach(() => { cleanup(); });

describe('Merchant deliveries list', () => {
  it('renders the merchant shipments with exception state', async () => {
    render(<MerchantDeliveriesPage />);
    expect(await screen.findByRole('tab', { name: 'All Deliveries' })).toBeTruthy();
    expect(screen.getByText('Acme Store')).toBeTruthy();
    expect(screen.getByText('TRK-1')).toBeTruthy();
    expect(screen.getByText('Open · DAMAGED')).toBeTruthy();
  });

  it('refetches with the selected queue scope', async () => {
    render(<MerchantDeliveriesPage />);
    await screen.findByText('TRK-1');
    fireEvent.click(screen.getByRole('tab', { name: 'Exceptions' }));
    await waitFor(() => expect(shipops.listShipments).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'exceptions' })));
  });

  it('redirects non-merchant roles away from the delivery console', async () => {
    ctl.auth = { user: { id: 'u-2', role: 'BUYER', fullName: 'Buyer', perms: [] }, loading: false };
    render(<MerchantDeliveriesPage />);
    await waitFor(() => expect(ctl.replace).toHaveBeenCalledWith('/search'));
  });
});

describe('Merchant delivery console', () => {
  it('renders overview + tracking timeline from the read model', async () => {
    render(<MerchantDeliveryDetailPage />);
    expect(await screen.findByText('Overview')).toBeTruthy();
    expect(screen.getByText(/Acme Store/)).toBeTruthy();
    expect(screen.getByText('Tracking timeline')).toBeTruthy();
    expect(screen.getByText(/CREATED/)).toBeTruthy();
  });

  it('queues a carrier shipment for a shipment not yet booked', async () => {
    vi.mocked(shipops.getShipmentDetail).mockResolvedValue(detailFixture({ carrierShipmentId: null, carrierCreateStatus: 'PENDING', status: 'PREPARING' }) as never);
    render(<MerchantDeliveryDetailPage />);
    const btn = await screen.findByRole('button', { name: 'Create carrier shipment' });
    fireEvent.click(btn);
    await waitFor(() => expect(shipops.createCarrierShipment).toHaveBeenCalledWith('ship-1'));
  });

  it('requires a reason before cancelling', async () => {
    vi.mocked(shipops.getShipmentDetail).mockResolvedValue(detailFixture({ status: 'PREPARING' }) as never);
    render(<MerchantDeliveryDetailPage />);
    const cancelBtn = await screen.findByRole('button', { name: 'Cancel' });
    expect(cancelBtn.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Cancel reason'), { target: { value: 'out of stock' } });
    expect(cancelBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(shipops.cancelShipment).toHaveBeenCalledWith('ship-1', 'out of stock'));
  });

  it('reports an exception on a clean shipment', async () => {
    vi.mocked(shipops.getShipmentDetail).mockResolvedValue(detailFixture({ exceptionStatus: null, exceptionType: null, status: 'OUT_FOR_DELIVERY' }) as never);
    render(<MerchantDeliveryDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Report exception' }));
    await waitFor(() => expect(shipops.reportException).toHaveBeenCalledWith('ship-1', expect.any(String), undefined));
  });

  it('requests RTS on an open exception', async () => {
    vi.mocked(shipops.getShipmentDetail).mockResolvedValue(detailFixture({ exceptionStatus: 'OPEN', exceptionType: 'RECIPIENT_UNAVAILABLE', status: 'OUT_FOR_DELIVERY' }) as never);
    render(<MerchantDeliveryDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Request RTS' }));
    await waitFor(() => expect(shipops.requestRTS).toHaveBeenCalledWith('ship-1', undefined));
  });

  it('surfaces a failed action as an error banner', async () => {
    vi.mocked(shipops.createCarrierShipment).mockRejectedValue(new Error('Provider unavailable'));
    vi.mocked(shipops.getShipmentDetail).mockResolvedValue(detailFixture({ carrierShipmentId: null, carrierCreateStatus: 'PENDING', status: 'PREPARING' }) as never);
    render(<MerchantDeliveryDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create carrier shipment' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Provider unavailable')).toBeTruthy();
  });
});
