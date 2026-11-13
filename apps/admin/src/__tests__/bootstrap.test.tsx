/**
 * Admin bootstrap UI tests — Phase 3.5 (Task I).
 *
 * Covers the first-time administrator setup experience:
 *   - Loading state
 *   - Initialization status gating (setup-required / initialized / error)
 *   - Bootstrap authorization available / unavailable
 *   - Normal login when initialized
 *   - API unavailable + retry
 *   - Form validation (full name, email, password, confirm password, token)
 *   - Submission outcomes (success, invalid auth, duplicate email)
 *   - Repeated submission protection
 *   - No token/password in console logs
 *
 * Network and auth dependencies are mocked. next/navigation is mocked to
 * capture redirects without actually navigating.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BootstrapPage from '../app/bootstrap/page';

// ── Mocks ───────────────────────────────────────────────────────────

import { fetchBootstrapStatus, createSuperAdmin, BootstrapError } from '@/lib/bootstrap';

const mockedFetchBootstrapStatus = vi.mocked(fetchBootstrapStatus);
const mockedCreateSuperAdmin = vi.mocked(createSuperAdmin);

vi.mock('@/lib/bootstrap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bootstrap')>();
  return {
    ...actual,
    fetchBootstrapStatus: vi.fn(),
    createSuperAdmin: vi.fn(),
  };
});

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

// Capture console output to assert no secrets leak into client logs.
const consoleLogSpy = vi.spyOn(console, 'log');
const consoleErrorSpy = vi.spyOn(console, 'error');

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  consoleLogSpy.mockClear();
  consoleErrorSpy.mockClear();

  mockedFetchBootstrapStatus.mockResolvedValue({
    initialized: false,
    bootstrapAvailable: true,
    setupRequired: true,
  });
  mockedCreateSuperAdmin.mockResolvedValue({
    status: 'initialized',
    loginUrl: '/auth/login',
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function fillForm({
  fullName = 'Platform Admin',
  email = 'Admin@Example.COM',
  password = 'Str0ng!P@ssw0rd',
  confirmPassword = 'Str0ng!P@ssw0rd',
  authorizationToken = 'bs_valid_token_12345678901234567890123456789012',
}: Record<string, string> = {}) {
  await fireEvent.input(inputById('bootstrap-full-name'), { target: { value: fullName } });
  await fireEvent.input(inputById('bootstrap-email'), { target: { value: email } });
  await fireEvent.input(inputById('bootstrap-password'), { target: { value: password } });
  await fireEvent.input(inputById('bootstrap-confirm-password'), { target: { value: confirmPassword } });
  await fireEvent.input(inputById('bootstrap-authorization-token'), { target: { value: authorizationToken } });
}

async function submitForm() {
  const form = document.querySelector('form');
  if (!form) throw new Error('form not found');
  await fireEvent.submit(form);
}

function inputById(id: string): HTMLInputElement {
  const el = document.getElementById(id) as HTMLInputElement;
  if (!el) throw new Error(`Input with id="${id}" not found`);
  return el;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Bootstrap page — initialization gating', () => {
  it('shows a neutral loading state before status resolves', () => {
    render(<BootstrapPage />);
    expect(screen.getByText(/Preparing administrator setup…/i)).toBeTruthy();
  });

  it('redirects to login when the platform is already initialized', async () => {
    mockedFetchBootstrapStatus.mockResolvedValue({
      initialized: true,
      bootstrapAvailable: false,
      setupRequired: false,
    });
    render(<BootstrapPage />);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/login'));
  });

  it('shows setup screen when setup is required and a token is available', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    expect(inputById('bootstrap-full-name')).toBeTruthy();
    expect(inputById('bootstrap-email')).toBeTruthy();
    expect(inputById('bootstrap-password')).toBeTruthy();
    expect(inputById('bootstrap-confirm-password')).toBeTruthy();
    expect(inputById('bootstrap-authorization-token')).toBeTruthy();
  });

  it('shows operator-required message when setup is required but no token is available', async () => {
    mockedFetchBootstrapStatus.mockResolvedValue({
      initialized: false,
      bootstrapAvailable: false,
      setupRequired: true,
    });
    render(<BootstrapPage />);
    await screen.findByText(/authorized deployment operator/i);
    expect(document.getElementById('bootstrap-full-name')).toBeNull();
  });

  it('shows an error and retry option when the API is unreachable', async () => {
    mockedFetchBootstrapStatus.mockRejectedValue(new Error('connect ECONNREFUSED'));
    render(<BootstrapPage />);
    await waitFor(() => expect(document.body.textContent).toContain('Unable to reach the platform'));
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy();
  });

  it('does not render the normal login form before initialization status is established', () => {
    render(<BootstrapPage />);
    expect(screen.queryByText(/Welcome back/i)).not.toBeTruthy();
  });

  it('retries the status check when the user clicks retry after an error', async () => {
    mockedFetchBootstrapStatus
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce({
        initialized: false,
        bootstrapAvailable: true,
        setupRequired: true,
      });
    render(<BootstrapPage />);
    await waitFor(() => expect(document.body.textContent).toContain('Unable to reach the platform'));
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    await waitFor(() =>
      expect(screen.getByText(/First-Time Administrator Setup/i)).toBeTruthy(),
    );
    expect(mockedFetchBootstrapStatus).toHaveBeenCalledTimes(2);
  });
});

describe('Bootstrap page — form validation', () => {
  it('reports missing required fields on submit', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await submitForm();
    await waitFor(() => expect(document.body.textContent).toContain('Full name is required'));
    await waitFor(() => expect(document.body.textContent).toContain('Email address is required'));
    await waitFor(() => expect(document.body.textContent).toContain('Password is required'));
    await waitFor(() => expect(document.body.textContent).toContain('Enter the bootstrap authorization'));
  });

  it('rejects an invalid email address', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    const emailInput = inputById('bootstrap-email');
    await fireEvent.input(emailInput, { target: { value: 'not-an-email' } });
    await fireEvent.blur(emailInput);
    await waitFor(() => expect(document.body.textContent).toContain('Enter a valid email address'));
  });

  it('rejects a weak password', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    const pwInput = inputById('bootstrap-password');
    await fireEvent.input(pwInput, { target: { value: 'weak' } });
    await fireEvent.blur(pwInput);
    await waitFor(() => expect(document.body.textContent).toContain('at least 12 characters'));
  });

  it('rejects password confirmation mismatch', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fireEvent.input(inputById('bootstrap-password'), { target: { value: 'Str0ng!P@ssw0rd' } });
    await fireEvent.input(inputById('bootstrap-confirm-password'), { target: { value: 'Str0ng!P@ssw0rd2' } });
    await fireEvent.blur(inputById('bootstrap-confirm-password'));
    await waitFor(() => expect(document.body.textContent).toContain('Passwords do not match'));
  });

  it('normalizes email (case + whitespace) before submission', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm({ email: '  ADMIN@Example.COM  ' });
    await submitForm();
    await waitFor(() => expect(mockedCreateSuperAdmin).toHaveBeenCalledTimes(1));
    const call = mockedCreateSuperAdmin.mock.calls[0]![0];
    expect(call.email).toBe('admin@example.com');
  });
});

describe('Bootstrap page — submission outcomes', () => {
  it('successfully provisions and redirects to login', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm();
    await submitForm();

    await waitFor(() => expect(mockedCreateSuperAdmin).toHaveBeenCalledTimes(1));
    const call = mockedCreateSuperAdmin.mock.calls[0]![0];
    expect(call.authorizationToken).toBe('bs_valid_token_12345678901234567890123456789012');
    expect(call.fullName).toBe('Platform Admin');
    expect(call.email).toBe('admin@example.com');
    expect(call.password).toBe('Str0ng!P@ssw0rd');

    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/login'), { timeout: 3000 });
  });

  it('shows an understandable error for invalid authorization (403)', async () => {
    mockedCreateSuperAdmin.mockImplementation(async () => {
      throw new BootstrapError(
        403,
        'Invalid, expired, or already-used bootstrap authorization',
        { detail: 'Invalid, expired, or already-used bootstrap authorization' },
      );
    });
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm();
    await submitForm();
    await waitFor(() => expect(document.body.textContent).toContain('Invalid, expired, or already-used bootstrap authorization'));
  });

  it('shows an understandable error for duplicate email (409)', async () => {
    mockedCreateSuperAdmin.mockImplementation(async () => {
      throw new BootstrapError(
        409,
        'An account with this email already exists',
        { detail: 'An account with this email already exists' },
      );
    });
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm();
    await submitForm();
    await waitFor(() => expect(document.body.textContent).toContain('already exists'));
  });

  it('protects against repeated submission (single create call)', async () => {
    let resolveSubmit: ((val: { status: 'initialized'; loginUrl: string }) => void) | null = null;
    mockedCreateSuperAdmin.mockImplementation(
      async () => new Promise<{ status: 'initialized'; loginUrl: string }>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm();
    await submitForm();
    expect(mockedCreateSuperAdmin).toHaveBeenCalledTimes(1);
    resolveSubmit!({ status: 'initialized', loginUrl: '/auth/login' });
    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));
  });

  it('does not log the token or password to the console', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm();
    await submitForm();
    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));

    const allLogOutput = [
      ...consoleLogSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ].map((args) => args.join(' '));
    const combined = allLogOutput.join(' ');
    expect(combined).not.toContain('bs_valid_token_12345678901234567890123456789012');
    expect(combined).not.toContain('Str0ng!P@ssw0rd');
  });

  it('redirects to login after successful setup', async () => {
    render(<BootstrapPage />);
    await screen.findByText(/First-Time Administrator Setup/i);
    await fillForm();
    await submitForm();
    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/login'), { timeout: 3000 });
  });
});
