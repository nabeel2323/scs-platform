import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchRoles } = vi.hoisted(() => ({ fetchRoles: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({ fetchRoles: (...args: unknown[]) => fetchRoles(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({ useRequirePerms: () => ({ hasAccess: true }) }));
vi.mock('../components/detail', () => ({
  AdminLoadingSkeleton: () => <div role="status">Loading roles</div>,
  AdminErrorState: ({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) => (
    <div role="alert"><span>{title}: {message}</span><button type="button" onClick={onRetry}>Retry roles</button></div>
  ),
}));

import RolesPage from '../app/roles/page';

describe('admin roles list recovery', () => {
  beforeEach(() => {
    fetchRoles.mockReset();
    fetchRoles.mockResolvedValue([{ id: 'role-1', key: 'MERCHANT_ADMIN', name: 'Merchant Admin', permissions: ['merchant:orders:read'] }]);
  });
  afterEach(() => cleanup());

  it('surfaces a failed role lookup and retries successfully', async () => {
    fetchRoles
      .mockRejectedValueOnce(new Error('Role directory unavailable'))
      .mockResolvedValueOnce([{ id: 'role-1', key: 'MERCHANT_ADMIN', name: 'Merchant Admin', permissions: ['merchant:orders:read'] }]);

    render(<RolesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Role directory unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry roles' }));

    expect(await screen.findByText('MERCHANT_ADMIN')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchRoles).toHaveBeenCalledTimes(2);
  });
});
