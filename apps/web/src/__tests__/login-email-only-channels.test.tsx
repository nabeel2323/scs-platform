import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Email-only staging release — the web login client must not invite users into
 * channels the server refuses (`OTP_CHANNELS=email`).
 *
 * These tests run at the DEFAULT value of `PHONE_OTP_UI_ENABLED` (false): the
 * real `@/lib/auth-channels` module is NOT mocked, so the page renders exactly
 * what a shopper sees in the initial release. Every user-initiated phone/WhatsApp
 * affordance must be gone, while email OTP stays the passwordless default and a
 * server-issued phone challenge (the one exception) still verifies.
 *
 * Harness follows the web convention: RTL + Vitest CORE matchers only (jest-dom
 * is not installed), `vi.hoisted` for the router control object, module-level
 * `vi.mock('next/navigation')`, and the REAL auth/api libs exercised against a
 * stubbed global `fetch` routed by URL — so nothing about the channel gating or
 * the delivery-honesty copy is mocked away.
 */

const { routerCtl } = vi.hoisted(() => ({
  routerCtl: { push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerCtl.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

// Deterministic device id; the real auth lib reads it when verifying.
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }));

// Minimal stand-in for the design-system tokens used inline by the page.
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

// Real auth lib + real api lib + real (default-false) channel flag.
import LoginPage from '@/app/auth/login/page';
import { PHONE_OTP_UI_ENABLED } from '@/lib/auth-channels';
import { getSession, getUser } from '@/lib/auth';

const EMAIL_FIELD = 'you@example.com';
const PASSWORD_FIELD = '••••••••••••';
const PHONE_FIELD = '+966 5XX XXX XXXX';
const OTP_FIELD = '123456';
const BUYER_EMAIL = 'buyer@test.com';
const PHONE = '+966500000009';

/** Pathname-keyed JSON routes for the stubbed fetch. */
type Route = { status?: number; body: unknown };
let routes: Record<string, Route>;

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  const path = new URL(url).pathname;
  const route = routes[path];
  if (!route) throw new Error(`Unexpected fetch to ${path}`);
  const status = route.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => route.body,
    headers: { get: () => null },
  };
});

/** True when any recorded fetch hit the phone OTP request endpoint. */
function phoneRequestCalled(): boolean {
  return fetchMock.mock.calls.some(([input]) => {
    const url = typeof input === 'string' ? input : String(input);
    return new URL(url).pathname === '/v1/auth/otp/request';
  });
}

const PROFILE = {
  id: 'u1',
  phone: null,
  email: BUYER_EMAIL,
  fullName: 'Buyer One',
  role: 'BUYER',
  perms: [],
  activeOrgId: 'o1',
  organizations: [{ id: 'o1' }],
};

describe('Web login — email-only channels at the default flag', () => {
  beforeEach(() => {
    routes = {};
    fetchMock.mockClear();
    routerCtl.push.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('ships with the phone OTP UI disabled by default', () => {
    expect(PHONE_OTP_UI_ENABLED).toBe(false);
  });

  it('hides every user-initiated phone/WhatsApp affordance on the default screen', () => {
    render(<LoginPage />);

    // No Phone OTP tab, no "use phone instead" style entry point.
    expect(screen.queryByRole('button', { name: 'Phone OTP' })).toBeNull();
    expect(screen.queryByRole('button', { name: /phone/i })).toBeNull();
    expect(screen.queryByText(/use phone/i)).toBeNull();
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    // No delivery-channel radios and no channel-switch resend buttons.
    expect(screen.queryByRole('radiogroup', { name: 'Delivery channel' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Resend via/i })).toBeNull();
    // Nothing was sent anywhere on open.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes the email OTP request form the passwordless default entry', async () => {
    render(<LoginPage />);

    // The password tab's passwordless call to action opens EMAIL, not phone.
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send code to email' })).toBeTruthy(),
    );
    expect(screen.getByPlaceholderText(EMAIL_FIELD)).toBeTruthy();
    expect(screen.queryByPlaceholderText(PHONE_FIELD)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Send via/i })).toBeNull();
    expect(phoneRequestCalled()).toBe(false);
  });

  it('completes an email request → verify journey, signs in and hydrates the profile without any phone request', async () => {
    routes['/v1/auth/otp/email/request'] = { body: { success: true } };
    routes['/v1/auth/otp/email/verify'] = {
      body: { accessToken: 'at', refreshToken: 'rt' },
    };
    routes['/v1/me'] = { body: PROFILE };

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), {
      target: { value: BUYER_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    // Accepted send → honest "Code sent to" copy and the verify step.
    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.getByText(/Code sent to/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '246810' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(screen.getByText(/Signed in successfully/)).toBeTruthy(),
    );
    // The real auth lib persisted a session and hydrated the user from /v1/me.
    expect(getSession()).not.toBeNull();
    expect(getUser()?.fullName).toBe('Buyer One');
    expect(getUser()?.email).toBe(BUYER_EMAIL);
    await waitFor(() => expect(routerCtl.push).toHaveBeenCalledTimes(1), { timeout: 1200 });

    // The whole journey never touched the phone OTP request endpoint.
    expect(phoneRequestCalled()).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/v1/auth/otp/email/verify'),
      ),
    ).toBe(true);
  });

  it('still verifies a server-issued phone challenge but hides the channel-switch affordances', async () => {
    // The exception: the API itself chose a phone second factor. The verify step
    // must render and work even with the flag false, or the user is trapped.
    routes['/v1/auth/login/password'] = {
      body: { requiresOtp: true, otpPhone: PHONE, otpDelivery: 'accepted' },
    };
    routes['/v1/auth/otp/verify'] = { body: { accessToken: 'at', refreshToken: 'rt' } };
    routes['/v1/me'] = { body: PROFILE };

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: BUYER_EMAIL } });
    fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() =>
      expect(screen.getByText(`Code sent via SMS to ${PHONE}`)).toBeTruthy(),
    );
    // User-initiated channel selection stays hidden even on a server challenge.
    expect(screen.queryByRole('button', { name: /Resend via/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change number' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('/v1/auth/otp/verify')),
      ).toBe(true),
    );
    expect(phoneRequestCalled()).toBe(false);
  });

  it('reports a provider rejection honestly without claiming a code was sent', async () => {
    routes['/v1/auth/otp/email/request'] = {
      body: { success: false, deliveryStatus: 'SMTP_NOT_CONFIGURED' },
    };

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: BUYER_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    await waitFor(() =>
      expect(screen.getByText(/nothing was sent to your inbox/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/Code sent to/)).toBeNull();
    expect(screen.queryByPlaceholderText(OTP_FIELD)).toBeNull();
    expect(document.body.textContent).not.toContain('SMTP_NOT_CONFIGURED');
    expect(phoneRequestCalled()).toBe(false);
  });

  it('hedges an uncertain email delivery without a false "sent" claim', async () => {
    routes['/v1/auth/otp/email/request'] = {
      body: { success: false, possiblyDelivered: true, deliveryStatus: 'DELIVERY_TIMEOUT' },
    };

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email OTP/i }));
    fireEvent.change(screen.getByPlaceholderText(EMAIL_FIELD), { target: { value: BUYER_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code to email' }));

    // The challenge is live, so code entry is offered, but labelled unconfirmed.
    await waitFor(() => expect(screen.getByPlaceholderText(OTP_FIELD)).toBeTruthy());
    expect(screen.getByText(/could not confirm delivery/i)).toBeTruthy();
    expect(screen.queryByText(/Code sent to/)).toBeNull();
    expect(phoneRequestCalled()).toBe(false);
  });
});