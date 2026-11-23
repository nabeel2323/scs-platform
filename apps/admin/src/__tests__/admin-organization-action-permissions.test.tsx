import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  perms: [] as string[],
  fetchAdminOrganizations: vi.fn(),
  fetchAdminOrgUpdateRequests: vi.fn(),
  deactivateAdminOrganization: vi.fn(),
  reviewOrgUpdateRequest: vi.fn(),
  fetchAdminOrganizationDetail: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('../lib/auth', () => ({
  getUser: () => ({ id: 'admin-1', role: 'ADMIN', perms: mocks.perms }),
}));

vi.mock('../lib/api', () => ({
  fetchAdminOrganizations: mocks.fetchAdminOrganizations,
  fetchAdminOrgUpdateRequests: mocks.fetchAdminOrgUpdateRequests,
  deactivateAdminOrganization: mocks.deactivateAdminOrganization,
  reviewOrgUpdateRequest: mocks.reviewOrgUpdateRequest,
  fetchAdminOrganizationDetail: mocks.fetchAdminOrganizationDetail,
}));

vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button onClick={onClick} {...props}>{children}</button>,
  Modal: ({ open, title, footer, children }: { open: boolean; title: string; footer?: React.ReactNode; children: React.ReactNode }) => (
    open ? <div role="dialog"><h2>{title}</h2>{children}{footer}</div> : null
  ),
  StatusPill: ({ children, status }: { children?: React.ReactNode; status?: string }) => <span>{children ?? status}</span>,
  colors: { err: '#b00', errBg: '#fee', okBg: '#efe', ok: '#080', brand: { DEFAULT: '#123', 700: '#123' }, muted: '#666' },
  typeScale: { body: { fontSize: 14 } },
  radii: { sm: 4 },
  shadows: {},
  transitions: {},
}));

import OrganizationsPage from '../app/organizations/page';

const READ = 'admin:users:read';
const WRITE = 'admin:users:write';

beforeEach(() => {
  mocks.perms = [READ, WRITE];
  mocks.fetchAdminOrganizations.mockReset().mockResolvedValue([
    { id: 'org-1', name: 'Example Org', type: 'MERCHANT', isActive: true },
  ]);
  mocks.fetchAdminOrgUpdateRequests.mockReset().mockResolvedValue([
    {
      id: 'request-1',
      orgId: 'org-1',
      orgName: 'Example Org',
      status: 'PENDING',
      createdAt: '2026-11-22T10:00:00.000Z',
      payload: { name: 'Example Org Updated' },
      decisionNotes: null,
      decidedAt: null,
    },
  ]);
  mocks.deactivateAdminOrganization.mockReset().mockResolvedValue({});
  mocks.reviewOrgUpdateRequest.mockReset().mockResolvedValue({
    id: 'request-1',
    orgId: 'org-1',
    orgName: 'Example Org',
    status: 'APPROVED',
    createdAt: '2026-11-22T10:00:00.000Z',
    payload: { name: 'Example Org Updated' },
    decisionNotes: null,
    decidedAt: '2026-11-23T10:00:00.000Z',
  });
  mocks.fetchAdminOrganizationDetail.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Organization management action permission rechecks', () => {
  it('rechecks admin:users:write before confirming organization deactivation', async () => {
    const { rerender } = render(<OrganizationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Example Org' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    mocks.perms = [READ];
    rerender(<OrganizationsPage />);
    fireEvent.click(screen.getByRole('button', { name: /^Deactivate$/ }));

    await waitFor(() => expect(mocks.deactivateAdminOrganization).not.toHaveBeenCalled());
  });

  it('rechecks admin:users:write before confirming an organization update request', async () => {
    const { rerender } = render(<OrganizationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve update request for Example Org' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    mocks.perms = [READ];
    rerender(<OrganizationsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Apply' }));

    await waitFor(() => expect(mocks.reviewOrgUpdateRequest).not.toHaveBeenCalled());
  });
});
