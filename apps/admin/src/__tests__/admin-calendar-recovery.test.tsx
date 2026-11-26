import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { adminRequest } = vi.hoisted(() => ({ adminRequest: vi.fn() }));

vi.mock('../lib/api', () => ({ adminRequest: (...args: unknown[]) => adminRequest(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  radii: { md: 8, lg: 12 },
}));

import CalendarPage from '../app/calendar/page';

describe('admin business calendar read recovery', () => {
  beforeEach(() => {
    adminRequest.mockReset();
    adminRequest.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not report no calendar configured after a failed read and retries', async () => {
    adminRequest
      .mockRejectedValueOnce(new Error('Calendar service unavailable'))
      .mockResolvedValueOnce([]);

    render(<CalendarPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Calendar service unavailable',
    );
    expect(
      screen.queryByText('No business calendar configured. Contact system administrator.'),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry calendar' }));
    expect(
      await screen.findByText('No business calendar configured. Contact system administrator.'),
    ).toBeTruthy();
    expect(adminRequest).toHaveBeenCalledTimes(2);
  });
});
