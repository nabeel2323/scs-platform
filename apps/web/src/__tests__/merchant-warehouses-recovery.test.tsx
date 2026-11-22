import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchMyStores, fetchWarehouses, createWarehouse, updateWarehouse, auth } = vi.hoisted(() => ({
  fetchMyStores: vi.fn(),
  fetchWarehouses: vi.fn(),
  createWarehouse: vi.fn(),
  updateWarehouse: vi.fn(),
  auth: { user: { perms: ['merchant:stores:write'] } },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/api', () => ({
  fetchMyStores: (...args: unknown[]) => fetchMyStores(...args),
  fetchWarehouses: (...args: unknown[]) => fetchWarehouses(...args),
  createWarehouse: (...args: unknown[]) => createWarehouse(...args),
  updateWarehouse: (...args: unknown[]) => updateWarehouse(...args),
}));
vi.mock('../components/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header>
  ),
}));
vi.mock('../components/Shared', () => ({
  LoadingSpinner: () => <div role="status">Loading...</div>,
  ErrorBanner: ({ message }: { message: string }) => <div>{message}</div>,
  EmptyState: ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => (
    <section><h2>{title}</h2><p>{description}</p>{action}</section>
  ),
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  formatDate: () => 'Today',
}));

import WarehousesPage from '../app/merchant/warehouses/page';

const stores = [{ id: 'store-1', displayName: 'North Store', verificationStatus: 'VERIFIED' }];

describe('merchant warehouses read recovery', () => {
  beforeEach(() => {
    auth.user.perms = ['merchant:stores:write'];
    fetchMyStores.mockReset();
    fetchWarehouses.mockReset();
    createWarehouse.mockReset();
    updateWarehouse.mockReset();
    fetchMyStores.mockResolvedValue(stores);
    fetchWarehouses.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('surfaces store discovery errors and retries the lookup', async () => {
    fetchMyStores
      .mockRejectedValueOnce(new Error('Store directory unavailable'))
      .mockResolvedValueOnce(stores);

    render(<WarehousesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Store directory unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry store lookup' }));

    expect(await screen.findByText('No warehouses yet. Click "Add Warehouse" to create one.')).toBeTruthy();
    expect(fetchMyStores).toHaveBeenCalledTimes(2);
  });

  it('does not show an empty warehouse state after a failed list read', async () => {
    fetchWarehouses
      .mockRejectedValueOnce(new Error('Warehouse directory unavailable'))
      .mockResolvedValueOnce([]);

    render(<WarehousesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Warehouse directory unavailable');
    expect(screen.queryByText(/No warehouses yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry warehouses' }));

    expect(await screen.findByText('No warehouses yet. Click "Add Warehouse" to create one.')).toBeTruthy();
    expect(fetchWarehouses).toHaveBeenCalledTimes(2);
  });

  it('hides warehouse mutations when the active organization lacks store write permission', async () => {
    auth.user.perms = [];

    render(<WarehousesPage />);

    expect(await screen.findByText(/No warehouses yet\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Warehouse' })).toBeNull();
  });

  it('keeps a true no-store state separate from store lookup failure', async () => {
    fetchMyStores.mockResolvedValueOnce([]);

    render(<WarehousesPage />);

    expect(await screen.findByText('No store found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry store lookup' })).toBeNull();
  });
});
