import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  fetchFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  fetchSavedSuppliers: vi.fn(),
  removeSavedSupplier: vi.fn(),
  getSessions: vi.fn(),
  revokeSessionsByDevice: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'buyer-1', role: 'RETAILER', perms: [] }, loading: false }),
}));
vi.mock('../lib/buyer-api', () => ({
  fetchNotifications: (...args: unknown[]) => api.fetchNotifications(...args),
  markNotificationRead: (...args: unknown[]) => api.markNotificationRead(...args),
  markNotificationUnread: (...args: unknown[]) => api.markNotificationUnread(...args),
  markAllNotificationsRead: (...args: unknown[]) => api.markAllNotificationsRead(...args),
  fetchFavorites: (...args: unknown[]) => api.fetchFavorites(...args),
  removeFavorite: (...args: unknown[]) => api.removeFavorite(...args),
  fetchSavedSuppliers: (...args: unknown[]) => api.fetchSavedSuppliers(...args),
  removeSavedSupplier: (...args: unknown[]) => api.removeSavedSupplier(...args),
}));
vi.mock('../lib/realtime', () => ({ onNotification: () => () => undefined }));
vi.mock('../lib/auth', () => ({
  getSessions: (...args: unknown[]) => api.getSessions(...args),
  revokeSessionsByDevice: (...args: unknown[]) => api.revokeSessionsByDevice(...args),
}));
vi.mock('../components/Shared', () => ({
  formatDate: (value: string) => value,
  LoadingSpinner: () => <div>Loading</div>,
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </section>
  ),
  ErrorBanner: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div role="alert">
      <span>{message}</span>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
}));
vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
  colors: {
    bgSubtle: '#f5f5f5',
    border: '#ddd',
    muted: '#777',
    brand: { 700: '#123' },
    errBg: '#fee',
    err: '#900',
    errBorder: '#c99',
    okBg: '#efe',
    ok: '#090',
  },
  radii: { sm: 4, md: 8, lg: 12 },
  shadows: { sm: 'none' },
  transitions: { fast: '0ms' },
}));

import NotificationsPage from '../app/notifications/page';
import FavoritesPage from '../app/favorites/page';
import SavedSuppliersPage from '../app/saved-suppliers/page';
import SessionsPage from '../app/profile/sessions/page';

describe('buyer self-service read recovery', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchNotifications.mockResolvedValue([]);
    api.fetchFavorites.mockResolvedValue([]);
    api.fetchSavedSuppliers.mockResolvedValue([]);
    api.getSessions.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not turn a failed notifications read into an empty state and can retry', async () => {
    api.fetchNotifications
      .mockRejectedValueOnce(new Error('Notifications are temporarily unavailable'))
      .mockResolvedValueOnce([]);
    render(<NotificationsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Notifications are temporarily unavailable',
    );
    expect(screen.queryByText('No notifications')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No notifications')).toBeTruthy();
    expect(api.fetchNotifications).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable error instead of an empty favorites state', async () => {
    api.fetchFavorites
      .mockRejectedValueOnce(new Error('Favorites could not be loaded'))
      .mockResolvedValueOnce([]);
    render(<FavoritesPage />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Favorites could not be loaded',
    );
    expect(screen.queryByText(/No favorites yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No favorites yet/)).toBeTruthy();
    expect(api.fetchFavorites).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable error instead of an empty saved-suppliers state', async () => {
    api.fetchSavedSuppliers
      .mockRejectedValueOnce(new Error('Saved suppliers could not be loaded'))
      .mockResolvedValueOnce([]);
    render(<SavedSuppliersPage />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Saved suppliers could not be loaded',
    );
    expect(screen.queryByText(/No saved suppliers yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No saved suppliers yet/)).toBeTruthy();
    expect(api.fetchSavedSuppliers).toHaveBeenCalledTimes(2);
  });

  it('restores the original unread state when marking a notification fails', async () => {
    api.fetchNotifications.mockResolvedValue([
      {
        id: 'notification-1',
        userId: 'buyer-1',
        type: 'ORDER',
        channel: 'IN_APP',
        template: 'ORDER_UPDATE',
        title: 'Order updated',
        body: 'Your order changed status.',
        status: 'SENT',
        readAt: null,
        createdAt: '2026-11-22T10:00:00.000Z',
      },
    ]);
    api.markNotificationRead.mockRejectedValue(new Error('Read update failed'));
    render(<NotificationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Mark .* as read/ }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not update this notification',
    );
    expect(screen.getByRole('button', { name: /Mark .* as read/ })).toBeTruthy();
    expect(screen.queryByText('✓ Read')).toBeNull();
  });

  it('keeps a favorite visible and reports a failed remove action', async () => {
    api.fetchFavorites.mockResolvedValue([
      { id: 'favorite-1', productId: 'product-1', product: { title: 'Test product', moq: 1 } },
    ]);
    api.removeFavorite.mockRejectedValue(new Error('Could not remove favorite'));
    render(<FavoritesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not remove favorite');
    expect(screen.getByText('Test product')).toBeTruthy();
  });

  it('offers retry when the active-session read fails', async () => {
    api.getSessions
      .mockRejectedValueOnce(new Error('Sessions could not be loaded'))
      .mockResolvedValueOnce([]);
    render(<SessionsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Sessions could not be loaded',
    );
    expect(screen.queryByText('No active sessions found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No active sessions found')).toBeTruthy();
    expect(api.getSessions).toHaveBeenCalledTimes(2);
  });
});
