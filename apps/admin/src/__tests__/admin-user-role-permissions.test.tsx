import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { fetchAdminUserDetail, fetchRoleDetail, updateUserProfile } = vi.hoisted(() => ({
  fetchAdminUserDetail: vi.fn(),
  fetchRoleDetail: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'user-1' }) }));
vi.mock('../lib/api', () => ({
  fetchAdminUserDetail: (...args: unknown[]) => fetchAdminUserDetail(...args),
  fetchRoleDetail: (...args: unknown[]) => fetchRoleDetail(...args),
  updateUserProfile: (...args: unknown[]) => updateUserProfile(...args),
}));
vi.mock('../components/EntityActions', () => ({
  UserMemberships: () => <div>Membership assignment controls</div>,
  UserStatusActions: () => <div>User status controls</div>,
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true }),
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
  AdminDetailTabs: ({ tabs, activeKey, onChange }: { tabs: { key: string; label: string }[]; activeKey: string; onChange: (key: string) => void }) => (
    <nav>{tabs.map(tab => <button key={tab.key} type="button" aria-pressed={activeKey === tab.key} onClick={() => onChange(tab.key)}>{tab.label}</button>)}</nav>
  ),
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  AdminKeyValueGrid: () => null,
  AdminStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  AdminEntityLink: ({ name }: { name: string }) => <span>{name}</span>,
  AdminCopyButton: () => null,
  AdminRelatedTable: () => null,
  AdminLoadingSkeleton: () => <div role="status">Loading</div>,
  AdminErrorState: ({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) => (
    <div role="alert"><span>{title}: {message}</span><button type="button" onClick={onRetry}>Retry role permissions</button></div>
  ),
  AdminEmptyState: ({ title, description }: { title: string; description: string }) => <div><h3>{title}</h3><p>{description}</p></div>,
  formatDate: () => 'Today',
}));

import UserDetailPage from '../app/users/[id]/page';

const user = {
  id: 'user-1',
  fullName: 'Jane Doe',
  phone: '+15550100',
  email: 'jane@example.com',
  locale: 'en',
  status: 'ACTIVE',
  emailVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  organizations: [{
    orgId: 'org-1',
    orgName: 'North Wholesale',
    orgType: 'WHOLESALER',
    roleId: 'role-1',
    roleKey: 'MERCHANT_ADMIN',
    roleName: 'Merchant Admin',
    membershipStatus: 'ACTIVE',
    joinedAt: '2026-01-01T00:00:00.000Z',
  }],
};

describe('admin user role permissions', () => {
  beforeEach(() => {
    fetchAdminUserDetail.mockReset();
    fetchRoleDetail.mockReset();
    updateUserProfile.mockReset();
    updateUserProfile.mockResolvedValue({ id: 'user-1', fullName: 'Jane Updated', email: 'jane@example.com', phone: null, locale: 'en' });
    fetchAdminUserDetail.mockResolvedValue(user);
    fetchRoleDetail
      .mockRejectedValueOnce(new Error('Role permissions unavailable'))
      .mockResolvedValue({
        id: 'role-1',
        key: 'MERCHANT_ADMIN',
        name: 'Merchant Admin',
        permissions: ['merchant:orders:read', 'merchant:orders:write'],
        memberCount: 4,
      });
  });
  afterEach(() => cleanup());

  it('exposes profile editing through the existing audited profile endpoint', async () => {
    render(<UserDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Jane Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
      fullName: 'Jane Updated',
      email: 'jane@example.com',
      locale: 'en',
    })));
  });

  it('exposes organization membership controls on the dedicated user detail route', async () => {
    render(<UserDetailPage />);

    await screen.findByRole('heading', { name: 'Jane Doe' });
    fireEvent.click(screen.getByRole('button', { name: 'Organizations (1)' }));
    expect(screen.getByText('Membership assignment controls')).toBeTruthy();
    expect(screen.getByText('User status controls')).toBeTruthy();
  });

  it('shows permissions configured on the user\'s assigned role, with retry', async () => {
    render(<UserDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Role permissions' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Role permissions unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry role permissions' }));

    expect(await screen.findByText('merchant:orders:read')).toBeTruthy();
    expect(screen.getByText('merchant:orders:write')).toBeTruthy();
    expect(screen.queryByText('Effective Permissions')).toBeNull();
    expect(screen.getByText(/not a live authorization decision/)).toBeTruthy();
    expect(fetchRoleDetail).toHaveBeenCalledWith('role-1');
  });
});
