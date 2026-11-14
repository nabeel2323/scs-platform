import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Admin login — EMAIL-ONLY channel readiness (initial staging release).
 *
 * The backend allowlists EMAIL (`OTP_CHANNELS=email`) and refuses the phone
 * route with SMS_CHANNEL_DISABLED before any provider is touched. The admin
 * client must not offer a choice this release refuses:
 *
 *   - no user-initiated phone affordance ("Use phone number instead", phone
 *     input, or a "Change number" escape that re-opens a phone SEND) is
 *     reachable while PHONE_OTP_UI_ENABLED is false (its default);
 *   - a full email journey never fetches the phone route /v1/auth/otp/request;
 *   - email OTP request → verify signs in and hydrates the role from /v1/me;
 *   - the password second factor renders the EMAIL code-entry form for both an
 *     email-only account and a dual-identifier (email AND phone) account,
 *     because under the email-only allowlist the server sends email in both
 *     cases (otpPhone is absent, otpEmail carries the masked address);
 *   - a SERVER-ISSUED phone challenge still renders a working phone VERIFY step
 *     (hiding user-initiated selection must not trap the admin), but without a
 *     user-initiated re-send affordance;
 *   - rejected / uncertain / unavailable deliveries get honest copy: only an
 *     accepted send may be described as sent, and nothing tells the admin to
 *     enable SMS in an email-only environment.
 *
 * Harness conventions match auth-login-email-otp.test.tsx: the REAL admin auth
 * lib runs against a stubbed global fetch routed by URL; only next/navigation
 * is mocked. Vitest core matchers only — jest-dom is not installed here.
 */

const { ctl } = vi.hoisted(() => ({
  ctl: { push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import AdminLoginPage from '@/app/auth/login/page';

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

/** Per-test wire answers, routed by URL. */
let passwordAnswer: unknown;
let emailRequestAnswer: unknown;
let emailVerifyAnswer: unknown;
let phoneRequestAnswer: unknown;
let phoneVerifyAnswer: unknown;
let meAnswer: unknown;

const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit): Promise<unknown> => {
  const u = String(url);
  if (u.includes('/v1/auth/login/password')) return passwordAnswer;
  if (u.includes('/v1/auth/otp/email/request')) return emailRequestAnswer;
  if (u.includes('/v1/auth/otp/email/verify')) return emailVerifyAnswer;
  // The phone routes are answered only so an accidental call is OBSERVABLE
  // (and fails the no-phone-fetch assertions) instead of throwing.
  if (u.includes('/v1/auth/otp/request')) return phoneRequestAnswer;
  if (u.includes('/v1/auth/otp/verify')) return phoneVerifyAnswer;
  if (u.endsWith('/v1/me')) return meAnswer;
  throw new Error(`Unexpected fetch in email-only-channels test: ${u}`);
});

function callsTo(path: string): Array<[string, RequestInit | undefined]> {
  return fetchMock.mock.calls
    .filter(([u]) => String(u).includes(path))
    .map(([u, init]) => [String(u), init as RequestInit | undefined]);
}

async function toEmailRequestStage() {
  fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: EMAIL } });
}

async function submitEmailSend() {
  fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));
  await waitFor(() => expect(callsTo('/v1/auth/otp/email/request').length).toBe(1));
}

async function submitPassword() {
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: EMAIL } });
  fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), { target: { value: 'correct-horse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await waitFor(() => expect(callsTo('/v1/auth/login/password').length).toBe(1));
}

/** No user-initiated phone affordance may be on screen. */
function expectNoPhoneAffordance() {
  expect(screen.queryByRole('button', { name: 'Use phone number instead' })).toBeNull();
  expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
  expect(screen.queryByRole('button', { name: /Send OTP/ })).toBeNull();
}

describe('Admin login — email-only channels (PHONE_OTP_UI_ENABLED default false)', () => {
  beforeEach(() => {
    ctl.push.mockReset();
    fetchMock.mockClear();
    window.localStorage.clear();
    passwordAnswer = fakeRes({
      requiresOtp: true,
      otpEmail: MASKED_EMAIL,
      otpDelivery: 'accepted',
    });
    emailRequestAnswer = fakeRes({ success: true, deliveryStatus: 'delivered' });
    emailVerifyAnswer = fakeRes({ accessToken: 'access-123', refreshToken: 'refresh-123' });
    phoneRequestAnswer = fakeRes({ success: true, deliveryStatus: 'delivered' });
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

  // ── 1. No user-initiated phone selection anywhere ───────────────

  it('offers no phone affordance on any view reachable by clicking', async () => {
    render(<AdminLoginPage />);
    expectNoPhoneAffordance();

    // Every tab and cross-link an admin can click, in both directions.
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    expectNoPhoneAffordance();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Email/Password' }));
    expectNoPhoneAffordance();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with OTP' }));
    expectNoPhoneAffordance();
    fireEvent.click(screen.getByRole('button', { name: 'Email/Password' }));
    expectNoPhoneAffordance();

    // No click spent a phone request.
    expect(callsTo('/v1/auth/otp/request')).toHaveLength(0);
  });

  // ── 2. The full email journey never touches the phone route ─────

  it('signs in via email request → verify, hydrates the role from /v1/me, and never fetches the phone endpoint', async () => {
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();
    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expectNoPhoneAffordance();

    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));
    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));

    expect(callsTo('/v1/auth/otp/email/request')).toHaveLength(1);
    expect(callsTo('/v1/auth/otp/email/verify')).toHaveLength(1);
    expect(callsTo('/v1/auth/otp/request')).toHaveLength(0);
    expect(callsTo('/v1/auth/otp/verify')).toHaveLength(0);

    const user = JSON.parse(window.localStorage.getItem('scs_admin_user') || '{}');
    expect(user.role).toBe('SUPER_ADMIN');
    expect(user.id).toBe('u1');
    const session = JSON.parse(window.localStorage.getItem('scs_admin_session') || '{}');
    expect(session.accessToken).toBe('access-123');
    expect(window.localStorage.getItem('scs_last_email')).toBe(EMAIL);
  });

  // ── 3. Password second factor: email-only AND dual-identifier ───

  it('renders the EMAIL code-entry form for an email-only account', async () => {
    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText(`A code is on its way to ${EMAIL}. Enter it below.`)).toBeTruthy(),
    );
    expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy();
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    expect(document.body.textContent).not.toContain('sent to your phone');
  });

  it('renders the EMAIL form for a dual-identifier account (email AND phone) because the allowlist sends email', async () => {
    // The account has both identifiers, but under OTP_CHANNELS=email the API
    // answers with the masked otpEmail and NO otpPhone (identity.service only
    // sets otpPhone when the challenge actually went by phone).
    meAnswer = fakeRes({
      id: 'u1',
      phone: PHONE,
      fullName: 'Root Admin',
      role: 'SUPER_ADMIN',
      perms: [],
    });
    passwordAnswer = fakeRes({
      requiresOtp: true,
      otpEmail: MASKED_EMAIL,
      otpDelivery: 'accepted',
    });
    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText(`A code is on its way to ${EMAIL}. Enter it below.`)).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    expect(screen.queryByText(/Code sent to \+/)).toBeNull();
    expect(document.body.textContent).not.toContain('sent to your phone');

    // The emailed factor verifies on the EMAIL endpoint with the full address.
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));
    await waitFor(() => expect(callsTo('/v1/auth/otp/email/verify').length).toBe(1));
    const [, init] = callsTo('/v1/auth/otp/email/verify')[0]!;
    expect(JSON.parse(String(init?.body)).email).toBe(EMAIL);
    expect(callsTo('/v1/auth/otp/verify')).toHaveLength(0);
    expect(callsTo('/v1/auth/otp/request')).toHaveLength(0);
    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));
  });

  // ── 4. Server-issued phone challenge: verify works, re-send hidden ──

  it('still verifies a server-issued phone challenge but offers no user-initiated phone re-send', async () => {
    passwordAnswer = fakeRes({
      requiresOtp: true,
      otpPhone: PHONE,
      otpDelivery: 'accepted',
    });
    render(<AdminLoginPage />);
    await submitPassword();

    // The VERIFY step must render even with the flag false — otherwise the
    // admin holds a challenge no form can answer.
    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());
    expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy();
    // "Change number" would re-open the phone REQUEST form (a user-initiated
    // SMS send this release refuses), so it must not be offered.
    expect(screen.queryByRole('button', { name: 'Change number' })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));
    await waitFor(() => expect(callsTo('/v1/auth/otp/verify').length).toBe(1));
    expect(callsTo('/v1/auth/otp/request')).toHaveLength(0);
    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));
  });

  // ── 5. Honesty rules on the email channel ───────────────────────

  it('says nothing was sent when the provider rejected the email send', async () => {
    emailRequestAnswer = fakeRes({ success: false, deliveryStatus: 'DELIVERY_FAILED' });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(
        screen.getByText(`The code couldn't be sent to ${EMAIL}. Check the address and try again.`),
      ).toBeTruthy(),
    );
    expect(screen.queryByPlaceholderText(OTP_FIELD)).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('does not claim delivery after an ambiguous email timeout', async () => {
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
    expect(screen.queryByPlaceholderText(OTP_FIELD)).toBeNull();
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('never tells the admin to enable SMS when a channel is unavailable', async () => {
    emailRequestAnswer = fakeRes({ success: false, deliveryStatus: 'EMAIL_CHANNEL_DISABLED' });
    render(<AdminLoginPage />);
    await toEmailRequestStage();
    await submitEmailSend();

    await waitFor(() =>
      expect(screen.getByText(/isn't available in this environment, so nothing was sent/)).toBeTruthy(),
    );
    expect(document.body.textContent).not.toContain('SMS');
    expect(document.body.textContent).not.toContain('enable the SMS provider');
    expect(screen.queryByText(/on its way/)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });
});