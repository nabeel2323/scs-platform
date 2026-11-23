import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAdminSettlements, markSettlementPaid, hasAccess } = vi.hoisted(() => ({
  fetchAdminSettlements: vi.fn(),
  markSettlementPaid: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAdminSettlements: (...args: unknown[]) => fetchAdminSettlements(...args),
  markSettlementPaid: (...args: unknown[]) => markSettlementPaid(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  colors: { border: '#ddd', borderLight: '#eee', muted: '#888' },
  typeScale: { label: {} },
  radii: { sm: 4 },
}));

import AdminSettlementsPage from '../app/settlements/page';

const settlement = {
  id: 'settlement-1',
  subOrderId: 'suborder-123456',
  merchantStoreId: 'store-123456',
  paymentRecordId: 'payment-1',
  grossMinor: 10000,
  refundMinor: 0,
  commissionMinor: 500,
  feeMinor: 0,
  netMinor: 9500,
  currency: 'SAR',
  status: 'DUE',
  createdAt: '2026-11-22T10:00:00.000Z',
};

describe('admin settlements read recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    fetchAdminSettlements.mockReset().mockResolvedValue([]);
    markSettlementPaid.mockReset().mockResolvedValue(settlement);
  });

  afterEach(() => cleanup());

  it('retries an initial failure without presenting a false empty state', async () => {
    fetchAdminSettlements.mockRejectedValueOnce(new Error('Settlement service unavailable')).mockResolvedValueOnce([]);

    render(<AdminSettlementsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Settlement service unavailable');
    expect(screen.queryByText('No settlements found.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry settlements' }));
    expect(await screen.findByText('No settlements found.')).toBeTruthy();
  });

  it('shows adjustment settlements and allows their payout', async () => {
    const adjustment = {
      ...settlement,
      id: 'settlement-adjustment-1',
      status: 'ADJUSTMENT',
      grossMinor: 0,
      netMinor: 125,
    };
    fetchAdminSettlements.mockResolvedValueOnce([adjustment]).mockResolvedValueOnce([]);
    markSettlementPaid.mockResolvedValueOnce({ ...adjustment, status: 'PAID' });

    render(<AdminSettlementsPage />);

    expect(await screen.findByText('suborder')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Adjustment' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' }));

    expect(await screen.findByText('No settlements found.')).toBeTruthy();
    expect(markSettlementPaid).toHaveBeenCalledWith('settlement-adjustment-1');
  });

  it('labels paid adjustment rows separately from primary paid settlements', async () => {
    const paidAdjustment = {
      ...settlement,
      id: 'settlement-adjustment-paid',
      status: 'PAID',
      metadata: { adjustmentId: 'adjustment-1' },
      grossMinor: 0,
      netMinor: 125,
    };
    fetchAdminSettlements.mockResolvedValueOnce([paidAdjustment]);

    render(<AdminSettlementsPage />);

    expect(await screen.findByText('ADJUSTMENT · PAID')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark Paid' })).toBeNull();
  });

  it('preserves the last successful rows after a failed same-filter refresh', async () => {
    fetchAdminSettlements.mockResolvedValueOnce([settlement]).mockRejectedValueOnce(new Error('Settlement refresh failed'));

    render(<AdminSettlementsPage />);

    expect(await screen.findByText('suborder')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Settlement refresh failed');
    expect(screen.getByText('suborder')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('last successfully loaded results');
  });
});
