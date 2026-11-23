import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { fetchAdminCatalogRequests, approveCatalogRequest, rejectCatalogRequest, hasAccess } = vi.hoisted(() => ({
  fetchAdminCatalogRequests: vi.fn(),
  approveCatalogRequest: vi.fn(),
  rejectCatalogRequest: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAdminCatalogRequests: (...args: unknown[]) => fetchAdminCatalogRequests(...args),
  approveCatalogRequest: (...args: unknown[]) => approveCatalogRequest(...args),
  rejectCatalogRequest: (...args: unknown[]) => rejectCatalogRequest(...args),
}));
vi.mock('../lib/auth', () => ({ getUser: () => ({ id: 'reviewer-1' }) }));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: hasAccess(), missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));

import RequestsPage from '../app/requests/page';

const request = (id: string, type: 'CATEGORY' | 'BRAND', name: string) => ({
  id,
  type,
  payload: { name },
  storeId: 'store-12345678',
  status: 'PENDING',
  createdAt: '2026-11-22T10:00:00.000Z',
  reviewedAt: null,
  reviewReason: null,
});

describe('admin catalog requests read recovery', () => {
  beforeEach(() => {
    hasAccess.mockReset().mockReturnValue(true);
    fetchAdminCatalogRequests.mockReset().mockResolvedValue([]);
    approveCatalogRequest.mockReset().mockResolvedValue({});
    rejectCatalogRequest.mockReset().mockResolvedValue({});
  });

  afterEach(() => cleanup());

  it('offers retry and does not render an empty state after an initial read failure', async () => {
    fetchAdminCatalogRequests
      .mockRejectedValueOnce(new Error('Catalog request service unavailable'))
      .mockResolvedValueOnce([]);

    render(<RequestsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Catalog request service unavailable',
    );
    expect(screen.queryByText('No requests found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry requests' }));
    expect(await screen.findByText('No requests found')).toBeTruthy();
    expect(fetchAdminCatalogRequests).toHaveBeenCalledTimes(2);
  });

  it('ignores a slower response from the previously selected filter', async () => {
    let resolveInitial!: (value: ReturnType<typeof request>[]) => void;
    fetchAdminCatalogRequests
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockResolvedValueOnce([request('new-category', 'CATEGORY', 'New Category')]);

    render(<RequestsPage />);

    await waitFor(() => expect(fetchAdminCatalogRequests).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CATEGORY' } });

    expect(await screen.findByText('New Category')).toBeTruthy();
    resolveInitial([request('old-brand', 'BRAND', 'Old Brand')]);

    await waitFor(() => expect(screen.queryByText('Old Brand')).toBeNull());
    expect(screen.getByText('New Category')).toBeTruthy();
  });


  it('approves a pending request once and refreshes the list', async () => {
    fetchAdminCatalogRequests.mockResolvedValueOnce([request('request-approve', 'CATEGORY', 'Office Supplies')]);
    render(<RequestsPage />);

    expect(await screen.findByText('Office Supplies')).toBeTruthy();
    const approve = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => expect(approveCatalogRequest).toHaveBeenCalledTimes(1));
    expect(approveCatalogRequest).toHaveBeenCalledWith('request-approve', 'reviewer-1');
    expect(await screen.findByText('No requests found')).toBeTruthy();
  });

  it('rejects a pending request with a reason and sends the reviewer identity', async () => {
    fetchAdminCatalogRequests.mockResolvedValueOnce([request('request-reject', 'BRAND', 'Example Brand')]);
    render(<RequestsPage />);

    expect(await screen.findByText('Example Brand')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection…'), {
      target: { value: 'Insufficient evidence' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Request' }));

    await waitFor(() => expect(rejectCatalogRequest).toHaveBeenCalledWith(
      'request-reject',
      'reviewer-1',
      'Insufficient evidence',
    ));
    expect(await screen.findByText('No requests found')).toBeTruthy();
  });

  it('does not request catalog data when the user lacks the management permission', () => {
    hasAccess.mockReturnValue(false);

    render(<RequestsPage />);

    expect(screen.getByText('Access denied')).toBeTruthy();
    expect(fetchAdminCatalogRequests).not.toHaveBeenCalled();
  });
});
