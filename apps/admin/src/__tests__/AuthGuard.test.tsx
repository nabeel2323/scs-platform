import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthGuard } from '../components/AuthGuard';
import { isAuthenticated } from '../lib/auth';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const route = vi.hoisted(() => ({ pathname: '/bootstrap' }));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => route.pathname,
}));

vi.mock('../lib/auth', () => ({
  isAuthenticated: vi.fn(),
}));

const mockedIsAuthenticated = vi.mocked(isAuthenticated);

describe('AuthGuard public and protected routes', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    route.pathname = '/bootstrap';
    mockedIsAuthenticated.mockReturnValue(false);
  });

  afterEach(() => cleanup());

  it('allows an unauthenticated visitor to open the bootstrap route', async () => {
    render(<AuthGuard><div>Bootstrap form</div></AuthGuard>);

    expect(await screen.findByText('Bootstrap form')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(mockedIsAuthenticated).not.toHaveBeenCalled();
  });

  it('keeps nested bootstrap routes publicly accessible', async () => {
    route.pathname = '/bootstrap/help';

    render(<AuthGuard><div>Bootstrap help</div></AuthGuard>);

    expect(await screen.findByText('Bootstrap help')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('continues to allow unauthenticated access to authentication routes', async () => {
    route.pathname = '/auth/login';

    render(<AuthGuard><div>Login form</div></AuthGuard>);

    expect(await screen.findByText('Login form')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated visitors from protected routes to login', async () => {
    route.pathname = '/';

    render(<AuthGuard><div>Protected dashboard</div></AuthGuard>);

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/auth/login'));
    expect(screen.queryByText('Protected dashboard')).toBeNull();
  });

  it('renders protected routes for authenticated users', async () => {
    route.pathname = '/';
    mockedIsAuthenticated.mockReturnValue(true);

    render(<AuthGuard><div>Protected dashboard</div></AuthGuard>);

    expect(await screen.findByText('Protected dashboard')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
