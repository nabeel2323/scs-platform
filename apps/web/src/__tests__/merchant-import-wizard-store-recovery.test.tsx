import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { authFetch, fetchMyStores, push } = vi.hoisted(() => ({
  authFetch: vi.fn(),
  fetchMyStores: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('../lib/auth', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }));
vi.mock('../lib/api', () => ({
  fetchMyStores: (...args: unknown[]) => fetchMyStores(...args),
}));
vi.mock('../lib/merchant-store', () => ({
  pickStore: (stores: Array<{ id: string }>) => stores[0] ?? null,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header>
  ),
}));

import ImportWizardPage from '../app/merchant/import/page';

const stores = [{ id: 'store-1', displayName: 'North Store' }];

describe('merchant import wizard store discovery recovery', () => {
  beforeEach(() => {
    authFetch.mockReset();
    fetchMyStores.mockReset();
    push.mockReset();
    fetchMyStores.mockResolvedValue(stores);
  });
  afterEach(() => cleanup());

  it('surfaces store lookup failures and retries discovery', async () => {
    fetchMyStores
      .mockRejectedValueOnce(new Error('Store directory unavailable'))
      .mockResolvedValueOnce(stores);

    render(<ImportWizardPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Store directory unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry store lookup' }));

    expect(await screen.findByText('North Store')).toBeTruthy();
    expect(fetchMyStores).toHaveBeenCalledTimes(2);
  });

  it('distinguishes a successful empty store directory from a failed lookup', async () => {
    fetchMyStores.mockResolvedValueOnce([]);

    render(<ImportWizardPage />);

    expect(await screen.findByText(/No store found/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next: Map Columns →' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Retry store lookup' })).toBeNull();
  });
});
