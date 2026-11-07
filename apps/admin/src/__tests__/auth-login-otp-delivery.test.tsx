import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Admin login — OTP delivery outcomes (audit finding: "Admin OTP delivery
 * failure is silently treated as success").
 *
 * The defect was that HTTP 200 was read as "code delivered". The API answers 200
 * for an unavailable provider, a rejected send and an ambiguous timeout alike,
 * so the admin console advanced to code entry and told the operator a code had
 * been sent when nothing had left the building. These tests lock the corrected
 * contract from the operator's point of view:
 *
 *   delivered   → code-entry step, and the sentence "Code sent to <number>";
 *   unavailable → STAYS on the number step, says delivery isn't configured,
 *                 and points at the password path;
 *   rejected    → STAYS on the number step with an actionable retry message;
 *   uncertain   → STAYS, and offers code entry only as an explicit, un-urged
 *                 choice, worded as "if a code arrived";
 *   password    → the server says whether its own challenge went out, and an
 *                 absent answer is treated as NOT confirmed (fail-closed).
 *
 * Also locked here: no duplicate in-flight sends, the retry affordance obeys the
 * rate limit, no provider vocabulary reaches the screen, and nothing probes the
 * unauthenticated device-check endpoint on mount (finding S-2).
 *
 * The real @scs/contracts classifier runs — mocking it would test the mock.
 * Uses only Vitest's core matchers (jest-dom is not installed in this app).
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
      push: vi.fn(),
    },
    FakeLoginRateLimitError,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.push, replace: vi.fn(), prefetch: vi.fn() }),
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

import AdminLoginPage from '@/app/auth/login/page';

const PHONE_FIELD = '+966 5XX XXX XXXX';
const EMAIL_FIELD = 'admin@example.com';
const PASSWORD_FIELD = '••••••••••••';
const PHONE = '+966500000000';

/** Move to the Phone OTP view and type a number.
 * Fixture updated for the email-only release: the OTP tab now defaults to
 * EMAIL, and the preserved phone path is reached via the explicit secondary
 * "Use phone number instead" choice. Assertions below are unchanged. */
async function toRequestStage() {
  fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use phone number instead' }));
  fireEvent.change(screen.getByPlaceholderText(PHONE_FIELD), { target: { value: PHONE } });
}

async function submitSend() {
  fireEvent.click(screen.getByRole('button', { name: /Send OTP/ }));
  await waitFor(() => expect(ctl.requestOtp).toHaveBeenCalled());
}

async function submitPassword(
  result: Record<string, unknown> | Error,
): Promise<void> {
  if (result instanceof Error) ctl.loginPassword.mockRejectedValue(result);
  else ctl.loginPassword.mockResolvedValue(result);
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: 'admin@x.com' } });
  fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: /^Login$/ }));
  await waitFor(() => expect(ctl.loginPassword).toHaveBeenCalled());
}

describe('Admin login — OTP delivery outcomes', () => {
  beforeEach(() => {
    ctl.requestOtp.mockReset();
    ctl.verifyOtp.mockReset();
    ctl.requestEmailOtp.mockReset();
    ctl.verifyEmailOtp.mockReset();
    ctl.loginPassword.mockReset();
    ctl.checkDeviceLogin.mockReset();
    ctl.push.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Nothing happens on mount ────────────────────────────────────

  it('does not probe the unauthenticated device-check endpoint on mount (S-2)', async () => {
    render(<AdminLoginPage />);
    // Give any effect-triggered request a chance to fire.
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy());
    expect(ctl.checkDeviceLogin).not.toHaveBeenCalled();
    expect(ctl.loginPassword).not.toHaveBeenCalled();
    expect(ctl.requestOtp).not.toHaveBeenCalled();
  });

  it('still prefills the last email on mount and nothing else', async () => {
    window.localStorage.setItem('scs_last_email', 'previous@example.com');
    render(<AdminLoginPage />);
    await waitFor(() =>
      expect((screen.getByPlaceholderText(EMAIL_FIELD) as HTMLInputElement).value).toBe(
        'previous@example.com',
      ),
    );
    expect(ctl.checkDeviceLogin).not.toHaveBeenCalled();
  });

  // ── Request stage: the four delivery outcomes ───────────────────

  it('advances to code entry only when the provider confirmed delivery', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true, deliveryStatus: 'delivered' });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
  });

  it('stops at the number step when the provider is not configured', async () => {
    ctl.requestOtp.mockResolvedValue({
      success: false,
      deliveryStatus: 'SMS_PROVIDER_NOT_CONFIGURED',
    });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    await waitFor(() =>
      expect(screen.getByText(/isn't configured in this environment, so nothing was sent/)).toBeTruthy(),
    );
    // No code entry, no "code sent" claim, and the password path is offered.
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy();
    expect(screen.getByText(/Sign in with email and password/)).toBeTruthy();
  });

  it('does not leak provider vocabulary into the message', async () => {
    ctl.requestOtp.mockResolvedValue({
      success: false,
      deliveryStatus: 'SMS_PROVIDER_NOT_CONFIGURED',
    });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    await waitFor(() => expect(screen.getByText(/nothing was sent/)).toBeTruthy());
    // The wire status is internal vocabulary; the operator sees plain language.
    expect(document.body.textContent).not.toContain('SMS_PROVIDER_NOT_CONFIGURED');
  });

  it('stops at the number step when the provider rejected the send', async () => {
    ctl.requestOtp.mockResolvedValue({ success: false, deliveryStatus: 'DELIVERY_FAILED' });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    await waitFor(() =>
      expect(screen.getByText(`The code couldn't be sent to ${PHONE}. Check the number and try again.`)).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('treats an ambiguous timeout as unconfirmed, not as success', async () => {
    ctl.requestOtp.mockResolvedValue({
      success: false,
      deliveryStatus: 'DELIVERY_TIMEOUT',
      possiblyDelivered: true,
    });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    // Stays on the request step (a retry is the caller's choice, not automatic).
    await waitFor(() => expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(
      screen.getByText(`We couldn't confirm that a code reached ${PHONE}. It may still arrive — if it does, you can enter it below.`),
    ).toBeTruthy();

    // The un-urged affordance exists precisely because the code may have landed.
    fireEvent.click(screen.getByRole('button', { name: 'Enter it' }));
    await waitFor(() =>
      expect(screen.getByText(`If a code arrived for ${PHONE}, enter it below.`)).toBeTruthy(),
    );
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(ctl.requestOtp).toHaveBeenCalledTimes(1);
  });

  it('does not re-spend the rate budget when the uncertain path enters a code', async () => {
    ctl.requestOtp.mockResolvedValue({
      success: false,
      deliveryStatus: 'DELIVERY_TIMEOUT',
      possiblyDelivered: true,
    });
    ctl.verifyOtp.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    fireEvent.click(screen.getByRole('button', { name: 'Enter it' }));
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));

    await waitFor(() =>
      expect(ctl.verifyOtp).toHaveBeenCalledWith(PHONE, '123456'),
    );
    expect(ctl.requestOtp).toHaveBeenCalledTimes(1);
    expect(ctl.push).toHaveBeenCalledWith('/');
  });

  // ── Duplicate-send protection ───────────────────────────────────

  it('sends exactly one request for two rapid clicks', async () => {
    let release: (value: { success: boolean; deliveryStatus: string }) => void = () => {};
    ctl.requestOtp.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<AdminLoginPage />);
    await toRequestStage();

    const send = screen.getByRole('button', { name: /Send OTP/ });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(ctl.requestOtp).toHaveBeenCalledTimes(1);

    release({ success: true, deliveryStatus: 'delivered' });
    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());
  });

  it('obeys the rate limit instead of offering a retry that cannot work', async () => {
    ctl.requestOtp.mockRejectedValue(new FakeLoginRateLimitError('Too many OTP requests.', 0, 45));
    render(<AdminLoginPage />);
    await toRequestStage();

    fireEvent.click(screen.getByRole('button', { name: /Send OTP/ }));
    await waitFor(() => expect(ctl.requestOtp).toHaveBeenCalledTimes(1));

    expect(screen.getByText(/Locked temporarily/)).toBeTruthy();
    const button = screen.getByRole('button', { name: /Try again in 45s/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    // Submitting the form while locked is a no-op: the budget is respected.
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ctl.requestOtp).toHaveBeenCalledTimes(1);
  });

  // ── Password path: the server answers for its own challenge ─────

  it('says a code was sent after a password login only when the server confirms it', async () => {
    render(<AdminLoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'accepted',
    });

    await waitFor(() =>
      expect(screen.getByText('New device detected. Enter the OTP sent to your phone to continue.')).toBeTruthy(),
    );
    expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy();
    expect(screen.queryByText(/couldn't confirm/)).toBeNull();
  });

  it('hedges a password-login challenge whose delivery the server could not confirm', async () => {
    render(<AdminLoginPage />);
    await submitPassword({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'uncertain',
    });

    await waitFor(() =>
      expect(
        screen.getByText('This device needs a second factor. We could not confirm the code was delivered, but you can enter it if it arrives.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText(`If a code arrived for ${PHONE}, enter it below.`)).toBeTruthy();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('treats a missing otpDelivery answer as unconfirmed (fail closed)', async () => {
    // An older API that predates the field cannot be read as "delivered":
    // claiming a delivery we know nothing about is the defect being removed.
    render(<AdminLoginPage />);
    await submitPassword({ requiresOtp: true, otpPhone: PHONE });

    await waitFor(() => expect(ctl.loginPassword).toHaveBeenCalled());
    expect(screen.getByText(/We could not confirm the code was delivered/)).toBeTruthy();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('preserves the trusted-device path: a password login returns a session directly', async () => {
    render(<AdminLoginPage />);
    await submitPassword({ accessToken: 'a', refreshToken: 'r' });

    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));
    expect(ctl.requestOtp).not.toHaveBeenCalled();
    expect(ctl.verifyOtp).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('scs_last_email')).toBe('admin@x.com');
  });

  it('preserves the pure phone-OTP path and its change-number escape hatch', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true, deliveryStatus: 'delivered' });
    render(<AdminLoginPage />);
    await toRequestStage();
    await submitSend();

    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Change number' }));
    await waitFor(() => expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy());
    // Returning to the request step clears the stale delivery claim.
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('surfaces a rejected password login without pretending a code exists', async () => {
    render(<AdminLoginPage />);
    await submitPassword(new Error('Invalid email or password'));

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(ctl.requestOtp).not.toHaveBeenCalled();
  });
});
