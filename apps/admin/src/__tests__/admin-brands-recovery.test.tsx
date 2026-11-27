import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAdminBrandsEnriched, createAdminBrand, updateAdminBrand } = vi.hoisted(() => ({
  fetchAdminBrandsEnriched: vi.fn(),
  createAdminBrand: vi.fn(),
  updateAdminBrand: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAdminBrandsEnriched: (...args: unknown[]) => fetchAdminBrandsEnriched(...args),
  createAdminBrand: (...args: unknown[]) => createAdminBrand(...args),
  updateAdminBrand: (...args: unknown[]) => updateAdminBrand(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));

import BrandsPage from '../app/brands/page';

describe('admin brands list recovery', () => {
  beforeEach(() => {
    fetchAdminBrandsEnriched.mockReset();
    createAdminBrand.mockReset();
    updateAdminBrand.mockReset();
    fetchAdminBrandsEnriched.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not show an empty brand list after a failed read and retries', async () => {
    fetchAdminBrandsEnriched
      .mockRejectedValueOnce(new Error('Brand directory unavailable'))
      .mockResolvedValueOnce([]);

    render(<BrandsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Brand directory unavailable');
    expect(screen.queryByText('No brands found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry brands' }));
    expect(await screen.findByText('No brands found')).toBeTruthy();
    expect(fetchAdminBrandsEnriched).toHaveBeenCalledTimes(2);
  });
});
