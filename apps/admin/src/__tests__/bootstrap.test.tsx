/**
 * Admin bootstrap UI tests — UI-driven Super Admin provisioning.
 *
 * Covers the guided first-run setup experience:
 *   - Loading and readiness states
 *   - Welcome step with missing-owner-config blocking
 *   - Ownership verification (OTP request → verify)
 *   - Administrator creation (verified email read-only, password strength)
 *   - Completion and redirect to normal login (auth flow not bypassed)
 *   - No bootstrap token input anywhere
 *   - No secrets (token/password/OTP) in client logs
 *
 * Network dependencies are mocked via @/lib/bootstrap. next/navigation is
 * mocked to capture redirects without actually navigating.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BootstrapPage from '../app/bootstrap/page';

// ── Mocks ───────────────────────────────────────────────────────────

import {
  fetchBootstrapStatus,
  requestOwnerOtp,
  verifyOwnerOtp,
  createSuperAdmin,
  BootstrapError,
  type BootstrapStatus,
} from '@/lib/bootstrap';

const mockedFetchBootstrapStatus = vi.mocked(fetchBootstrapStatus);
const mockedRequestOwnerOtp = vi.mocked(requestOwnerOtp);
const mockedVerifyOwnerOtp = vi.mocked(verifyOwnerOtp);
const mockedCreateSuperAdmin = vi.mocked(createSuperAdmin);

vi.mock('@/lib/bootstrap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bootstrap')>();
  return {
    ...actual,
    fetchBootstrapStatus: vi.fn(),
    requestOwnerOtp: vi.fn(),
    verifyOwnerOtp: vi.fn(),
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

const OWNER_EMAIL = 'platform-owner@example.com';
const OWNER_HINT = 'p****@example.com';

function statusWith(overrides: Partial<BootstrapStatus> = {}): BootstrapStatus {
  return {
    initialized: false,
    bootstrapAvailable: false,
    setupRequired: true,
    ownerVerificationRequired: true,
    ownerEmailConfigured: true,
    ownerEmailHint: OWNER_HINT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  consoleLogSpy.mockClear();
  consoleErrorSpy.mockClear();
  vi.useRealTimers();

  mockedFetchBootstrapStatus.mockResolvedValue(statusWith());
  mockedRequestOwnerOtp.mockResolvedValue({
    success: true,
    deliveryStatus: 'delivered',
    possiblyDelivered: null,
    emailHint: OWNER_HINT,
  });
  mockedVerifyOwnerOtp.mockResolvedValue({
    authorization: 'bs_auth_grant_12345678901234567890123456789012',
    expiresInSeconds: 900,
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

function inputById(id: string): HTMLInputElement {
  const el = document.getElementById(id) as HTMLInputElement;
  if (!el) throw new Error(`Input with id="${id}" not found`);
  return el;
}

async function reachWelcomeStep() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Continue to ownership verification/i })).toBeTruthy(),
  );
}

async function proceedToVerify() {
  await reachWelcomeStep();
  await fireEvent.click(screen.getByRole('button', { name: /Continue to ownership verification/i }));
  await waitFor(() => expect(screen.getByText(/Verify platform ownership/i)).toBeTruthy());
}

async function requestOwnerOtpFlow() {
  await fireEvent.input(inputById('bootstrap-owner-email'), {
    target: { value: OWNER_EMAIL },
  });
  await fireEvent.click(screen.getByRole('button', { name: /Send verification code/i }));
}

async function fillCreateAdminForm({
  fullName = 'Platform Admin',
  password = 'Str0ng!P@ssw0rd',
  confirmPassword = 'Str0ng!P@ssw0rd',
} = {}) {
  await fireEvent.input(inputById('bootstrap-full-name'), { target: { value: fullName } });
  await fireEvent.input(inputById('bootstrap-password'), { target: { value: password } });
  await fireEvent.input(inputById('bootstrap-confirm-password'), { target: { value: confirmPassword } });
}

async function submitCreateAdmin() {
  await fireEvent.click(screen.getByRole('button', { name: /Create Super Admin/i }));
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Bootstrap page — readiness gating', () => {
  it('shows a neutral loading state before status resolves', () => {
    mockedFetchBootstrapStatus.mockImplementationOnce(() => new Promise<BootstrapStatus>(() => {}));
    render(<BootstrapPage />);
    expect(screen.getByText(/Checking platform readiness…/i)).toBeTruthy();
  });

  it('redirects to normal login when the platform is already initialized', async () => {
    mockedFetchBootstrapStatus.mockResolvedValue(statusWith({
      initialized: true,
      setupRequired: false,
      ownerVerificationRequired: false,
    }));
    render(<BootstrapPage />);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/login'));
  });

  it('blocks setup when the owner address is not configured', async () => {
    mockedFetchBootstrapStatus.mockResolvedValue(statusWith({
      ownerEmailConfigured: false,
      ownerEmailHint: null,
      ownerVerificationRequired: false,
    }));
    render(<BootstrapPage />);
    await waitFor(() =>
      expect(screen.getByText(/Deployment configuration is missing/i)).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: /Continue to ownership verification/i })).not.toBeTruthy();
  });

  it('proceeds from welcome to ownership verification when configured', async () => {
    render(<BootstrapPage />);
    await proceedToVerify();
  });
});

describe('Bootstrap page — verify ownership (OTP)', () => {
  beforeEach(async () => {
    render(<BootstrapPage />);
    await proceedToVerify();
  });

  it('sends the OTP only to the configured owner address', async () => {
    await requestOwnerOtpFlow();
    await waitFor(() =>
      expect(mockedRequestOwnerOtp).toHaveBeenCalledWith(OWNER_EMAIL),
    );
    expect(screen.getByText(/A code is on its way/i)).toBeTruthy();
  });

  it('shows the masked owner email hint, never the full address', async () => {
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByText(OWNER_HINT)).toBeTruthy());
    expect(document.body.textContent).not.toContain(OWNER_EMAIL);
  });

  it('advances to code entry after an accepted send', async () => {
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());
  });

  it('does not claim delivery when the send outcome is uncertain', async () => {
    mockedRequestOwnerOtp.mockResolvedValueOnce({
      success: false,
      deliveryStatus: 'DELIVERY_TIMEOUT',
      possiblyDelivered: true,
      emailHint: OWNER_HINT,
    });
    await requestOwnerOtpFlow();
    await waitFor(() =>
      expect(screen.getByText(/couldn't confirm that a code reached/i)).toBeTruthy(),
    );
    // Stays on request step; no automatic advance.
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
  });

  it('reports a rate limit with retry-after', async () => {
    mockedRequestOwnerOtp.mockRejectedValueOnce(
      new BootstrapError(429, 'Too many OTP requests.', {
        detail: 'Too many OTP requests.',
        retryAfterSeconds: 45,
      }),
    );
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByText(/Try again in 45s/i)).toBeTruthy());
  });

  it('rejects verification with an invalid code', async () => {
    mockedVerifyOwnerOtp.mockRejectedValueOnce(
      new BootstrapError(403, 'Invalid OTP.', { detail: 'Invalid OTP.' }),
    );
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());
    await fireEvent.input(inputById('bootstrap-otp'), { target: { value: '000000' } });
    await fireEvent.click(screen.getByRole('button', { name: /Verify code/i }));
    await waitFor(() =>
      expect(screen.getByText(/Invalid, expired, or already-used code/i)).toBeTruthy(),
    );
  });

  it('verifies ownership and moves to administrator creation', async () => {
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());
    await fireEvent.input(inputById('bootstrap-otp'), { target: { value: '123456' } });
    await fireEvent.click(screen.getByRole('button', { name: /Verify code/i }));
    await waitFor(() => expect(screen.getByText(/Create administrator/i)).toBeTruthy());
    // Verified owner email is pre-filled and read-only.
    const emailInput = inputById('bootstrap-email');
    expect(emailInput.value).toBe(OWNER_EMAIL);
    expect(emailInput.getAttribute('readonly')).not.toBeNull();
  });

  it('does not render a bootstrap token input anywhere', async () => {
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());
    await fireEvent.input(inputById('bootstrap-otp'), { target: { value: '123456' } });
    await fireEvent.click(screen.getByRole('button', { name: /Verify code/i }));
    await waitFor(() => expect(screen.getByText(/Create administrator/i)).toBeTruthy());
    expect(screen.queryByPlaceholderText(/authorization|token/i)).toBeNull();
    expect(document.body.textContent).not.toContain('operator');
  });
});

describe('Bootstrap page — create administrator', () => {
  beforeEach(async () => {
    render(<BootstrapPage />);
    await proceedToVerify();
    await requestOwnerOtpFlow();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());
    await fireEvent.input(inputById('bootstrap-otp'), { target: { value: '123456' } });
    await fireEvent.click(screen.getByRole('button', { name: /Verify code/i }));
    await waitFor(() => expect(screen.getByText(/Create administrator/i)).toBeTruthy());
  });

  it('reports missing required fields on submit', async () => {
    await submitCreateAdmin();
    await waitFor(() => expect(document.body.textContent).toContain('Full name is required'));
    await waitFor(() => expect(document.body.textContent).toContain('Password is required'));
    await waitFor(() => expect(document.body.textContent).toContain('Please confirm your password'));
    // Email is pre-filled from verification, so it is not a required error.
    expect(document.body.textContent).not.toContain('Email address is required');
  });

  it('rejects a weak password', async () => {
    await fireEvent.input(inputById('bootstrap-full-name'), { target: { value: 'Platform Admin' } });
    await fireEvent.input(inputById('bootstrap-password'), { target: { value: 'weak' } });
    await fireEvent.input(inputById('bootstrap-confirm-password'), { target: { value: 'weak' } });
    await submitCreateAdmin();
    await waitFor(() => expect(document.body.textContent).toContain('at least 12 characters'));
  });

  it('rejects password confirmation mismatch', async () => {
    await fireEvent.input(inputById('bootstrap-full-name'), { target: { value: 'Platform Admin' } });
    await fireEvent.input(inputById('bootstrap-password'), { target: { value: 'Str0ng!P@ssw0rd' } });
    await fireEvent.input(inputById('bootstrap-confirm-password'), { target: { value: 'Str0ng!P@ssw0rd2' } });
    await submitCreateAdmin();
    await waitFor(() => expect(document.body.textContent).toContain('Passwords do not match'));
  });

  it('creates the Super Admin and redirects to normal login', async () => {
    await fillCreateAdminForm();
    await submitCreateAdmin();
    await waitFor(() => expect(mockedCreateSuperAdmin).toHaveBeenCalledTimes(1));
    const call = mockedCreateSuperAdmin.mock.calls[0]![0];
    expect(call.authorizationToken).toBe('bs_auth_grant_12345678901234567890123456789012');
    expect(call.fullName).toBe('Platform Admin');
    expect(call.email).toBe(OWNER_EMAIL);
    expect(call.password).toBe('Str0ng!P@ssw0rd');
    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/login'), { timeout: 3000 });
  });

  it('does not log the authorization, OTP, or password to the console', async () => {
    await fillCreateAdminForm();
    await submitCreateAdmin();
    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));

    const allLogOutput = [
      ...consoleLogSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ].map((args) => args.join(' '));
    const combined = allLogOutput.join(' ');
    expect(combined).not.toContain('bs_auth_grant_12345678901234567890123456789012');
    expect(combined).not.toContain('123456');
    expect(combined).not.toContain('Str0ng!P@ssw0rd');
  });

  it('does not bypass the authentication flow after setup', async () => {
    await fillCreateAdminForm();
    await submitCreateAdmin();
    await waitFor(() => expect(document.body.textContent).toContain('Platform initialized'));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/login'), { timeout: 4000 });
    // The redirect target is the normal login page, not an authenticated route.
    expect(navigation.push).toHaveBeenCalledWith('/auth/login');
    expect(navigation.push).not.toHaveBeenCalledWith('/');
  });
});
