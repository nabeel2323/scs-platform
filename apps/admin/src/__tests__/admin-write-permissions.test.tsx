import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  perms: [] as string[],
  adminRequest: vi.fn(),
  params: { id: 'return-1' },
  search: 'resolve=1',
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('../lib/auth', () => ({
  getUser: () => ({ id: 'admin-1', role: 'ADMIN', perms: mocks.perms }),
}));

vi.mock('../lib/api', () => ({
  adminRequest: mocks.adminRequest,
}));

vi.mock('@scs/ui-kit', () => ({
  radii: { sm: 4, md: 8, lg: 12 },
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import CalendarAdminPage from '../app/calendar/page';
import ReturnDetailPage from '../app/returns/[id]/page';

const READ = 'admin:returns:read';
const WRITE = 'admin:returns:write';

const calendarFixture = {
  id: 'calendar-1',
  name: 'Default calendar',
  timezone: 'UTC',
  startTime: '09:00:00',
  endTime: '17:00:00',
  workingDays: [1, 2, 3, 4, 5],
  isDefault: true,
  enabled: true,
};

const holidayFixture = {
  id: 'holiday-1',
  calendarId: 'calendar-1',
  holidayDate: '2026-12-25',
  description: 'Christmas',
};

const returnFixture = {
  id: 'return-1',
  subOrderId: 'sub-order-1',
  buyerId: 'buyer-1',
  status: 'ESCALATED',
  reason: 'Damaged item',
  requestedRefundMinor: 12500,
  actualRefundMinor: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  escalatedAt: '2026-11-21T10:00:00.000Z',
  escalationDeadline: null,
  responsibilityCategory: null,
  resolvedBy: null,
  resolvedAt: null,
};

beforeEach(() => {
  mocks.perms = [];
  mocks.params = { id: 'return-1' };
  mocks.search = 'resolve=1';
  mocks.adminRequest.mockReset();
  mocks.adminRequest.mockImplementation(async (path: string) => {
    if (path === 'admin/business-calendars') return [calendarFixture];
    if (path === 'admin/business-calendars/calendar-1/holidays') return [holidayFixture];
    if (path === 'admin/business-calendars/calendar-1/audit') return [];
    if (path === 'admin/returns/return-1') return returnFixture;
    return {};
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Business calendar write permissions', () => {
  it('keeps holiday management controls hidden for read-only users', async () => {
    mocks.perms = [READ];
    render(<CalendarAdminPage />);

    expect(await screen.findByText('2026-12-25')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.getByText(/admin:returns:write/)).toBeTruthy();
  });

  it('allows holiday removal only when the write permission is present', async () => {
    mocks.perms = [READ, WRITE];
    render(<CalendarAdminPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(mocks.adminRequest).toHaveBeenCalledWith(
        'admin/business-calendars/calendar-1/holidays/2026-12-25',
        { method: 'DELETE' },
      );
    });
  });
});

describe('Escalated return resolution permissions', () => {
  it('does not expose the resolution form or action link to read-only users', async () => {
    mocks.perms = [READ];
    render(<ReturnDetailPage />);

    expect(await screen.findByText(/requires the admin:returns:write permission/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Resolve Escalated Return' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm APPROVE' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Resolve This Return' })).toBeNull();
  });

  it('allows resolution only when the write permission is present', async () => {
    mocks.perms = [READ, WRITE];
    render(<ReturnDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm APPROVE' }));
    await waitFor(() => {
      expect(mocks.adminRequest).toHaveBeenCalledWith(
        'admin/returns/return-1/resolve',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
