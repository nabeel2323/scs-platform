import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Admin login — the PRESERVED phone/SMS path, exercised with the UI flag on.
 *
 * PHONE_OTP_UI_ENABLED defaults to false for the email-only staging release
 * (see src/lib/auth-channels.ts); the phone implementation is kept intact so
 * the separately approved SMS phase is a one-line flip. This file mocks the
 * flag TRUE so the dormant implementation stays covered:
 *
 *   - the "Use phone number instead" choice renders and reaches the phone
 *     request form, which posts to /v1/auth/otp/request;
 *   - an accepted send advances to code entry and verify signs in via
 *     /v1/auth/otp/verify;
 *   - the 'unavailable' copy (e.g. SMS_CHANNEL_DISABLED from the allowlist)
 *     says the channel isn't available in this environment and points at
 *     EMAIL sign-in — it must NOT tell the admin to enable the SMS provider,
 *     and must not claim anything was sent.
 *
 * Same harness as auth-login-email-only-channels.test.tsx: real auth lib,
 * stubbed global fetch routed by URL, Vitest core matchers only.
 */

const { ctl } = vi.hoisted(() => ({
  ctl: { push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: ctl.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

// The future SMS phase, simulated: only the flag differs from production.
vi.mock('@/lib/auth-channels', () => ({ PHONE_OTP_UI_ENABLED: true }));

import AdminLoginPage from '@/app/auth/login/page';

const PHONE_FIELD = '+966 5XX XXX XXXX';
const OTP_FIELD = '123456';
const PHONE = '+966500000000';

/** Minimal Response shape consumed by the admin auth lib. */
function fakeRes(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

let phoneRequestAnswer: unknown;
let phoneVerifyAnswer: unknown;
let meAnswer: unknown;

const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit): Promise<unknown> => {
  const u = String(url);
  if (u.includes('/v1/auth/otp/request')) return phoneRequestAnswer;
  if (u.includes('/v1/auth/otp/verify')) return phoneVerifyAnswer;
  if (u.endsWith('/v1/me')) return meAnswer;
  throw new Error(`Unexpected fetch in phone-channel-flag test: ${u}`);
});

function callsTo(path: string): Array<[string, RequestInit | undefined]> {
  return fetchMock.mock.calls
    .filter(([u]) => String(u).includes(path))
    .map(([u, init]) => [String(u), init as RequestInit | undefined]);
}

async function toPhoneRequestStage() {
  fireEvent.click(screen.getByRole('button', { name: 'Email OTP' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use phone number instead' }));
  fireEvent.change(screen.getByPlaceholderText(PHONE_FIELD), { target: { value: PHONE } });
}

describe('Admin login — preserved phone path with PHONE_OTP_UI_ENABLED=true', () => {
  beforeEach(() => {
    ctl.push.mockReset();
    fetchMock.mockClear();
    window.localStorage.clear();
    phoneRequestAnswer = fakeRes({ success: true, deliveryStatus: 'delivered' });
    phoneVerifyAnswer = fakeRes({ accessToken: 'access-456', refreshToken: 'refresh-456' });
    meAnswer = fakeRes({
      id: 'u1',
      phone: PHONE,
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

  it('renders the phone choice and completes request → verify on the phone endpoints', async () => {
    render(<AdminLoginPage />);
    await toPhoneRequestStage();
    expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Send OTP/ }));
    await waitFor(() => expect(callsTo('/v1/auth/otp/request').length).toBe(1));
    const [, init] = callsTo('/v1/auth/otp/request')[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ phone: PHONE });

    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(OTP_FIELD), { target: { value: '135790' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/ }));

    await waitFor(() => expect(callsTo('/v1/auth/otp/verify').length).toBe(1));
    const [, verifyInit] = callsTo('/v1/auth/otp/verify')[0]!;
    const body = JSON.parse(String(verifyInit?.body));
    expect(body.phone).toBe(PHONE);
    expect(body.otp).toBe('135790');
    await waitFor(() => expect(ctl.push).toHaveBeenCalledWith('/'));
  });

  it('keeps the change-number escape hatch while the flag is on', async () => {
    render(<AdminLoginPage />);
    await toPhoneRequestStage();
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/ }));
    await waitFor(() => expect(screen.getByText(`Code sent to ${PHONE}`)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Change number' }));
    await waitFor(() => expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy());
    expect(screen.queryByText(/Code sent/)).toBeNull();
  });

  it('points at email sign-in — not at enabling SMS — when the channel is unavailable', async () => {
    // Exactly what the email-only deployment's delivery router answers before
    // touching any provider.
    phoneRequestAnswer = fakeRes({ success: false, deliveryStatus: 'SMS_CHANNEL_DISABLED' });
    render(<AdminLoginPage />);
    await toPhoneRequestStage();
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/ }));
    await waitFor(() => expect(callsTo('/v1/auth/otp/request').length).toBe(1));

    await waitFor(() =>
      expect(
        screen.getByText(
          `OTP delivery isn't available in this environment, so nothing was sent to ${PHONE}. Sign in with email instead.`,
        ),
      ).toBeTruthy(),
    );
    // No advice that cannot apply to an email-only release, no sent claim,
    // no provider vocabulary, and no advance to code entry.
    expect(document.body.textContent).not.toContain('enable the SMS provider');
    expect(document.body.textContent).not.toContain('SMS_CHANNEL_DISABLED');
    expect(screen.queryByPlaceholderText(OTP_FIELD)).toBeNull();
    expect(screen.queryByText(/Code sent/)).toBeNull();
    expect(screen.getByPlaceholderText(PHONE_FIELD)).toBeTruthy();
  });
});