import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { fetchAnalyticsEvents, fetchAnalyticsActivity } = vi.hoisted(() => ({
  fetchAnalyticsEvents: vi.fn(),
  fetchAnalyticsActivity: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAnalyticsEvents: (...args: unknown[]) => fetchAnalyticsEvents(...args),
  fetchAnalyticsActivity: (...args: unknown[]) => fetchAnalyticsActivity(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({ useRequirePerms: () => ({ hasAccess: true }) }));
vi.mock('../components/detail', () => ({
  AdminDetailSection: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  AdminLoadingSkeleton: () => <div role="status">Loading analytics</div>,
  formatDate: () => 'Today',
}));

import AnalyticsPage from '../app/analytics/page';

const oldEvent = { eventType: 'old-event', count: 2 };
const newEvent = { eventType: 'new-event', count: 5 };

describe('admin analytics request ordering and recovery', () => {
  beforeEach(() => {
    fetchAnalyticsEvents.mockReset();
    fetchAnalyticsActivity.mockReset();
    fetchAnalyticsEvents.mockResolvedValue([newEvent]);
    fetchAnalyticsActivity.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('ignores an older date-range response after a newer range has loaded', async () => {
    let resolveFirst!: (value: Array<typeof oldEvent>) => void;
    const first = new Promise<Array<typeof oldEvent>>(resolve => { resolveFirst = resolve; });
    fetchAnalyticsEvents.mockImplementationOnce(() => first).mockResolvedValueOnce([newEvent]);

    const { container } = render(<AnalyticsPage />);
    await waitFor(() => expect(fetchAnalyticsEvents).toHaveBeenCalledTimes(1));
    const fromInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2026-10-01' } });

    await waitFor(() => expect(fetchAnalyticsEvents).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('new-event')).toBeTruthy();

    await act(async () => { resolveFirst([oldEvent]); });
    expect(screen.queryByText('old-event')).toBeNull();
    expect(screen.getByText('new-event')).toBeTruthy();
  });

  it('exposes a retry action after the event-count read fails', async () => {
    fetchAnalyticsEvents
      .mockRejectedValueOnce(new Error('Analytics events unavailable'))
      .mockResolvedValueOnce([newEvent]);

    render(<AnalyticsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Analytics events unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }));
    expect(await screen.findByText('new-event')).toBeTruthy();
  });
});
