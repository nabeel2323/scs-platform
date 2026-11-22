import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { adminRequest, hasAccess } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
}));

import ReconciliationPage from '../app/reconciliation/page';

const discrepancy = {
  id: 'discrepancy-1',
  discrepancyType: 'MISSING_REFUND',
  sourceRef: 'refund-source-1',
  expectedMinor: 10000,
  actualMinor: 0,
  deltaMinor: -10000,
  description: 'Refund source is missing',
  resolved: false,
  resolvedAt: null,
  resolvedBy: null,
  resolutionNotes: null,
};
const run = {
  id: 'reconciliation-run-1',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  currency: 'SAR',
  version: 1,
  status: 'COMPLETED',
  summary: {},
  discrepancyCount: 1,
  executedBy: 'admin-1',
  createdAt: '2026-11-22T10:00:00.000Z',
  completedAt: '2026-11-22T10:05:00.000Z',
  discrepancies: [discrepancy],
};

describe('admin reconciliation detail recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    adminRequest.mockReset();
    adminRequest.mockResolvedValue([run]);
  });

  afterEach(() => cleanup());

  it('keeps the last successful run details visible when a detail refresh fails', async () => {
    adminRequest
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce(run)
      .mockRejectedValueOnce(new Error('Reconciliation detail service unavailable'));

    render(<ReconciliationPage />);

    fireEvent.click(await screen.findByText('2026-11-01 to 2026-11-30'));
    expect(await screen.findByText('Refund source is missing')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh run details' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Reconciliation detail service unavailable',
    );
    expect(screen.getByText('Refund source is missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
