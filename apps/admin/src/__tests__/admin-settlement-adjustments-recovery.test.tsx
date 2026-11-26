import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { adminRequest, hasAccess } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: (permissions: string[]) => ({
    hasAccess: hasAccess(permissions[0]),
    missingPerms: [],
  }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
}));

import SettlementAdjustmentsPage from '../app/settlement-adjustments/page';

const adjustment = (id: string, status: string, reason: string) => ({
  id,
  subOrderId: 'suborder-123456',
  returnRequestId: null,
  adjustmentType: 'REFUND',
  amountMinor: 12500,
  currency: 'SAR',
  fxStatus: 'NOT_REQUIRED',
  fxEvidence: null,
  status,
  reason,
  requiresDualApproval: false,
  approvalHash: 'hash-1',
  createdBy: 'admin-1',
  notes: null,
  createdAt: '2026-11-22T10:00:00.000Z',
  approvals: [],
});

describe('admin settlement adjustments read recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    adminRequest.mockReset().mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('retries an initial failure without showing a false empty state', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Adjustment service unavailable'))
      .mockResolvedValueOnce([]);

    render(<SettlementAdjustmentsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Adjustment service unavailable',
    );
    expect(screen.queryByText('No settlement adjustments found.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry adjustments' }));
    expect(await screen.findByText('No settlement adjustments found.')).toBeTruthy();
  });

  it('allows approvers to reject a pending adjustment with a required reason', async () => {
    adminRequest
      .mockResolvedValueOnce([adjustment('adjustment-2', 'PENDING_APPROVAL', 'Return adjustment')])
      .mockResolvedValueOnce([]);
    render(<SettlementAdjustmentsPage />);

    expect(await screen.findByText('Return adjustment')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Rejection reason'), {
      target: { value: 'Insufficient supporting evidence' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    expect(await screen.findByText('No settlement adjustments found.')).toBeTruthy();
    expect(adminRequest).toHaveBeenNthCalledWith(
      2,
      'admin/settlement-adjustments/adjustment-2/reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Insufficient supporting evidence' }),
      }),
    );
  });

  it('does not expose rejection to read-only adjustment users', async () => {
    hasAccess.mockImplementation(
      (permission: string) => permission !== 'admin:adjustments:approve',
    );
    adminRequest.mockResolvedValueOnce([
      adjustment('adjustment-3', 'PENDING_APPROVAL', 'Return adjustment'),
    ]);
    render(<SettlementAdjustmentsPage />);

    expect(await screen.findByText('Return adjustment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('preserves the last successful rows after a failed same-filter refresh', async () => {
    adminRequest
      .mockResolvedValueOnce([adjustment('adjustment-1', 'DRAFT', 'Return adjustment')])
      .mockRejectedValueOnce(new Error('Adjustment refresh failed'));

    render(<SettlementAdjustmentsPage />);

    expect(await screen.findByText('Return adjustment')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Adjustment refresh failed');
    expect(screen.getByText('Return adjustment')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('last successfully loaded results');
  });
});
