import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { authFetch, fetchMyStores } = vi.hoisted(() => ({
  authFetch: vi.fn(),
  fetchMyStores: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/auth', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }));
vi.mock('../lib/api', () => ({
  fetchMyStores: (...args: unknown[]) => fetchMyStores(...args),
}));
vi.mock('../lib/merchant-store', () => ({
  pickStore: (stores: Array<{ id: string }>) => stores[0] ?? null,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
}));

import ImportHistoryPage from '../app/merchant/imports/page';

const stores = [{ id: 'store-1', displayName: 'North Store' }];

describe('merchant import history recovery', () => {
  beforeEach(() => {
    authFetch.mockReset();
    fetchMyStores.mockReset();
    fetchMyStores.mockResolvedValue(stores);
    authFetch.mockResolvedValue({ ok: true, json: async () => [] });
  });
  afterEach(() => cleanup());

  it('surfaces store-directory failures and retries store discovery', async () => {
    fetchMyStores
      .mockRejectedValueOnce(new Error('Store directory unavailable'))
      .mockResolvedValueOnce(stores);

    render(<ImportHistoryPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Store directory unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry stores' }));

    expect(await screen.findByText('No imports yet')).toBeTruthy();
    expect(fetchMyStores).toHaveBeenCalledTimes(2);
    expect(authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/stores/store-1/imports'),
    );
  });

  it('does not show a successful empty state when the import read fails', async () => {
    authFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<ImportHistoryPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Failed to load imports: 503');
    expect(screen.queryByText('No imports yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No imports yet')).toBeTruthy();
    expect(authFetch).toHaveBeenCalledTimes(2);
  });

  it('shows a distinct no-store state instead of loading forever', async () => {
    fetchMyStores.mockResolvedValueOnce([]);

    render(<ImportHistoryPage />);

    expect(await screen.findByText('No store found')).toBeTruthy();
    expect(screen.queryByText('Loading import history...')).toBeNull();
    expect(screen.queryByText('+ New Import')).toBeNull();
  });
});
