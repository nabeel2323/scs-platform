import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Web login — device-trust and OTP-delivery-honesty contract.
 *
 * Two audit findings land on this screen:
 *
 * S-2 (unprotected device-check): the page used to fire
 * `POST /v1/auth/login/device-check` on mount with the stored email, which told
 * any passive observer — and any attacker who could read a shared machine's
 * localStorage — whether that address had an account, had a password set, and
 * had been trusted on a device before. The probe is gone; the login call answers
 * all three server-side from the credential. These tests fail again if the
 * pre-flight is ever re-added.
 *
 * "Delivery failure silently treated as success": HTTP 200 from an OTP request
 * means the API processed the call, not that a code left the building. The
 * server now reports its own send as `otpDelivery: 'accepted' | 'uncertain'`,
 * and an absent answer must be read as NOT confirmed (fail closed), because a
 * client that assumes delivery is the exact defect being removed.
 *
 * Also locked: one network request per double-click (duplicate sends burn the
 * rate budget twice and leave two live challenges), and a wrong password never
 * advances to code entry.
 *
 * Follows the auth-login-channel.test.tsx convention: RTL + Vitest core
 * matchers only (jest-dom is not installed in this app), every external
 * boundary mocked at module level.
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

// The duplicate-send and rate-limit cases drive the preserved Phone OTP tab. The
// email-only release hides it behind PHONE_OTP_UI_ENABLED=false, so mock the flag
// true to keep exercising that dormant path; the server-challenge cases below are
// unaffected because the phone verify step renders regardless of the flag.
vi.mock('@/lib/auth-channels', () => ({ PHONE_OTP_UI_ENABLED: true }));

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
const PHONE = '+966500000009';

/** Fill the default (password) tab and submit. */
async function submitPassword(
  result: Record<string, unknown> | Error,
): Promise<void> {
  if (result instanceof Error) ctl.loginPassword.mockRejectedValue(result);
  else ctl.loginPassword.mockResolvedValue(result);
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
    target: { value: 'buyer@test.com' },
  });
  fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), {
    target: { value: 'hunter2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await waitFor(() => expect(ctl.loginPassword).toHaveBeenCalled());
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Web login — device-trust contract (S-1/S-2)', () => {
  beforeEach(() => {
    ctl.requestOtp.mockReset();
    ctl.verifyOtp.mockReset();
    ctl.requestEmailOtp.mockReset();
    ctl.verifyEmailOtp.mockReset();
    ctl.loginPassword.mockReset();
    ctl.checkDeviceLogin.mockReset();
    ctl.fetchProfile.mockReset().mockResolvedValue({ organizations: [{ id: 'o1' }] });
    ctl.routerPush.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Nothing is probed before the user acts ──────────────────────

  it('does not call device-check on mount, even with a stored email (S-2)', async () => {
    window.localStorage.setItem('scs_last_email', 'buyer@test.com');
    render(<LoginPage />);
    // Let any effect-triggered request settle, and the pre-fill land.
    await waitFor(() =>
      expect((screen.getByPlaceholderText(EMAIL_FIELD) as HTMLInputElement).value).toBe(
        'buyer@test.com',
      ),
    );
    await flush();

    expect(ctl.checkDeviceLogin).not.toHaveBeenCalled();
    expect(ctl.requestOtp).not.toHaveBeenCalled();
    expect(ctl.requestEmailOtp).not.toHaveBeenCalled();
    expect(ctl.loginPassword).not.toHaveBeenCalled();
  });

  it('asks nothing about the device before the password is verified', async () => {
    // Trust is evaluated server-side at login, from the credential the server
    // issued — not from a value the page collected first.
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
    fireEvent.change(screen.getByPlaceholderText(PHONE_FIELD), { target: { value: PHONE } });

    expect(ctl.checkDeviceLogin).not.toHaveBeenCalled();
  });

  // ── The password path reports the server's delivery answer ──────

  it('claims a code only when the server says its send was accepted', async () => {
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'accepted',
    });

    await waitFor(() =>
      expect(
        screen.getByText('New device detected. Enter the OTP sent to your phone to continue.'),
      ).toBeTruthy(),
    );
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
    expect(screen.getByText(`Code sent via SMS to ${PHONE}`)).toBeTruthy();
  });

  it('hedges a password challenge whose delivery the server could not confirm', async () => {
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'uncertain',
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          'This device needs a second factor. We could not confirm the code was delivered, but you can enter it if it arrives.',
        ),
      ).toBeTruthy(),
    );
    // The un-urged wording, not a delivery claim.
    expect(screen.getByText(`If a code arrived on ${PHONE}, enter it below.`)).toBeTruthy();
    expect(screen.queryByText(/Code sent via/)).toBeNull();
  });

  it('treats a missing otpDelivery answer as unconfirmed (fail closed)', async () => {
    // A response from a build that predates the field carries no evidence a code
    // was sent, so it must not be rendered as if it did.
    render(<LoginPage />);
    await submitPassword({ requiresOtp: true, otpPhone: PHONE });

    await waitFor(() =>
      expect(screen.getByText(/We could not confirm the code was delivered/)).toBeTruthy(),
    );
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('never leaks the internal delivery vocabulary into the message', async () => {
    render(<LoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'uncertain',
    });
    await flush();

    expect(document.body.textContent).not.toContain('DELIVERY_TIMEOUT');
    expect(document.body.textContent).not.toContain('SMS_PROVIDER_NOT_CONFIGURED');
  });

  // ── Trust and failure paths stay intact ─────────────────────────

  it('signs straight through when the device is already trusted', async () => {
    render(<LoginPage />);
    await submitPassword({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
    });

    await waitFor(() => expect(ctl.fetchProfile).toHaveBeenCalled());
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(ctl.requestOtp).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('scs_last_email')).toBe('buyer@test.com');
  });

  it('does not pretend a code exists when the password was wrong', async () => {
    render(<LoginPage />);
    await submitPassword(new Error('Invalid credentials'));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeTruthy());
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('sends exactly one OTP request for two rapid clicks', async () => {
    let release: (value: unknown) => void = () => {};
    ctl.requestOtp.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
    fireEvent.change(screen.getByPlaceholderText(PHONE_FIELD), { target: { value: PHONE } });

    const send = screen.getByRole('button', { name: /Send via SMS/ });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(ctl.requestOtp).toHaveBeenCalledTimes(1);

    release({ success: true, deliveryStatus: 'SENT' });
    await waitFor(() => expect(screen.getByText(/Code sent via SMS/)).toBeTruthy());
  });

  it('reports rate limiting instead of retrying into a closed window', async () => {
    ctl.requestOtp.mockRejectedValue(new FakeLoginRateLimitError('Too many requests', 0, 120));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
    fireEvent.change(screen.getByPlaceholderText(PHONE_FIELD), { target: { value: PHONE } });
    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));

    await waitFor(() => expect(screen.getByText('Too many requests')).toBeTruthy());
    expect(ctl.requestOtp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });
});
