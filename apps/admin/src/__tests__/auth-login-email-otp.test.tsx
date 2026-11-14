import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEVICE_TRUST_PROOF_HEADER, DEVICE_TRUST_PROOF_VALUE } from '@scs/contracts';

/**
 * Admin login — EMAIL OTP is the default OTP path (email-only staging release).
 *
 * The release permits EMAIL OTP only; the phone/SMS code is preserved for a
 * later phase but must not be the default. These tests run the REAL admin auth
 * lib against a stubbed global fetch (only next/navigation is mocked), so the
 * assertions cover the actual wire contract:
 *
 *   - the default OTP request hits POST /v1/auth/otp/email/request with { email }
 *     and NEVER the phone route /v1/auth/otp/request;
 *   - every request response is classified by the real @scs/contracts
 *     classifier: only success:true advances to code entry, and the four
 *     outcomes get distinct, honest copy (the audited defect class);
 *   - verify posts to /v1/auth/otp/email/verify with the device-trust transport
 *     (credentials included + proof header), hydrates the admin role from
 *     GET /v1/me and persists the session;
 *   - 429 surfaces as the rate-limit lockout UI; 404 (server feature flag off)
 *     says email sign-in is not enabled in this environment.
 *
 * Uses only Vitest core matchers (jest-dom is not installed in this app).
 */

const { ctl } = vi.hoisted(() => ({
  ctl: { push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import AdminLoginPage from '@/app/auth/login/page';
// Namespace import on purpose: while the email functions do not exist yet the
// RED failure is "not a function" (missing behaviour), not a module link error.
import * as adminAuth from '@/lib/auth';

const EMAIL = 'admin@example.com';
const EMAIL_FIELD = 'admin@example.com';

/** Minimal Response shape consumed by the auth lib (ok/status/json/headers.get). */
function fakeRes(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): unknown {
  const normalized = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => normalized.get(name.toLowerCase()) ?? null },
  };
}

/** Per-test wire answers, routed by URL. */
let emailRequestAnswer: unknown;
let emailVerifyAnswer: unknown;
let meAnswer: unknown;

const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit): Promise<unknown> => {
  const u = String(url);
  if (u.includes('/v1/auth/otp/email/request')) return emailRequestAnswer;
  if (u.includes('/v1/auth/otp/email/verify')) return emailVerifyAnswer;
  if (u.endsWith('/v1/me')) return meAnswer;
  throw new Error(`Unexpected fetch in email-OTP test: ${u}`);
});

function callsTo(path: string): Array<[string, RequestInit | undefined]> {
  return fetchMock.mock.calls
    .filter(([u]) => String(u).includes(path))
    .map(([u, init]) => [String(u), init as RequestInit | undefined]);
}

/** Move to the OTP tab (which must default to EMAIL) and type an address. */
async function toEmailRequestStage() {
  fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: EMAIL } });
}

async function submitEmailSend() {
  fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));
  await waitFor(() => expect(callsTo('/v1/auth/otp/email/request').length).toBe(1));
}

describe('Admin login — email OTP (default channel)', () => {
  beforeEach(() => {
    ctl.push.mockReset();
    fetchMock.mockClear();
    window.localStorage.clear();
    emailRequestAnswer = fakeRes({ success: true, deliveryStatus: 'delivered' });
    emailVerifyAnswer = fakeRes({ accessToken: 'access-123', refreshToken: 'refresh-123' });
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

  // ── 1. Email is the default OTP channel ─────────────────────────

  it('requests the OTP over EMAIL by default and never calls the phone route', async () => {
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    const [url, init] = callsTo('/v1/auth/otp/email/request')[0]!;
    expect(url).toContain('/v1/auth/otp/email/request');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ email: EMAIL });
    // The email-only release must not spend an SMS request by default.
    expect(callsTo('/v1/auth/otp/request')).toHaveLength(0);
  });

  // ── 2/3. Delivery outcomes: only success:true advances ──────────

  it('advances to code entry on success:true and says a code is on its way (never "delivered")', async () => {
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(screen.getByText(`A code is on its way to ${EMAIL}. Enter it below.`)).toBeTruthy(),
    );
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
    expect(document.body.textContent).not.toContain('delivered');
  });

  it('stays on the request step when the send was rejected, without claiming a code was sent', async () => {
    emailRequestAnswer = fakeRes({ success: false, deliveryStatus: 'DELIVERY_FAILED' });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(
        screen.getByText(`The code couldn't be sent to ${EMAIL}. Check the address and try again.`),
      ).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(screen.getByPlaceholderText(EMAIL_FIELD)).toBeTruthy();
  });

  it('treats an ambiguous email timeout as unconfirmed, offering code entry only as a choice', async () => {
    emailRequestAnswer = fakeRes({
      success: false,
      deliveryStatus: 'DELIVERY_TIMEOUT',
      possiblyDelivered: true,
    });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(
        screen.getByText(
          `We couldn't confirm that a code reached ${EMAIL}. It may still arrive — if it does, you can enter it below.`,
        ),
      ).toBeTruthy(),
    );
    // Stays on the request step; no automatic advance, no sent claim.
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();

    // The un-urged affordance exists because the code may have landed.
    fireEvent.click(screen.getByRole('button', { name: 'Enter it' }));
    await waitFor(() =>
      expect(screen.getByText(`If a code arrived for ${EMAIL}, enter it below.`)).toBeTruthy(),
    );
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(callsTo('/v1/auth/otp/email/request')).toHaveLength(1);
  });

  it('stops without a retry pitch when the email provider is not configured', async () => {
    emailRequestAnswer = fakeRes({
      success: false,
      deliveryStatus: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(
        screen.getByText(/isn't available in this environment, so nothing was sent/),
      ).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(screen.queryByText(/try again/i)).toBeNull();
    // Provider vocabulary stays off the screen.
    expect(document.body.textContent).not.toContain('EMAIL_PROVIDER_NOT_CONFIGURED');
    // The password path is offered instead of a pointless retry.
    expect(screen.getByText(/Sign in with email and password/)).toBeTruthy();
  });

  it('classifies EMAIL_CHANNEL_DISABLED as unavailable, not as a retryable rejection', async () => {
    emailRequestAnswer = fakeRes({
      success: false,
      deliveryStatus: 'EMAIL_CHANNEL_DISABLED',
    });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(
        screen.getByText(/isn't available in this environment, so nothing was sent/),
      ).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/Check the address and try again/)).toBeNull();
    expect(document.body.textContent).not.toContain('EMAIL_CHANNEL_DISABLED');
  });

  // ── 4. Verify establishes the session ───────────────────────────

  it('verifies via /v1/auth/otp/email/verify with device trust, hydrates the role from /v1/me and signs in', async () => {
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));

    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));

    const verifyCalls = callsTo('/v1/auth/otp/email/verify');
    expect(verifyCalls).toHaveLength(1);
    const [, init] = verifyCalls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.email).toBe(EMAIL);
    expect(body.otp).toBe('123456');
    expect(body.deviceId).toBe(window.localStorage.getItem('scs_device_id'));
    expect(body.deviceInfo.platform).toBe('admin-web');
    // Device-trust transport: the Set-Cookie enrolment is only honoured with
    // credentials included plus the proof header.
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)[DEVICE_TRUST_PROOF_HEADER]).toBe(
      DEVICE_TRUST_PROOF_VALUE,
    );

    // The role comes from GET /v1/me, not from the JWT.
    const meCalls = callsTo('/v1/me');
    expect(meCalls).toHaveLength(1);
    expect((meCalls[0]![1]?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer access-123',
    );
    const user = JSON.parse(window.localStorage.getItem('scs_admin_user') || '{}');
    expect(user.role).toBe('SUPER_ADMIN');
    expect(user.id).toBe('u1');
    const session = JSON.parse(window.localStorage.getItem('scs_admin_session') || '{}');
    expect(session.accessToken).toBe('access-123');
    expect(session.refreshToken).toBe('refresh-123');
    expect(window.localStorage.getItem('scs_last_email')).toBe(EMAIL);
    expect(callsTo('/v1/auth/otp/verify')).toHaveLength(0);
  });

  // ── 5. Rate limit and feature-flag-off environments ─────────────

  it('surfaces a 429 on the email request as the rate-limit lockout, not a sent claim', async () => {
    emailRequestAnswer = fakeRes({}, 429, {
      'X-RateLimit-Remaining': '0',
      'Retry-After': '45',
    });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() => expect(screen.getByText(/Locked temporarily/)).toBeTruthy());
    const button = screen.getByRole('button', { name: /Try again in 45s/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();

    // Submitting while locked is a no-op: the budget is respected.
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callsTo('/v1/auth/otp/email/request')).toHaveLength(1);
  });

  it('surfaces a 404 as "email sign-in not enabled in this environment"', async () => {
    emailRequestAnswer = fakeRes({ message: 'Not Found' }, 404);
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(screen.getByText(/not enabled in this environment/)).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();
  });

  it('surfaces a 429 on email verification as a rate-limit error', async () => {
    emailVerifyAnswer = fakeRes({}, 429, {
      'X-RateLimit-Remaining': '0',
      'Retry-After': '30',
    });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));

    await waitFor(() => expect(screen.getByText(/Locked temporarily/)).toBeTruthy());
    expect(ctl.push).not.toHaveBeenCalled();
  });
});

describe('Admin auth lib — email OTP wire contract', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    window.localStorage.clear();
    emailRequestAnswer = fakeRes({ success: true, deliveryStatus: 'delivered' });
    emailVerifyAnswer = fakeRes({ accessToken: 'a', refreshToken: 'r' });
    meAnswer = fakeRes({ id: 'u1', phone: '', fullName: 'Root Admin', role: 'SUPER_ADMIN' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requestEmailOtp returns the whole delivery outcome for the caller to classify', async () => {
    emailRequestAnswer = fakeRes({
      success: false,
      deliveryStatus: 'SMTP_NOT_CONFIGURED',
    });
    const result = await adminAuth.requestEmailOtp(EMAIL);
    expect(result).toEqual({ success: false, deliveryStatus: 'SMTP_NOT_CONFIGURED' });
  });

  it('requestEmailOtp maps 429 to LoginRateLimitError with header context', async () => {
    emailRequestAnswer = fakeRes({}, 429, {
      'X-RateLimit-Remaining': '2',
      'Retry-After': '12',
    });
    const err = await adminAuth.requestEmailOtp(EMAIL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(adminAuth.LoginRateLimitError);
    expect((err as InstanceType<typeof adminAuth.LoginRateLimitError>).remainingAttempts).toBe(2);
    expect((err as InstanceType<typeof adminAuth.LoginRateLimitError>).retryAfterSeconds).toBe(12);
  });

  it('requestEmailOtp maps 404 to a clear feature-flag message', async () => {
    emailRequestAnswer = fakeRes({}, 404);
    await expect(adminAuth.requestEmailOtp(EMAIL)).rejects.toThrow(
      /not enabled in this environment/,
    );
  });

  it('verifyEmailOtp maps 404 to the same feature-flag message', async () => {
    emailVerifyAnswer = fakeRes({}, 404);
    await expect(adminAuth.verifyEmailOtp(EMAIL, '123456')).rejects.toThrow(
      /not enabled in this environment/,
    );
  });

  it('verifyEmailOtp maps 429 to LoginRateLimitError', async () => {
    emailVerifyAnswer = fakeRes({}, 429, { 'Retry-After': '9' });
    const err = await adminAuth.verifyEmailOtp(EMAIL, '123456').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(adminAuth.LoginRateLimitError);
    expect((err as InstanceType<typeof adminAuth.LoginRateLimitError>).retryAfterSeconds).toBe(9);
  });
});