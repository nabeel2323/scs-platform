import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  perms: [] as string[],
  orgIsActive: true,
  fetchVerificationRequest: vi.fn(),
  fetchStore: vi.fn(),
  fetchStoreDocuments: vi.fn(),
  deactivateAdminOrganization: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'request-1' }),
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
  fetchVerificationRequest: mocks.fetchVerificationRequest,
  fetchStore: mocks.fetchStore,
  fetchStoreDocuments: mocks.fetchStoreDocuments,
  deactivateAdminOrganization: mocks.deactivateAdminOrganization,
  reviewVerification: vi.fn(),
  presignDocumentDownload: vi.fn(),
}));

vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick} {...props}>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Modal: ({ open, title, footer, children }: { open: boolean; title: string; footer?: React.ReactNode; children: React.ReactNode }) => (
    open ? <div role="dialog"><h2>{title}</h2>{children}{footer}</div> : null
  ),
  BreadcrumbDark: () => null,
  colors: { err: '#b00', errBg: '#fee', okBg: '#efe', ok: '#080', brand: { DEFAULT: '#123', 700: '#123' }, muted: '#666' },
  typeScale: { body: {} },
  radii: { sm: 4 },
  shadows: {},
  transitions: {},
}));

import VerificationReviewPage from '../app/verification/[id]/page';

const REVIEW = 'merchant:verification:review';
const ORG_WRITE = 'admin:users:write';

beforeEach(() => {
  mocks.perms = [REVIEW, ORG_WRITE];
  mocks.orgIsActive = true;
  mocks.fetchVerificationRequest.mockReset().mockImplementation(async () => ({
    id: 'request-1',
    storeId: 'store-1',
    status: 'SUBMITTED',
    org: { id: 'org-1', name: 'Example Org', isActive: mocks.orgIsActive },
    decisionNotes: null,
    resolvedAt: null,
  }));
  mocks.fetchStore.mockReset().mockResolvedValue({
    id: 'store-1',
    orgId: 'org-1',
    displayName: 'Example Store',
    slug: 'example-store',
    status: 'ACTIVE',
    verificationStatus: 'PENDING',
    currency: 'SAR',
    locale: 'en',
    timezone: 'UTC',
    createdAt: '2026-11-01T00:00:00.000Z',
    address: null,
    description: null,
  });
  mocks.fetchStoreDocuments.mockReset().mockResolvedValue([]);
  mocks.deactivateAdminOrganization.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Verification organization status action permissions', () => {
  it('rechecks admin:users:write before deactivating after permission loss', async () => {
    const { rerender } = render(<VerificationReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Merchant' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    mocks.perms = [REVIEW];
    rerender(<VerificationReviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate', exact: true }));
    await waitFor(() => expect(mocks.deactivateAdminOrganization).not.toHaveBeenCalled());
  });

  it('rechecks admin:users:write before reactivating after permission loss', async () => {
    mocks.orgIsActive = false;
    const { rerender } = render(<VerificationReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reactivate Merchant' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    mocks.perms = [REVIEW];
    rerender(<VerificationReviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate', exact: true }));
    await waitFor(() => expect(mocks.deactivateAdminOrganization).not.toHaveBeenCalled());
  });
});
