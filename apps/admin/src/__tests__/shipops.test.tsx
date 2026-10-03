import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * M7.3-B.6 — Admin Ship Operations console component tests.
 *
 * Exercises the permission gating, read-model rendering and the exception / RTS /
 * carrier action surface of the shipment detail console and shipments list, with
 * the network + auth boundaries mocked (useAdminResource, useAdminMutation,
 * getUser). Mirrors the mocking conventions of management.test.tsx.
 */

const ctl = vi.hoisted(() => ({
  perms: [] as string[],
  resource: { data: undefined as any, loading: false, error: '' as string, reload: vi.fn() },
  run: vi.fn(),
  busy: false,
  mutationError: '',
  search: new URLSearchParams(''),
  params: { id: 'ship-1' },
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ctl.params,
  useRouter: () => ({ replace: ctl.replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ctl.search,
  usePathname: () => '/shipments',
}));
vi.mock('../lib/auth', () => ({
  getUser: () => ({ id: 'u-1', phone: '0', fullName: 'Admin', role: 'ADMIN', perms: ctl.perms }),
}));
vi.mock('../hooks/useAdminTable', () => ({
  useAdminResource: () => ctl.resource,
  useAdminTableQuery: () => ({}),
}));
vi.mock('../components/EntityActions', () => ({
  useAdminMutation: () => ({ run: ctl.run, busy: ctl.busy, error: ctl.mutationError }),
}));

import ShipmentDetailPage from '../app/shipments/[id]/page';
import ShipmentsPage from '../app/shipments/page';

const READ = 'fulfillment:shipments:read';
const WRITE = 'fulfillment:shipments:write';
const RECOVER = 'admin:shipping:recovery';

function shipment(over: Record<string, unknown> = {}) {
  return {
    id: 'ship-1', status: 'OUT_FOR_DELIVERY', shippingProviderKey: 'aramex',
    carrierShipmentId: 'cs-1', carrierTrackingId: 'TRK-1', carrierCreateStatus: 'SUCCESS',
    carrierCreateRetries: 0, carrierCancelStatus: null, recoveryStatus: null,
    carrierStatusMapped: 'IN_TRANSIT', exceptionStatus: null, exceptionType: null,
    exceptionAt: null, exceptionNotes: null, deliveryAttempts: 1, maxDeliveryAttempts: 3,
    pickedUpAt: '2026-09-01T00:00:00Z', outForDeliveryAt: '2026-09-02T00:00:00Z',
    deliveredAt: null, cancelledAt: null, createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z', ...over,
  };
}

function detailFixture(shipmentOver: Record<string, unknown> = {}, extra: { events?: unknown[]; labels?: unknown[] } = {}) {
  return {
    shipment: shipment(shipmentOver),
    store: { id: 'store-1', displayName: 'Acme Store', orgId: 'org-1' },
    order: { id: 'order-1', status: 'OUT_FOR_DELIVERY' },
    events: extra.events ?? [],
    labels: extra.labels ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ctl.perms = [];
  ctl.resource = { data: undefined, loading: false, error: '', reload: ctl.resource.reload };
  ctl.busy = false; ctl.mutationError = '';
  ctl.search = new URLSearchParams('');
  ctl.params = { id: 'ship-1' };
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openExceptionsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: /Exceptions/ }));
}

describe('ShipmentDetailConsole — read + permissions', () => {
  it('denies access without the shipment read permission', async () => {
    ctl.perms = [];
    render(<ShipmentDetailPage />);
    expect(await screen.findByText('Access Denied')).toBeTruthy();
  });

  it('renders the overview from the read model', async () => {
    ctl.perms = [READ];
    ctl.resource.data = detailFixture();
    render(<ShipmentDetailPage />);
    expect((await screen.findAllByText('Shipment ship-1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Acme Store').length).toBeGreaterThan(0);
    expect(screen.getByText('aramex')).toBeTruthy();
  });

  it('surfaces a load error with a retry hook', async () => {
    ctl.perms = [READ];
    ctl.resource.error = 'Shipment not found';
    render(<ShipmentDetailPage />);
    expect(await screen.findByText('Unable to load shipment')).toBeTruthy();
    expect(screen.getByText('Shipment not found')).toBeTruthy();
  });
});

describe('ShipmentDetailConsole — exception actions', () => {
  it('reports an exception and authorizes a retry when OPEN (with write perm)', async () => {
    ctl.perms = [READ, WRITE];
    ctl.resource.data = detailFixture({ exceptionStatus: 'OPEN', exceptionType: 'RECIPIENT_UNAVAILABLE' });
    render(<ShipmentDetailPage />);
    await openExceptionsTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Report exception' }));
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/exception', 'POST', expect.objectContaining({ exceptionType: 'RECIPIENT_UNAVAILABLE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Authorize retry' }));
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/retry', 'POST');
  });

  it('hides all write actions without the write permission', async () => {
    ctl.perms = [READ];
    ctl.resource.data = detailFixture({ exceptionStatus: 'OPEN', exceptionType: 'RECIPIENT_UNAVAILABLE' });
    render(<ShipmentDetailPage />);
    await openExceptionsTab();
    expect(await screen.findByText('Delivery exception')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Report exception' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request RTS' })).toBeNull();
  });

  it('offers the LOST auto-approve path, gated on a justification note', async () => {
    ctl.perms = [READ, WRITE];
    ctl.resource.data = detailFixture({ exceptionStatus: null, exceptionType: 'LOST' });
    render(<ShipmentDetailPage />);
    await openExceptionsTab();
    const lost = await screen.findByRole('button', { name: 'Resolve as LOST (auto-approve RTS)' });
    expect(lost.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('LOST justification (required)'), { target: { value: 'confirmed lost' } });
    expect(lost.hasAttribute('disabled')).toBe(false);
    fireEvent.click(lost);
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/rts', 'POST', expect.objectContaining({ notes: 'confirmed lost' }));
  });
});

describe('ShipmentDetailConsole — RTS lifecycle', () => {
  it('shows approve/reject on RTS_PENDING and requires a rejection reason', async () => {
    ctl.perms = [READ, WRITE];
    ctl.resource.data = detailFixture({ exceptionStatus: 'RTS_PENDING', exceptionType: 'RECIPIENT_REFUSED' });
    render(<ShipmentDetailPage />);
    await openExceptionsTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve RTS' }));
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/rts/approve', 'POST');
    const reject = screen.getByRole('button', { name: 'Reject RTS' });
    expect(reject.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Rejection reason (required)'), { target: { value: 'not eligible' } });
    expect(reject.hasAttribute('disabled')).toBe(false);
    fireEvent.click(reject);
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/rts/reject', 'POST', { notes: 'not eligible' });
  });

  it('completes an approved RTS from RTS_IN_PROGRESS', async () => {
    ctl.perms = [READ, WRITE];
    ctl.resource.data = detailFixture({ exceptionStatus: 'RTS_IN_PROGRESS', exceptionType: 'DAMAGED' });
    render(<ShipmentDetailPage />);
    await openExceptionsTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Complete RTS' }));
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/rts/complete', 'POST', expect.anything());
  });

  it('reports a mutation error inline', async () => {
    ctl.perms = [READ, WRITE];
    ctl.resource.data = detailFixture({ exceptionStatus: 'OPEN', exceptionType: 'OTHER' });
    ctl.mutationError = 'RTS rejected: shipment not delivered';
    render(<ShipmentDetailPage />);
    await openExceptionsTab();
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('RTS rejected: shipment not delivered').length).toBeGreaterThan(0);
  });
});

describe('ShipmentDetailConsole — carrier operations', () => {
  it('queues a carrier create and a reconciliation when permitted', async () => {
    ctl.perms = [READ, WRITE, RECOVER];
    ctl.resource.data = detailFixture({ carrierCreateStatus: 'FAILED', carrierShipmentId: null });
    render(<ShipmentDetailPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Carrier/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue carrier create' }));
    expect(ctl.run).toHaveBeenCalledWith('shipments/ship-1/create', 'POST');
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile / recover' }));
    expect(ctl.run).toHaveBeenCalledWith('carrier/shipments/ship-1/recover', 'POST');
  });

  it('withholds recovery from operators without the recovery permission', async () => {
    ctl.perms = [READ, WRITE];
    ctl.resource.data = detailFixture({ carrierCreateStatus: 'RECOVERY_REQUIRED' });
    render(<ShipmentDetailPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Carrier/ }));
    expect(await screen.findByRole('button', { name: 'Cancel shipment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconcile / recover' })).toBeNull();
  });
});

describe('ShipmentsConsole — list', () => {
  it('renders shipment rows and a total', async () => {
    ctl.perms = [READ];
    ctl.resource.data = { data: [shipment({ storeName: 'Acme Store' })], total: 1 };
    render(<ShipmentsPage />);
    expect(await screen.findByText('Ship Operations')).toBeTruthy();
    expect(screen.getByText(/1 shipment\(s\)/)).toBeTruthy();
    expect(screen.getByText('Acme Store')).toBeTruthy();
    expect(screen.getByText('TRK-1')).toBeTruthy();
  });

  it('denies access without the read permission', async () => {
    ctl.perms = [];
    render(<ShipmentsPage />);
    expect(await screen.findByText('Access Denied')).toBeTruthy();
    await waitFor(() => expect(ctl.resource.data).toBeUndefined());
  });
});
