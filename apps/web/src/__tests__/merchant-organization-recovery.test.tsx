import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api } = vi.hoisted(() => ({
  api: {
    fetchProfile: vi.fn(),
    fetchOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    fetchOrgMembers: vi.fn(),
    addOrgMember: vi.fn(),
    removeOrgMember: vi.fn(),
    lookupOrgMember: vi.fn(),
    fetchRoles: vi.fn(),
    fetchOrgDocuments: vi.fn(),
    presignDocumentDownload: vi.fn(),
    presignDocumentUpload: vi.fn(),
    registerDocument: vi.fn(),
    fetchOrgVerifications: vi.fn(),
    submitOrgUpdateRequest: vi.fn(),
    fetchOrgUpdateRequests: vi.fn(),
    fetchMyStores: vi.fn(),
    fetchStore: vi.fn(),
    updateStore: vi.fn(),
    fetchWarehouses: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/auth', () => ({ hasPerm: () => false }));
vi.mock('../lib/api', () => Object.fromEntries(
  Object.entries(api).map(([key, fn]) => [key, (...args: unknown[]) => fn(...args)]),
));
vi.mock('@scs/contracts', () => ({
  DOCUMENT_STATUS_LABELS: {},
  UPDATE_REQUEST_STATUS_LABELS: {},
}));
vi.mock('../components/Shared', () => ({
  LoadingSpinner: () => <div>Loading</div>,
  EmptyState: ({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) => (
    <section><h2>{title}</h2>{description ? <p>{description}</p> : null}{action}</section>
  ),
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert"><span>{message}</span>{onRetry ? <button onClick={onRetry}>Retry</button> : null}</div>
  ),
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  formatDate: (value: string) => value,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header>
  ),
}));

import MerchantOrganizationPage from '../app/merchant/organization/page';

const organization = {
  id: 'org-1',
  type: 'RETAILER',
  name: 'Example Organization',
  legalName: null,
  taxId: null,
  country: 'SA',
  verificationStatus: 'PENDING',
  inviteCode: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('merchant organization auxiliary read recovery', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchProfile.mockResolvedValue({
      activeOrgId: organization.id,
      organizations: [{ ...organization, membershipStatus: 'ACTIVE' }],
    });
    api.fetchOrgMembers.mockResolvedValue([]);
    api.fetchOrgDocuments.mockResolvedValue([]);
    api.fetchOrgVerifications.mockResolvedValue([]);
    api.fetchOrgUpdateRequests.mockResolvedValue([]);
    api.fetchMyStores.mockResolvedValue([]);
    api.fetchRoles.mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('surfaces a failed verification-history read and recovers through Retry', async () => {
    api.fetchOrgVerifications
      .mockRejectedValueOnce(new Error('Verification history unavailable'))
      .mockResolvedValueOnce([]);

    render(<MerchantOrganizationPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Verification history unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Example Organization')).toBeTruthy();
    expect(api.fetchOrgVerifications).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Verification history unavailable')).toBeNull();
  });

  it('does not silently treat a failed update-request read as an empty history', async () => {
    api.fetchOrgUpdateRequests.mockRejectedValueOnce(new Error('Update requests unavailable'));

    render(<MerchantOrganizationPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Update requests unavailable',
    );
    expect(screen.queryByText('Update Requests')).toBeTruthy();
    expect(screen.queryByText('No update requests')).toBeNull();
  });

  it('does not silently treat a failed store-directory read as missing store data', async () => {
    api.fetchMyStores.mockRejectedValueOnce(new Error('Store directory unavailable'));

    render(<MerchantOrganizationPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Store directory unavailable',
    );
  });
});
