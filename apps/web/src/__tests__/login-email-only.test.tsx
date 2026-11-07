import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Email-only staging release — requirement 10, web buyer and merchant login.
 *
 * The release permits email OTP only (`OTP_CHANNELS=email`). Two defects on this
 * screen routed shoppers into the disabled channel anyway:
 *
 *  1. The password tab's "Sign in with OTP" call to action opened the PHONE tab,
 *     so the primary passwordless entry point asked for a number and then sent
 *     SMS — a channel the release refuses.
 *  2. The password second factor always rendered the phone code-entry form. The
 *     API now answers `otpEmail` (masked) instead of `otpPhone` for an account
 *     whose code went by email, and the page had no branch for it: the user was
 *     shown an empty phone prompt and a Verify button wired to the phone
 *     endpoint, which cannot find an email challenge.
 *
 * The phone tab itself is deliberately preserved (requirement 11) so a later
 * phase can re-enable SMS without rebuilding the screen.
 *
 * Convention follows login-device-trust.test.tsx: RTL + Vitest core matchers
 * only (jest-dom is not installed in this app), boundaries mocked at module level.
 */

const { ctl, FakeLoginRateLimitError } = vi.hoisted(() => {
  class FakeLoginRateLimitError extends Error {
    remainingAttempts: number;
    retryAfterSeconds: number;
    constructor(message: string, remaining: number, retryAfter: number) {
      super(message);
      this.name = 'LoginRateLimitError';
      this.remainingAttempts = remaining;
      this.retryAfterSeconds = retryAfter;
    }
  }
  return {
    ctl: {
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
      requestEmailOtp: vi.fn(),
      verifyEmailOtp: vi.fn(),
      loginPassword: vi.fn(),
      checkDeviceLogin: vi.fn(),
      fetchProfile: vi.fn(),
      routerPush: vi.fn(),
    },
    FakeLoginRateLimitError,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.routerPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/auth', () => ({
  requestOtp: (...args: unknown[]) => ctl.requestOtp(...args),
  verifyOtp: (...args: unknown[]) => ctl.verifyOtp(...args),
  requestEmailOtp: (...args: unknown[]) => ctl.requestEmailOtp(...args),
  verifyEmailOtp: (...args: unknown[]) => ctl.verifyEmailOtp(...args),
  loginPassword: (...args: unknown[]) => ctl.loginPassword(...args),
  checkDeviceLogin: (...args: unknown[]) => ctl.checkDeviceLogin(...args),
  LoginRateLimitError: FakeLoginRateLimitError,
}));

vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }));
vi.mock('@/lib/api', () => ({
  fetchProfile: (...args: unknown[]) => ctl.fetchProfile(...args),
}));

vi.mock('@scs/ui-kit', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  radii: { md: 8 },
  colors: {
    brand: { 500: '#brand500', 700: '#brand700', 900: '#brand900' },
    border: '#border',
    errBg: '#errBg',
    err: '#err',
    warnBg: '#warnBg',
    warn: '#warn',
    amber: '#amber',
    ok: '#ok',
    muted: '#muted',
  },
}));

import LoginPage from '@/app/auth/login/page';

const EMAIL_FIELD = 'you@example.com';
const PASSWORD_FIELD = '••••••••••••';
const PHONE_FIELD = '+966 5XX XXX XXXX';
const OTP_FIELD = '123456';
const BUYER_EMAIL = 'buyer@test.com';

/** Fill the password tab and submit, returning whatever the API answered. */
async function submitPassword(result: Record<string, unknown>): Promise<void> {
  ctl.loginPassword.mockResolvedValue(result);
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
    target: { value: BUYER_EMAIL },
  });
  fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), {
    target: { value: 'hunter2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await waitFor(() => expect(ctl.loginPassword).toHaveBeenCalled());
}

describe('Web login — email is the release channel (requirement 10)', () => {
  beforeEach(() => {
    Object.values(ctl).forEach((fn) => fn.mockReset());
    ctl.fetchProfile.mockResolvedValue({ organizations: [{ id: 'o1' }] });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // ── The passwordless entry point must not lead to SMS ────────────

  it('"Sign in with OTP" opens the email request form, not the phone form', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Sign in with.*OTP/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send code to email' })).toBeTruthy(),
    );
    // No phone prompt, no channel radios, and nothing sent yet.
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Delivery channel' })).toBeNull();
    expect(ctl.requestOtp).not.toHaveBeenCalled();
  });

  it('the passwordless entry point requests email OTP and never SMS', async () => {
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Sign in with.*OTP/i }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: BUYER_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    await waitFor(() => expect(ctl.requestEmailOtp).toHaveBeenCalledWith(BUYER_EMAIL));
    expect(ctl.requestOtp).not.toHaveBeenCalled();
  });

  it('lists Email OTP before Phone OTP so the permitted channel is the primary one', () => {
    render(<LoginPage />);
    const tabs = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t): t is string => !!t && ['Email/Password', 'Email OTP', 'Phone OTP'].includes(t));

    expect(tabs.indexOf('Email OTP')).toBeGreaterThanOrEqual(0);
    expect(tabs.indexOf('Email OTP')).toBeLessThan(tabs.indexOf('Phone OTP'));
  });

  // ── The password second factor follows the channel the API used ──

  it('shows the email code-entry form when the API sent the second factor by email', async () => {
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpEmail: 'b***@test.com',
      otpDelivery: 'accepted',
    });

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    // The prompt names the inbox, not a phone, and claims a send only because
    // the server said its send was accepted.
    expect(screen.getByText(/Code sent to/)).toBeTruthy();
    expect(document.body.textContent).toContain(BUYER_EMAIL);
    expect(screen.queryByText(/Code sent via SMS/)).toBeNull();
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
  });

  it('verifies an email second factor through the email endpoint, never the phone one', async () => {
    ctl.verifyEmailOtp.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
    });
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpEmail: 'b***@test.com',
      otpDelivery: 'accepted',
    });

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(ctl.verifyEmailOtp).toHaveBeenCalledWith(BUYER_EMAIL, '246810'),
    );
    expect(ctl.verifyOtp).not.toHaveBeenCalled();
  });

  it('does not claim delivery for an email second factor the server could not confirm', async () => {
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpEmail: 'b***@test.com',
      otpDelivery: 'uncertain',
    });

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent to/)).toBeNull();
    expect(screen.getByText(/could not confirm delivery/i)).toBeTruthy();
  });

  it('treats a missing otpDelivery answer on the email factor as unconfirmed (fail closed)', async () => {
    render(<LoginPage />);
    await submitPassword({ requiresOtp: true, otpEmail: 'b***@test.com' });

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent to/)).toBeNull();
  });

  it('keeps the phone second factor working when the API reports a phone challenge', async () => {
    // Requirement 11: the SMS path is preserved, not deleted. A later phase that
    // re-enables SMS still gets the phone prompt and the phone verify endpoint.
    ctl.verifyOtp.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
    });
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpPhone: '+966500000009',
      otpDelivery: 'accepted',
    });

    await waitFor(() =>
      expect(screen.getByText('Code sent via SMS to +966500000009')).toBeTruthy(),
    );
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(ctl.verifyOtp).toHaveBeenCalledWith('+966500000009', '135790'),
    );
    expect(ctl.verifyEmailOtp).not.toHaveBeenCalled();
  });

  // ── The dormant phone tab is still reachable, and still dormant ──

  it('preserves the Phone OTP tab for a future phase without sending anything on open', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));

    expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Delivery channel' })).toBeTruthy();
    expect(ctl.requestOtp).not.toHaveBeenCalled();
    expect(ctl.requestEmailOtp).not.toHaveBeenCalled();
  });
});