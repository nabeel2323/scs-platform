import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { adminRequest } = vi.hoisted(() => ({ adminRequest: vi.fn() }));

vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  colors: {}, radii: {}, typeScale: {},
}));

import CommissionPage from '../app/commission/page';

describe('admin commission reversal read recovery', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not show an empty reversal state after a failed read and retries', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Commission service unavailable'))
      .mockResolvedValueOnce([]);

    render(<CommissionPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Commission service unavailable');
    expect(screen.queryByText('No commission reversals found.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry commission reversals' }));
    expect(await screen.findByText('No commission reversals found.')).toBeTruthy();
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });
});
