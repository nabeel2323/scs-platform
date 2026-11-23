import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const {
  fetchAdminOrganizations,
  fetchAdminOrgUpdateRequests,
  deactivateAdminOrganization,
  reviewOrgUpdateRequest,
  fetchAdminOrganizationDetail,
  getUser,
} = vi.hoisted(() => ({
  fetchAdminOrganizations: vi.fn(),
  fetchAdminOrgUpdateRequests: vi.fn(),
  deactivateAdminOrganization: vi.fn(),
  reviewOrgUpdateRequest: vi.fn(),
  fetchAdminOrganizationDetail: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@scs/contracts', () => ({
  UPDATE_REQUEST_STATUS_LABELS: { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' },
}));
vi.mock('../lib/api', () => ({
  fetchAdminOrganizations: (...args: unknown[]) => fetchAdminOrganizations(...args),
  fetchAdminOrgUpdateRequests: (...args: unknown[]) => fetchAdminOrgUpdateRequests(...args),
  deactivateAdminOrganization: (...args: unknown[]) => deactivateAdminOrganization(...args),
  reviewOrgUpdateRequest: (...args: unknown[]) => reviewOrgUpdateRequest(...args),
  fetchAdminOrganizationDetail: (...args: unknown[]) => fetchAdminOrganizationDetail(...args),
}));
vi.mock('../lib/auth', () => ({ getUser: (...args: unknown[]) => getUser(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Modal: () => null,
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
  colors: {
    errBg: '#fee',
    err: '#b00',
    okBg: '#efe',
    ok: '#080',
    border: '#ddd',
    surface: '#fff',
    brand: { 50: '#eee', 300: '#ddd', 500: '#aaa', 700: '#333' },
    muted: '#888',
    warn: '#880',
    warnBg: '#ffe',
    bgSubtle: '#fafafa',
  },
  typeScale: {
    body: { fontSize: 14 },
    bodySm: { fontSize: 12 },
    caption: { fontSize: 11 },
    label: { fontSize: 10 },
    h4: { fontSize: 16 },
  },
  radii: { sm: 6, md: 8, full: 999 },
  shadows: { md: '' },
  transitions: { fast: '100ms' },
}));

import OrganizationsPage from '../app/organizations/page';

const orgs = [
  {
    id: 'org-1',
    name: 'North Wholesale',
    legalName: 'North Wholesale LLC',
    type: 'WHOLESALER',
    country: 'SA',
    verificationStatus: 'VERIFIED',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('admin organizations independent read recovery', () => {
  beforeEach(() => {
    fetchAdminOrganizations.mockReset();
    fetchAdminOrgUpdateRequests.mockReset();
    deactivateAdminOrganization.mockReset();
    reviewOrgUpdateRequest.mockReset();
    fetchAdminOrganizationDetail.mockReset();
    getUser.mockReset();
    getUser.mockReturnValue({ perms: [] });
    fetchAdminOrganizations.mockResolvedValue(orgs);
    fetchAdminOrgUpdateRequests.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('recovers organization and update-request reads independently without false empty states', async () => {
    fetchAdminOrganizations
      .mockRejectedValueOnce(new Error('Organizations unavailable'))
      .mockResolvedValueOnce(orgs);
    fetchAdminOrgUpdateRequests
      .mockRejectedValueOnce(new Error('Update requests unavailable'))
      .mockResolvedValueOnce([]);

    render(<OrganizationsPage />);

    expect(await screen.findByText('Organizations unavailable')).toBeTruthy();
    expect(await screen.findByText('Update requests unavailable')).toBeTruthy();
    expect(screen.queryByText('No organizations found.')).toBeNull();
    expect(screen.queryByText('No update requests pending review.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry organizations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry update requests' }));

    expect(await screen.findByText('North Wholesale')).toBeTruthy();
    expect(await screen.findByText('No update requests pending review.')).toBeTruthy();
  });
});
