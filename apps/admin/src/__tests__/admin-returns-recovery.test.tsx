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
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../../components/detail', () => ({
  AdminErrorState: ({
    title,
    message,
    onRetry,
  }: {
    title: string;
    message: string;
    onRetry: () => void;
  }) => <div role="alert"><strong>{title}</strong><span>{message}</span><button onClick={onRetry}>Retry returns</button></div>,
}));

import AdminReturnsPage from '../app/returns/page';

const returnRow = (id: string, status: string, reason: string) => ({
  id,
  subOrderId: 'suborder-12345678',
  buyerId: 'buyer-1',
  status,
  reason,
  requestedRefundMinor: 12500,
  actualRefundMinor: null,
  createdAt: '2026-11-22T10:00:00.000Z',
  escalatedAt: null,
  escalationDeadline: null,
  responsibilityCategory: null,
});

describe('admin returns read recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    adminRequest.mockReset().mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('retries an initial failure without showing a false empty state', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Returns service unavailable'))
      .mockResolvedValueOnce([]);

    render(<AdminReturnsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Returns service unavailable');
    expect(screen.queryByText('No return requests found.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry returns' }));
    expect(await screen.findByText('No return requests found.')).toBeTruthy();
  });

  it('keeps the last successful rows visible when a same-filter refresh fails', async () => {
    adminRequest
      .mockResolvedValueOnce([returnRow('return-1', 'REQUESTED', 'Damaged item')])
      .mockRejectedValueOnce(new Error('Returns refresh failed'));

    render(<AdminReturnsPage />);

    expect(await screen.findByText('Damaged item')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Returns refresh failed');
    expect(screen.getByText('Damaged item')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('last successfully loaded results');
  });

  it('does not show rows from the previous status filter after the new filter fails', async () => {
    adminRequest
      .mockResolvedValueOnce([returnRow('return-1', 'REQUESTED', 'Old filter row')])
      .mockRejectedValueOnce(new Error('Filtered returns unavailable'));

    render(<AdminReturnsPage />);

    expect(await screen.findByText('Old filter row')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REFUNDED' } });

    expect((await screen.findByRole('alert')).textContent).toContain('Filtered returns unavailable');
    expect(screen.queryByText('Old filter row')).toBeNull();
    expect(screen.queryByText('No return requests found.')).toBeNull();
  });
});
