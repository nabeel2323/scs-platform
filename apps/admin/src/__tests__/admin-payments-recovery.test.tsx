import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const {
  perms,
  fetchAdminPayments,
  fetchPaymentVerificationQueue,
  verifyPayment,
  fetchStalePayments,
  fetchRequestedRefunds,
  approveRefund,
} = vi.hoisted(() => ({
  perms: [] as string[],
  fetchAdminPayments: vi.fn(),
  fetchPaymentVerificationQueue: vi.fn(),
  verifyPayment: vi.fn(),
  fetchStalePayments: vi.fn(),
  fetchRequestedRefunds: vi.fn(),
  approveRefund: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAdminPayments: (...args: unknown[]) => fetchAdminPayments(...args),
  fetchPaymentVerificationQueue: (...args: unknown[]) => fetchPaymentVerificationQueue(...args),
  verifyPayment: (...args: unknown[]) => verifyPayment(...args),
  fetchStalePayments: (...args: unknown[]) => fetchStalePayments(...args),
  fetchRequestedRefunds: (...args: unknown[]) => fetchRequestedRefunds(...args),
  approveRefund: (...args: unknown[]) => approveRefund(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: (required: string[]) => {
    const missingPerms = required.filter((permission) => !perms.includes(permission));
    return { hasAccess: missingPerms.length === 0, missingPerms };
  },
  AccessDenied: ({ missingPerms }: { missingPerms: string[] }) => (
    <div>Access denied: {missingPerms.join(', ')}</div>
  ),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  colors: {
    border: '#ddd',
    borderLight: '#eee',
    muted: '#888',
    bgSubtle: '#fafafa',
    brand: { 700: '#333' },
  },
  radii: { sm: 4 },
}));

import AdminPaymentsPage from '../app/payments/page';

const payment = {
  id: 'payment-1',
  orderId: 'order-12345678',
  paymentMethod: 'BANK_TRANSFER',
  status: 'AWAITING_VERIFICATION',
  amountMinor: 12500,
  currency: 'SAR',
  confirmedAmountMinor: null,
  receiptUrl: null,
  receiptReference: 'REF-001',
  expiresAt: null,
  createdAt: '2026-11-22T10:00:00.000Z',
};

describe('admin payments read recovery', () => {
  beforeEach(() => {
    perms.splice(
      0,
      perms.length,
      'admin:payments:read',
      'admin:payments:verify',
      'admin:refunds:approve',
    );
    fetchAdminPayments.mockReset().mockResolvedValue([]);
    fetchPaymentVerificationQueue.mockReset().mockResolvedValue([payment]);
    verifyPayment.mockReset().mockResolvedValue(payment);
    fetchStalePayments.mockReset().mockResolvedValue([]);
    fetchRequestedRefunds.mockReset().mockResolvedValue([]);
    approveRefund.mockReset().mockResolvedValue({});
  });

  afterEach(() => cleanup());

  it('preserves the last successful payment rows when a refresh fails', async () => {
    fetchPaymentVerificationQueue
      .mockResolvedValueOnce([payment])
      .mockRejectedValueOnce(new Error('Payment service temporarily unavailable'));

    render(<AdminPaymentsPage />);

    expect(await screen.findByText('REF-001')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry payments' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Payment service temporarily unavailable',
    );
    expect(screen.getByText('REF-001')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Showing the last successfully loaded results.',
    );
    expect(screen.queryByText('No payments found in this view.')).toBeNull();
  });

  it('allows a verification-only user to access the payment queue without payments read permission', async () => {
    perms.splice(0, perms.length, 'admin:payments:verify');

    render(<AdminPaymentsPage />);

    expect(await screen.findByText('REF-001')).toBeTruthy();
    expect(screen.queryByText(/Access denied/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Verification Queue' })).toBeTruthy();
  });

  it('does not render a false empty state after an initial read failure', async () => {
    fetchPaymentVerificationQueue
      .mockRejectedValueOnce(new Error('Payment service unavailable'))
      .mockResolvedValueOnce([]);

    render(<AdminPaymentsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Payment service unavailable');
    expect(screen.queryByText('No payments found in this view.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry payments' }));
    expect(await screen.findByText('No payments found in this view.')).toBeTruthy();
  });
});
