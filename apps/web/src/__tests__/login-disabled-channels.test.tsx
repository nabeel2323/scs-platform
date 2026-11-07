import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Email-only staging release — disabled channels must not be selectable.
 *
 * The backend `OTP_CHANNELS` allowlist permits email only; the router rejects a
 * public phone-channel request with `<CHANNEL>_CHANNEL_DISABLED` before any
 * provider is touched. The login page must therefore offer no user-initiated
 * path into phone OTP / SMS / WhatsApp: no Phone OTP tab, no channel radios, no
 * "Send via", no resend-via buttons, and no link that lands in a hidden mode.
 *
 * Exception locked here: when the SERVER issues a phone second factor during
 * password login (dual-identifier account), the phone verify form must still
 * render and verify — the user must not be trapped — but it must not offer
 * channel-switching affordances that lead to gated/blank screens.
 *
 * Convention: RTL + Vitest core matchers only (jest-dom is not installed).
 * Router and design tokens are mocked at module level; the REAL auth lib and
 * api client run against a stubbed global fetch routed by URL, so session
 * persistence and role hydration are exercised end to end, not mocked away.
 */

const { ctl } = vi.hoisted(() => ({
  ctl: { routerPush: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.routerPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }));

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
import { getUser, hasMerchantAccess } from '@/lib/auth';

const EMAIL_FIELD = 'you@example.com';
const PASSWORD_FIELD = '••••••••••••';
const PHONE_FIELD = '+966 5XX XXX XXXX';
const OTP_FIELD = '123456';
const BUYER_EMAIL = 'buyer@test.com';
const PHONE = '+966500000009';

const TOKENS = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresAt: Date.now() + 60_000,
};

function profileFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    phone: null,
    email: BUYER_EMAIL,
    fullName: 'Test Buyer',
    activeOrgId: 'o1',
    role: 'BUYER',
    perms: [],
    organizations: [{ id: 'o1' }],
    ...overrides,
  };
}

/**
 * URL-routed fetch stub. `bodies` overrides the JSON answer per endpoint key;
 * `calls` records every URL so tests can prove the phone endpoints were never
 * hit on the email journey.
 */
function stubApi(bodies: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const defaults: Record<string, unknown> = {
    'otp/email/request': { success: true },
    'otp/email/verify': TOKENS,
    'otp/request': { success: false, deliveryStatus: 'SMS_CHANNEL_DISABLED' },
    'otp/verify': TOKENS,
    'login/password': {
      requiresOtp: true,
      otpEmail: 'b***@test.com',
      otpDelivery: 'accepted',
    },
    me: profileFixture(),
    ...bodies,
  };
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    const key = Object.keys(defaults).find((k) => href.includes(`/v1/auth/${k}`) || (k === 'me' && href.endsWith('/v1/me')));
    if (!key) throw new Error(`Unexpected fetch in test: ${href}`);
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => defaults[key],
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

/** Assert no user-selectable phone/SMS/WhatsApp affordance is on screen. */
function expectNoPhoneAffordances() {
  expect(screen.queryByRole('button', { name: 'Phone OTP' })).toBeNull();
  expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
  expect(screen.queryByRole('radiogroup', { name: 'Delivery channel' })).toBeNull();
  expect(screen.queryByRole('radio', { name: 'SMS' })).toBeNull();
  expect(screen.queryByRole('radio', { name: 'WhatsApp' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Send via/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /Resend via/i })).toBeNull();
}

async function submitPassword() {
  fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
    target: { value: BUYER_EMAIL },
  });
  fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), {
    target: { value: 'hunter2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

describe('Web login — disabled channels are not selectable (email-only release)', () => {
  beforeEach(() => {
    ctl.routerPush.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── No entry point into the disabled channel ────────────────────

  it('lands on a supported mode and offers no phone affordance on the password tab', () => {
    stubApi();
    render(<LoginPage />);

    // Default is password with email OTP clearly offered (never phone).
    expect(screen.getByPlaceholderText(PASSWORD_FIELD)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sign in with email OTP/i })).toBeTruthy();
    expectNoPhoneAffordances();
  });

  it('offers no phone affordance on the email OTP tab either', () => {
    stubApi();
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));

    expect(screen.getByRole('button', { name: 'Send code to email' })).toBeTruthy();
    expectNoPhoneAffordances();
  });

  it('renders no button or link that names a disabled channel in any reachable mode', () => {
    stubApi();
    render(<LoginPage />);
    const modes: Array<() => void> = [
      () => {},
      () => fireEvent.click(screen.getByRole('button', { name: 'Email OTP' })),
      () => fireEvent.click(screen.getByRole('button', { name: 'Email/Password' })),
    ];
    for (const enter of modes) {
      enter();
      const offenders = screen
        .getAllByRole('button')
        .filter((b) => /phone|sms|whatsapp/i.test(b.textContent || ''));
      expect(offenders.map((b) => b.textContent)).toEqual([]);
    }
  });

  // ── The email-only journey works end to end ─────────────────────

  it('email OTP request → verify establishes a session, hydrates the role and redirects', async () => {
    const { calls } = stubApi({ me: profileFixture({ role: 'MERCHANT_OWNER', perms: ['orders:read'] }) });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: BUYER_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.getByText(/Code sent to/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(screen.getByText(/Signed in successfully/)).toBeTruthy());
    // Real lib persisted the session and hydrated the projected role.
    expect(window.localStorage.getItem('scs_web_session')).toBeTruthy();
    expect(getUser()?.role).toBe('MERCHANT_OWNER');
    expect(hasMerchantAccess()).toBe(true);
    // Only email endpoints were used — never the phone request/verify pair.
    expect(calls.some((u) => u.endsWith('/v1/auth/otp/request'))).toBe(false);
    expect(calls.some((u) => u.endsWith('/v1/auth/otp/verify'))).toBe(false);
    await waitFor(() => expect(ctl.routerPush).toHaveBeenCalledWith('/'), { timeout: 1500 });
  });

  it('the same flow routes a brand-new merchant account to registration', async () => {
    stubApi({ me: profileFixture({ organizations: [], activeOrgId: null, role: null }) });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: BUYER_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));
    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(
      () => expect(ctl.routerPush).toHaveBeenCalledWith('/merchant/register'),
      { timeout: 1500 },
    );
  });

  // ── Delivery outcomes never fake a send ─────────────────────────

  it.each([
    ['rejected', { success: false, deliveryStatus: 'PROVIDER_ERROR' }, /couldn't be sent/i],
    ['unavailable', { success: false, deliveryStatus: 'EMAIL_CHANNEL_DISABLED' }, /nothing was sent/i],
  ])('a %s email delivery shows an error and never a code-sent claim', async (_label, body, message) => {
    stubApi({ 'otp/email/request': body });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: BUYER_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    await waitFor(() => expect(screen.getByText(message as RegExp)).toBeTruthy());
    expect(screen.queryByText(/Code sent to/)).toBeNull();
    expect(screen.queryByPlaceholderText(OTP_FIELD)).toBeNull();
  });

  it('an uncertain email delivery offers code entry without claiming a send', async () => {
    stubApi({
      'otp/email/request': { success: false, possiblyDelivered: true, deliveryStatus: 'DELIVERY_TIMEOUT' },
    });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: BUYER_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent to/)).toBeNull();
    expect(screen.getByText(/could not confirm delivery/i)).toBeTruthy();
  });
});

describe('Web login — password second factor under the email-only release', () => {
  beforeEach(() => {
    ctl.routerPush.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('delivers the second factor to email with honest messaging and verifies via the email endpoint', async () => {
    const { calls } = stubApi();
    render(<LoginPage />);
    await submitPassword();

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.getByText(/Enter the code sent to your email/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    expectNoPhoneAffordances();

    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(screen.getByText(/Signed in successfully/)).toBeTruthy());
    expect(calls.some((u) => u.endsWith('/v1/auth/otp/email/verify'))).toBe(true);
    expect(calls.some((u) => u.endsWith('/v1/auth/otp/verify'))).toBe(false);
    expect(getUser()?.email).toBe(BUYER_EMAIL);
  });

  it('does not claim delivery when the server could not confirm the email send', async () => {
    stubApi({
      'login/password': { requiresOtp: true, otpEmail: 'b***@test.com', otpDelivery: 'uncertain' },
    });
    render(<LoginPage />);
    await submitPassword();

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent to/)).toBeNull();
    expect(screen.getByText(/could not confirm the code was delivered/i)).toBeTruthy();
  });

  // ── Server-issued phone challenge: render, verify, no dead ends ──

  it('still renders and verifies a phone challenge the SERVER issued, without channel-switch affordances', async () => {
    const { calls } = stubApi({
      'login/password': { requiresOtp: true, otpPhone: PHONE, otpDelivery: 'accepted' },
    });
    render(<LoginPage />);
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText(`Code sent via SMS to ${PHONE}`)).toBeTruthy(),
    );
    // The user is not trapped: code entry works through the phone endpoint.
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(screen.getByText(/Signed in successfully/)).toBeTruthy());
    expect(calls.some((u) => u.endsWith('/v1/auth/otp/verify'))).toBe(true);
  });

  it('a server phone challenge offers no resend/channel buttons and keeps an escape to a supported mode', async () => {
    stubApi({
      'login/password': { requiresOtp: true, otpPhone: PHONE, otpDelivery: 'accepted' },
    });
    render(<LoginPage />);
    await submitPassword();

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    // No affordance may lead back to the gated phone request form.
    expect(screen.queryByRole('button', { name: /Resend via/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change number' })).toBeNull();
    // Escape hatch to a supported mode is present and lands on the password form.
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Email/Password' }));
    expect(screen.getByPlaceholderText(PASSWORD_FIELD)).toBeTruthy();
    expectNoPhoneAffordances();
  });

  it('an unconfirmed server phone challenge does not advise resending via a hidden channel', async () => {
    stubApi({
      'login/password': { requiresOtp: true, otpPhone: PHONE, otpDelivery: 'uncertain' },
    });
    render(<LoginPage />);
    await submitPassword();

    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent via/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Resend via/i })).toBeNull();
    expect(document.body.textContent).not.toContain('resending via a different channel');
  });
});