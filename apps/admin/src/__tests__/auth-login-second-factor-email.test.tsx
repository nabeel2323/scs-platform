import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Admin login — the PASSWORD second factor must follow the channel the server
 * actually used (email-only staging release, requirement 10).
 *
 * Two defects this file exists to catch:
 *
 *  1. `apps/admin/src/lib/auth.ts` mapped the login response to
 *     `{ requiresOtp, otpPhone, otpDelivery }` and discarded `otpEmail`, even
 *     though `LoginPasswordResponseSchema` already carries it. The channel the
 *     challenge was issued on was therefore invisible to the page.
 *  2. `handlePasswordLogin` unconditionally did `setPhone(result.otpPhone);
 *     setMode('otp')`. Under `OTP_CHANNELS=email` the backend now sends the
 *     second factor by email for any account that has an address, so the admin
 *     was shown a PHONE prompt for a challenge stored under an EMAIL key —
 *     a code that can never be verified from that form.
 *
 * These tests run the REAL admin auth lib and the REAL page. Only the network
 * edge (`fetch`) and `next/navigation` are replaced, so the assertions cover the
 * actual wire contract rather than a mocked return value.
 *
 * Vitest core matchers only — jest-dom is not installed in this app.
 */

const { ctl } = vi.hoisted(() => ({
  ctl: { push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import AdminLoginPage from '@/app/auth/login/page';
import { loginPassword } from '@/lib/auth';

const EMAIL = 'admin@example.com';
const MASKED_EMAIL = 'a***n@example.com';
const PHONE = '+966500000009';
const EMAIL_FIELD = 'admin@example.com';
const PHONE_FIELD = '+966 5XX XXX XXXX';
const PASSWORD_FIELD = '••••••••••••';
const OTP_FIELD = '123456';

/** Minimal Response shape consumed by the admin auth lib. */
function fakeRes(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

let passwordAnswer: unknown;
let emailVerifyAnswer: unknown;
let phoneVerifyAnswer: unknown;
let meAnswer: unknown;

const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit): Promise<unknown> => {
  const u = String(url);
  if (u.includes('/v1/auth/login/password')) return passwordAnswer;
  if (u.includes('/v1/auth/otp/email/verify')) return emailVerifyAnswer;
  if (u.includes('/v1/auth/otp/verify')) return phoneVerifyAnswer;
  if (u.endsWith('/v1/me')) return meAnswer;
  throw new Error(`Unexpected fetch in second-factor test: ${u}`);
});

function callsTo(path: string): Array<[string, RequestInit | undefined]> {
  return fetchMock.mock.calls
    .filter(([u]) => String(u).includes(path))
    .map(([u, init]) => [String(u), init as RequestInit | undefined]);
}

/** Sign in with a password and let the server's challenge answer drive the UI. */
async function submitPassword() {
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: EMAIL } });
  fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), { target: { value: 'correct-horse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await waitFor(() => expect(callsTo('/v1/auth/login/password').length).toBe(1));
}

describe('Admin login — password second factor on the email channel', () => {
  beforeEach(() => {
    ctl.push.mockReset();
    fetchMock.mockClear();
    window.localStorage.clear();
    passwordAnswer = fakeRes({
      requiresOtp: true,
      otpEmail: MASKED_EMAIL,
      otpDelivery: 'accepted',
    });
    emailVerifyAnswer = fakeRes({ accessToken: 'access-123', refreshToken: 'refresh-123' });
    phoneVerifyAnswer = fakeRes({ accessToken: 'access-456', refreshToken: 'refresh-456' });
    meAnswer = fakeRes({
      id: 'u1',
      phone: '',
      fullName: 'Root Admin',
      role: 'SUPER_ADMIN',
      perms: [],
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // ── The lib must not hide which channel carried the challenge ───

  it('carries otpEmail through loginPassword instead of discarding it', async () => {
    const result = await loginPassword(EMAIL, 'correct-horse', 'device-1');

    expect(result).toMatchObject({ requiresOtp: true, otpEmail: MASKED_EMAIL });
  });

  it('does not invent a phone number for an email challenge', async () => {
    const result = await loginPassword(EMAIL, 'correct-horse', 'device-1');

    expect((result as { otpPhone?: string }).otpPhone || '').toBe('');
  });

  // ── The page must render the form that can actually verify it ───

  it('shows email code entry, not a phone prompt, when the factor went by email', async () => {
    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText(`A code is on its way to ${EMAIL}. Enter it below.`)).toBeTruthy(),
    );
    expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy();
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    expect(screen.queryByText(/Code sent to \+/)).toBeNull();
    expect(document.body.textContent).not.toContain('sent to your phone');
    // No extra request was spent: the server already sent the challenge.
    expect(callsTo('/v1/auth/otp/request')).toHaveLength(0);
    expect(callsTo('/v1/auth/otp/email/request')).toHaveLength(0);
  });

  it('verifies the emailed factor on the EMAIL endpoint and never the phone one', async () => {
    render(<AdminLoginPage />);
    await submitPassword();
    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(callsTo('/v1/auth/otp/email/verify').length).toBe(1));
    const [, init] = callsTo('/v1/auth/otp/email/verify')[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.email).toBe(EMAIL);
    expect(body.otp).toBe('246810');
    expect(callsTo('/v1/auth/otp/verify')).toHaveLength(0);
    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));
  });

  // ── Requirement 8: never claim delivery the server did not confirm ──

  it('claims nothing when the server could not confirm the email send', async () => {
    passwordAnswer = fakeRes({
      requiresOtp: true,
      otpEmail: MASKED_EMAIL,
      otpDelivery: 'uncertain',
    });
    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText(`If a code arrived for ${EMAIL}, enter it below.`)).toBeTruthy(),
    );
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
    // The code may still arrive, so entry stays reachable.
    expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy();
  });

  it('fails closed when the response carries no delivery answer at all', async () => {
    // A build that predates `otpDelivery` provides no evidence a send happened.
    passwordAnswer = fakeRes({ requiresOtp: true, otpEmail: MASKED_EMAIL });
    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText(`If a code arrived for ${EMAIL}, enter it below.`)).toBeTruthy(),
    );
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(document.body.textContent).not.toContain('DELIVERY_TIMEOUT');
    expect(document.body.textContent).not.toContain('SMTP_PROVIDER_NOT_CONFIGURED');
  });

  // ── Requirement 11: the preserved phone path must still work ────

  it('still uses the phone form when a later phase sends the factor by SMS', async () => {
    passwordAnswer = fakeRes({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'accepted',
    });
    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(callsTo('/v1/auth/otp/verify').length).toBe(1));
    const [, init] = callsTo('/v1/auth/otp/verify')[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.phone).toBe(PHONE);
    expect(body.otp).toBe('135790');
    expect(callsTo('/v1/auth/otp/email/verify')).toHaveLength(0);
  });
});