import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * S1.38.2 §2 — Email OTP login tab.
 *
 * Covers the third authentication tab added in S1.35 / wired to Web in S1.38:
 * request → verify → session established, invalid/expired OTP, network
 * failure, rate-limit retry guidance, duplicate-submit prevention, and
 * proof that the two existing tabs still work.
 *
 * Follows the auth-login-channel.test.tsx convention: RTL + Vitest core
 * matchers only (jest-dom is not installed in this app), and every external
 * boundary is mocked at the module level.
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

// Several cases below prove the preserved Phone OTP tab still works (the dormant
// path a future SMS phase re-enables). The email-only release hides it behind
// PHONE_OTP_UI_ENABLED=false, so mock the flag true to keep those cases green.
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

async function toEmailOtpTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
}

async function submitEmailOtpRequest(email = 'buyer@test.com') {
  await toEmailOtpTab();
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: /Send code to email/ }));
}

/** The page flips `emailOtpStage` after the awaited request resolves. */
async function waitForEmailVerifyStage() {
  await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());
}

describe('Login — Email OTP tab (S1.38.2)', () => {
  beforeEach(() => {
    ctl.requestOtp.mockReset();
    ctl.verifyOtp.mockReset();
    ctl.requestEmailOtp.mockReset();
    ctl.verifyEmailOtp.mockReset();
    ctl.loginPassword.mockReset();
    // The page must never call this (finding S-2 removed the mount probe); the
    // spy exists so login-device-trust.test.tsx can prove it stays uncalled.
    ctl.checkDeviceLogin.mockReset();
    ctl.fetchProfile.mockReset().mockResolvedValue({ organizations: [{ id: 'o1' }] });
    ctl.routerPush.mockReset();
    // localStorage in jsdom persists across tests unless cleared.
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Email OTP tab alongside Password and Phone OTP', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Email/Password' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Phone OTP' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email OTP' })).toBeTruthy();
  });

  it('selecting the Email OTP tab reveals the email-address request form', async () => {
    render(<LoginPage />);
    await toEmailOtpTab();
    expect(screen.getByPlaceholderText(EMAIL_FIELD)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send code to email/ })).toBeTruthy();
    // Password tab form fields are no longer rendered.
    expect(screen.queryByPlaceholderText('••••••••••••')).toBeNull();
    // S1.38.2 regression: the Phone OTP form must not render alongside it.
    expect(screen.queryByPlaceholderText('+966 5XX XXX XXXX')).toBeNull();
    expect(screen.queryByText('Phone number')).toBeNull();
  });

  it('selecting the Phone OTP tab does not render the Email OTP form', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
    expect(screen.getByPlaceholderText('+966 5XX XXX XXXX')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Send code to email/ })).toBeNull();
  });

  it('submits the entered email to requestEmailOtp and transitions to the verify stage', async () => {
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');

    await waitFor(() => expect(ctl.requestEmailOtp).toHaveBeenCalledWith('buyer@test.com'));
    await waitFor(() =>
      expect(screen.getByText(/Code sent to/)).toBeTruthy(),
    );
    // Only the verify form is rendered at this stage — no phone form.
    expect(screen.queryByPlaceholderText('+966 5XX XXX XXXX')).toBeNull();
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
  });

  it('a successful verify establishes a session and navigates after profile fetch', async () => {
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.verifyEmailOtp.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
    });
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');
    await waitForEmailVerifyStage();

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(ctl.verifyEmailOtp).toHaveBeenCalledWith('buyer@test.com', '123456'),
    );
    // Confirmation screen shown while the redirect timer is pending.
    await waitFor(() =>
      expect(screen.getByText(/Signed in successfully/)).toBeTruthy(),
    );
    // The tab strip disappears once the session is established.
    expect(screen.queryByRole('button', { name: 'Email OTP' })).toBeNull();
    await waitFor(() => expect(ctl.routerPush).toHaveBeenCalledTimes(1), { timeout: 1200 });
  });

  it('surfaces an invalid-OTP error message returned by the API', async () => {
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.verifyEmailOtp.mockRejectedValue(new Error('Email OTP verify failed: 401'));
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');
    await waitForEmailVerifyStage();

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(screen.getByText(/Email OTP verify failed: 401/)).toBeTruthy(),
    );
    // Remains on the verify stage so the code can be corrected.
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
  });

  it('surfaces an expired-OTP error message returned by the API', async () => {
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    ctl.verifyEmailOtp.mockRejectedValue(new Error('OTP expired'));
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');
    await waitForEmailVerifyStage();

    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(screen.getByText(/OTP expired/)).toBeTruthy());
  });

  it('handles network failure (thrown Error) with an actionable message', async () => {
    ctl.requestEmailOtp.mockRejectedValue(new Error('Network error'));
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');

    await waitFor(() => expect(screen.getByText(/Network error/)).toBeTruthy());
  });

  it('surfaces rate limit with the retry-after countdown', async () => {
    ctl.requestEmailOtp.mockRejectedValue(
      new FakeLoginRateLimitError('Too many requests', 0, 120),
    );
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');

    await waitFor(() => expect(screen.getByText('Too many requests')).toBeTruthy());
    expect(screen.getByText(/Try again in 2 min/)).toBeTruthy();
  });

  it('prevents duplicate submission while the request is in-flight', async () => {
    let resolve: (v: { success: boolean }) => void = () => {};
    ctl.requestEmailOtp.mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');

    // Button label flips to "Sending code..." and is disabled; a second click
    // does not produce a second request.
    const sendButton = screen.getByRole('button', { name: /Sending code/ });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sendButton);
    expect(ctl.requestEmailOtp).toHaveBeenCalledTimes(1);

    resolve({ success: true });
    await waitFor(() => expect(screen.getByText(/Code sent to/)).toBeTruthy());
  });

  it('Change email returns to the request stage with the email preserved', async () => {
    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');
    await waitForEmailVerifyStage();

    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Send code to email/ })),
    );
    const emailInput = screen.getByPlaceholderText(EMAIL_FIELD) as HTMLInputElement;
    expect(emailInput.value).toBe('buyer@test.com');
  });

  it('reaching the verify stage from a stale Phone OTP session shows only the email form', async () => {
    // Password login on an untrusted device leaves otpStage === 'verify'; the
    // Email OTP tab must not inherit that phone verify panel.
    // otpDelivery 'accepted' is what the API reports when its own send was
    // accepted — without it the page correctly refuses to claim a code was sent.
    ctl.loginPassword.mockResolvedValue({
      requiresOtp: true,
      otpPhone: '+966500000009',
      otpDelivery: 'accepted',
    });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: 'buyer@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() =>
      expect(screen.getByText(/Enter the OTP sent to your phone/)).toBeTruthy(),
    );

    ctl.requestEmailOtp.mockResolvedValue({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    expect(screen.queryByPlaceholderText('+966 5XX XXX XXXX')).toBeNull();
    expect(screen.getByPlaceholderText(EMAIL_FIELD)).toBeTruthy();
  });

  it('existing password tab still reaches loginPassword', async () => {
    ctl.loginPassword.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
    });
    render(<LoginPage />);
    // Password tab is the default.
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: 'buyer@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() =>
      expect(ctl.loginPassword).toHaveBeenCalledWith(
        'buyer@test.com',
        'hunter2',
        'test-device',
      ),
    );
  });

  it('existing Phone OTP tab still reaches requestOtp with the selected channel', async () => {
    ctl.requestOtp.mockResolvedValue({ success: true, deliveryStatus: 'SENT' });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
    fireEvent.change(screen.getByPlaceholderText('+966 5XX XXX XXXX'), {
      target: { value: '+966500000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send via SMS/ }));

    await waitFor(() =>
      expect(ctl.requestOtp).toHaveBeenCalledWith('+966500000000', 'sms'),
    );
  });

  it('switching tabs clears the prior tab\'s error and resets email-OTP stage', async () => {
    ctl.requestEmailOtp.mockRejectedValue(new Error('boom'));
    render(<LoginPage />);
    await submitEmailOtpRequest('buyer@test.com');
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());

    // Switching to Phone OTP clears the error and the mode is not stuck.
    fireEvent.click(screen.getByRole('button', { name: 'Phone OTP' }));
    expect(screen.queryByText('boom')).toBeNull();
    expect(screen.getByPlaceholderText('+966 5XX XXX XXXX')).toBeTruthy();

    // Switching back to Email OTP returns to the request stage.
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    expect(screen.getByRole('button', { name: /Send code to email/ })).toBeTruthy();
  });
});
