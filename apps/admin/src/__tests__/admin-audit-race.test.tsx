import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { fetchAuditLogs } = vi.hoisted(() => ({ fetchAuditLogs: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({ fetchAuditLogs: (...args: unknown[]) => fetchAuditLogs(...args) }));
vi.mock('../hooks/useRequirePerms', () => ({ useRequirePerms: () => ({ hasAccess: true }) }));
vi.mock('../components/detail', () => ({
  AdminLoadingSkeleton: () => <div role="status">Loading audit</div>,
  formatDate: () => 'Today',
}));

import AuditPage from '../app/audit/page';

const oldLog = {
  id: 'old-log', action: 'UPDATE', resource: 'old-record', resourceId: 'old-resource-id',
  actorId: 'actor-old', actorType: 'ADMIN', metadata: {}, createdAt: '2026-01-01T00:00:00.000Z',
};
const newLog = {
  id: 'new-log', action: 'CREATE', resource: 'new-record', resourceId: 'new-resource-id',
  actorId: 'actor-new', actorType: 'ADMIN', metadata: {}, createdAt: '2026-01-02T00:00:00.000Z',
};

describe('admin audit log query ordering', () => {
  beforeEach(() => {
    fetchAuditLogs.mockReset();
    fetchAuditLogs.mockResolvedValue({ data: [newLog], total: 1 });
  });
  afterEach(() => cleanup());

  it('ignores an older filter response that arrives after the newer result', async () => {
    let resolveFirst!: (value: { data: Array<typeof oldLog>; total: number }) => void;
    const first = new Promise<{ data: typeof oldLog[]; total: number }>(resolve => { resolveFirst = resolve; });
    fetchAuditLogs.mockImplementationOnce(() => first).mockResolvedValueOnce({ data: [newLog], total: 1 });

    render(<AuditPage />);
    await waitFor(() => expect(fetchAuditLogs).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'CREATE' } });
    await waitFor(() => expect(fetchAuditLogs).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('new-record')).toBeTruthy();

    await act(async () => {
      resolveFirst({ data: [oldLog], total: 1 });
    });

    expect(screen.queryByText('old-record')).toBeNull();
    expect(screen.getByText('new-record')).toBeTruthy();
  });

  it('shows a retry action after an audit log read fails', async () => {
    fetchAuditLogs
      .mockRejectedValueOnce(new Error('Audit service unavailable'))
      .mockResolvedValueOnce({ data: [newLog], total: 1 });

    render(<AuditPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Audit service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry audit log' }));
    expect(await screen.findByText('new-record')).toBeTruthy();
  });
});
