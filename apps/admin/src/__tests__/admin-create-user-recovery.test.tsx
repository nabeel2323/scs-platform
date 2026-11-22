import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { createUser, fetchAdminOrganizations, fetchRoles } = vi.hoisted(() => ({
  createUser: vi.fn(),
  fetchAdminOrganizations: vi.fn(),
  fetchRoles: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  createUser: (...args: unknown[]) => createUser(...args),
  fetchAdminOrganizations: (...args: unknown[]) => fetchAdminOrganizations(...args),
  fetchRoles: (...args: unknown[]) => fetchRoles(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true }),
}));
vi.mock('../components/RecordFields', () => ({
  ErrorNotice: ({ message, retry }: { message?: string; retry?: () => void }) => message ? (
    <div role="alert">{message}{retry ? <button type="button" onClick={retry}>Retry lookup</button> : null}</div>
  ) : null,
}));

import { CreateUserForm } from '../components/CreateUserForm';

const organizations = [{ id: 'org-1', name: 'North Wholesale', type: 'WHOLESALER' }];
const roles = [{ id: 'role-1', key: 'MERCHANT_ADMIN', name: 'Merchant Admin', permissions: ['merchant:orders:read'] }];

describe('admin create user form', () => {
  beforeEach(() => {
    createUser.mockReset();
    fetchAdminOrganizations.mockReset();
    fetchRoles.mockReset();
    createUser.mockResolvedValue({ id: 'user-1', email: 'jane@example.com', status: 'ACTIVE' });
    fetchAdminOrganizations.mockResolvedValue(organizations);
    fetchRoles.mockResolvedValue(roles);
  });
  afterEach(() => cleanup());

  it('recovers organization and role lookups independently and allows optional phone', async () => {
    fetchAdminOrganizations
      .mockRejectedValueOnce(new Error('Organization directory unavailable'))
      .mockResolvedValueOnce(organizations);
    fetchRoles
      .mockRejectedValueOnce(new Error('Role directory unavailable'))
      .mockResolvedValueOnce(roles);
    const onDone = vi.fn();

    render(<CreateUserForm onCancel={vi.fn()} onDone={onDone} />);

    expect(await screen.findByText('Organization directory unavailable')).toBeTruthy();
    expect(await screen.findByText('Role directory unavailable')).toBeTruthy();

    const retryButtons = screen.getAllByRole('button', { name: 'Retry lookup' });
    fireEvent.click(retryButtons[0]!);
    fireEvent.click(retryButtons[1]!);

    expect(await screen.findByRole('option', { name: 'North Wholesale (WHOLESALER)' })).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'MERCHANT_ADMIN — Merchant Admin' })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), { target: { value: 'jane@example.com' } });
    expect((screen.getByLabelText('Phone (optional)') as HTMLInputElement).required).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: undefined,
      orgId: undefined,
      roleId: undefined,
    }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('requires organization and role to be selected together', async () => {
    render(<CreateUserForm onCancel={vi.fn()} onDone={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Organization'), { target: { value: 'org-1' } });
    expect(screen.getByRole('button', { name: 'Create User' })).toBeDisabled();
    expect(createUser).not.toHaveBeenCalled();
  });
});
