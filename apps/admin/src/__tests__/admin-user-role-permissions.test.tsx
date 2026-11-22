import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAdminUserDetail, fetchRoleDetail } = vi.hoisted(() => ({
  fetchAdminUserDetail: vi.fn(),
  fetchRoleDetail: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'user-1' }) }));
vi.mock('../lib/api', () => ({
  fetchAdminUserDetail: (...args: unknown[]) => fetchAdminUserDetail(...args),
  fetchRoleDetail: (...args: unknown[]) => fetchRoleDetail(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true }),
}));
vi.mock('../components/detail', () => ({
  AdminDetailHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
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

  it('shows permissions configured on the user\'s assigned role, with retry', async () => {
    render(<UserDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Jane Doe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Role permissions' }));

    expect(await screen.findByText('Role permissions unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry role permissions' }));

    expect(await screen.findByText('merchant:orders:read')).toBeTruthy();
    expect(screen.getByText('merchant:orders:write')).toBeTruthy();
    expect(screen.queryByText('Effective Permissions')).toBeNull();
    expect(screen.getByText(/not a live authorization decision/)).toBeTruthy();
    expect(fetchRoleDetail).toHaveBeenCalledWith('role-1');
  });
});
