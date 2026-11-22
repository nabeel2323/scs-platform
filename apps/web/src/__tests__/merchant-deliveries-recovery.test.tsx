import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { api, router, auth } = vi.hoisted(() => ({
  api: { listShipments: vi.fn() },
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
  auth: {
    user: { id: 'merchant-1', role: 'MERCHANT_OWNER', perms: ['fulfillment:shipments:read'] },
    loading: false,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => auth,
}));
vi.mock('../lib/auth', () => ({
  isMerchantRole: (role: string) => role.startsWith('MERCHANT'),
}));
vi.mock('../lib/shipops', () => ({
  listShipments: (...args: unknown[]) => api.listShipments(...args),
  exceptionLabel: () => 'Exception',
}));
vi.mock('../components/Shared', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  LoadingSpinner: () => <div>Loading</div>,
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <section><h2>{title}</h2>{description ? <p>{description}</p> : null}</section>
  ),
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert">
      <span>{message}</span>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
  formatDate: (value: string) => value,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string; breadcrumbs?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
  Breadcrumb: () => <nav>Breadcrumb</nav>,
}));

import MerchantDeliveriesPage from '../app/merchant/deliveries/page';

describe('merchant deliveries read recovery', () => {
  beforeEach(() => {
    api.listShipments.mockReset();
    api.listShipments.mockResolvedValue({ data: [], total: 0 });
  });
  afterEach(() => cleanup());

  it('does not show an empty delivery queue after a failed read and supports retry', async () => {
    api.listShipments
      .mockRejectedValueOnce(new Error('Delivery service unavailable'))
      .mockResolvedValueOnce({ data: [], total: 0 });

    render(<MerchantDeliveriesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Delivery service unavailable',
    );
    expect(screen.queryByText('No deliveries yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No deliveries yet')).toBeTruthy();
    expect(api.listShipments).toHaveBeenCalledTimes(2);
  });
});
