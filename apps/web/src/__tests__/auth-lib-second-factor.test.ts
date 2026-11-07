import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Email-only staging release — the web auth client must not discard the channel
 * the API used for the password second factor.
 *
 * `POST /v1/auth/login/password` answers `otpPhone` OR `otpEmail` (masked)
 * depending on which permitted channel carried the challenge
 * (identity.service.ts, "Second factor channel selection"). The client used to
 * map only `otpPhone`, so an email challenge arrived at the page as an empty
 * phone number and the user was shown a phone prompt that could never verify.
 *
 * This exercises the REAL `loginPassword` against a stubbed `fetch`; nothing
 * about the mapping is mocked away.
 */

vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }));

import { loginPassword } from '@/lib/auth';

/** Stub one JSON response from the login endpoint. */
function respondWith(body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }),
  );
}

describe('loginPassword — second-factor channel passthrough', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('carries otpEmail through when the API sent the challenge by email', async () => {
    respondWith({
      requiresOtp: true,
      otpEmail: 'b***@test.com',
      otpDelivery: 'accepted',
    });

    const result = await loginPassword('buyer@test.com', 'hunter2', 'test-device');

    expect(result).toMatchObject({
      requiresOtp: true,
      otpEmail: 'b***@test.com',
      otpDelivery: 'accepted',
    });
  });

  it('does not invent a phone number for an email challenge', async () => {
    respondWith({ requiresOtp: true, otpEmail: 'b***@test.com', otpDelivery: 'accepted' });

    const result = await loginPassword('buyer@test.com', 'hunter2', 'test-device');

    // An empty/absent phone is what tells the page to render the email prompt.
    expect((result as { otpPhone?: string }).otpPhone || '').toBe('');
  });

  it('still carries otpPhone for a challenge the API sent by phone', async () => {
    respondWith({
      requiresOtp: true,
      otpPhone: '+966500000009',
      otpDelivery: 'accepted',
    });

    const result = await loginPassword('buyer@test.com', 'hunter2', 'test-device');

    expect(result).toMatchObject({ requiresOtp: true, otpPhone: '+966500000009' });
  });

  it('preserves an unconfirmed delivery answer on the email channel', async () => {
    respondWith({ requiresOtp: true, otpEmail: 'b***@test.com', otpDelivery: 'uncertain' });

    const result = await loginPassword('buyer@test.com', 'hunter2', 'test-device');

    expect(result).toMatchObject({ otpDelivery: 'uncertain' });
  });

  it('does not fabricate a delivery answer the API never gave', async () => {
    respondWith({ requiresOtp: true, otpEmail: 'b***@test.com' });

    const result = await loginPassword('buyer@test.com', 'hunter2', 'test-device');

    expect((result as { otpDelivery?: string }).otpDelivery).toBeUndefined();
  });
});