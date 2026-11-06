import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AuthController } from '../../../modules/identity/auth.controller';
import { IdentityService } from '../../../modules/identity/identity.service';
import {
  DEVICE_TRUST_COOKIE_NAME,
  DEVICE_TRUST_PROOF_HEADER,
  DEVICE_TRUST_PROOF_VALUE,
} from '../../../common/auth/device-trust-cookie';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

/**
 * AuthController — delegation + auth-contract unit tests.
 *
 * The controller is a thin adapter over IdentityService. These tests lock the
 * wiring the P1/P2 fixes depend on:
 *   - `switch-org` forwards the caller's `sid` (WEB-B3) AND the presenting
 *     token's `{ jti, exp }` so the prior token can be denylisted (API-B9).
 *   - each endpoint forwards its DTO fields + request context to the right
 *     service method (no argument drift).
 *
 * S1.37 audit additions lock the Phase 1 surface: every email-identity endpoint
 * honours the `auth.email_otp.enabled` kill switch (F-06), the email OTP
 * endpoints pad their response time (F-14), and `link-email` forwards the OTP
 * proof of control (F-04).
 *
 * The service is fully mocked; DTO *validation* is covered separately in
 * `auth-dto.spec.ts` (API-B10).
 */

function mockIdentityService() {
  return {
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    switchOrg: vi.fn(),
    loginWithPassword: vi.fn(),
    checkDeviceLogin: vi.fn(),
    requestEmailOtp: vi.fn().mockResolvedValue({ success: true, deliveryStatus: 'delivered' }),
    verifyEmailOtp: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    linkEmailToAccount: vi.fn().mockResolvedValue({ success: true }),
    linkPhoneToAccount: vi.fn().mockResolvedValue({ success: true }),
    unlinkEmailFromAccount: vi.fn().mockResolvedValue({ success: true }),
    unlinkPhoneFromAccount: vi.fn().mockResolvedValue({ success: true }),
    isEmailOtpEnabled: vi.fn().mockResolvedValue(true),
  };
}

const payload = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  activeOrg: 'org-1',
  role: 'OWNER',
  perms: [],
  sid: 'sess-1',
  jti: 'jti-1',
  iat: 0,
  exp: 9999999999,
  ...over,
});

// Minimal stand-in for the `@Req()` object the controller reads.
const req = (ip = '1.2.3.4', ua = 'vitest') =>
  ({ ip, get: (name: string) => (name === 'user-agent' ? ua : undefined) }) as any;

/** A request that presents a device credential the way a trusted browser does. */
const presentingReq = (credential: string, withProof = true) =>
  ({
    ip: '1.2.3.4',
    headers: {
      cookie: `${DEVICE_TRUST_COOKIE_NAME}=${credential}`,
      ...(withProof ? { [DEVICE_TRUST_PROOF_HEADER]: DEVICE_TRUST_PROOF_VALUE } : {}),
    },
    get: (name: string) => (name === 'user-agent' ? 'vitest' : undefined),
  }) as any;

/** Stand-in for `@Res({ passthrough: true })`, recording what would go on the wire. */
function cookieJar() {
  const headers: Record<string, string | string[]> = {};
  return {
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    /** Every Set-Cookie value, flattened (appendSetCookie stores an array). */
    get cookies(): string[] {
      const raw = headers['set-cookie'];
      if (raw === undefined) return [];
      return Array.isArray(raw) ? raw : [String(raw)];
    },
  };
}

// Exactly 43 characters of base64url — the only shape the transport accepts as
// ours (device-trust-cookie.ts CREDENTIAL_PATTERN). A 44-char stand-in is
// treated as a foreign cookie value: read as no credential at all on input and
// refused outright on output, which is the point of the pattern.
const CREDENTIAL = 'a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ0123456';

describe('AuthController', () => {
  let svc: ReturnType<typeof mockIdentityService>;
  let controller: AuthController;

  beforeEach(() => {
    svc = mockIdentityService();
    controller = new AuthController(svc as unknown as IdentityService);
  });

  it('requestOtp forwards the phone', async () => {
    await controller.requestOtp({ phone: '+966500000000' } as any);
    expect(svc.requestOtp).toHaveBeenCalledWith('+966500000000', 'sms');
  });

  it('verifyOtp forwards phone/otp/device fields + request context', async () => {
    await controller.verifyOtp(
      {
        phone: '+966500000000',
        otp: '123456',
        deviceId: 'dev-1',
        deviceInfo: { platform: 'web' },
      } as any,
      req('9.9.9.9', 'chrome'),
    );
    expect(svc.verifyOtp).toHaveBeenCalledWith(
      '+966500000000',
      '123456',
      'dev-1',
      { platform: 'web' },
      { ip: '9.9.9.9', userAgent: 'chrome' },
    );
  });

  it('refreshToken forwards the token and a null credential for an ordinary request', async () => {
    await controller.refreshToken({ refreshToken: 'r1' } as any, req());
    expect(svc.refreshToken).toHaveBeenCalledWith('r1', null);
  });

  it('logout forwards the token and a null credential for an ordinary request', async () => {
    await controller.logout({ refreshToken: 'r1' } as any, req());
    expect(svc.logout).toHaveBeenCalledWith('r1', null);
  });

  it('switchOrg forwards sub, orgId, sid and the presenting token jti/exp (API-B9 + WEB-B3)', async () => {
    await controller.switchOrg(
      payload({ sub: 'u9', sid: 'sess-9', jti: 'jti-9', exp: 42 }),
      { orgId: 'org-2' } as any,
    );
    expect(svc.switchOrg).toHaveBeenCalledWith('u9', 'org-2', 'sess-9', {
      jti: 'jti-9',
      exp: 42,
    });
  });

  it('loginPassword forwards credentials + device + context + presented credential', async () => {
    await controller.loginPassword(
      {
        email: 'a@b.c',
        password: 'pw',
        deviceId: 'dev-1',
        deviceInfo: { platform: 'web' },
      } as any,
      req('5.5.5.5', 'safari'),
    );
    expect(svc.loginWithPassword).toHaveBeenCalledWith(
      'a@b.c',
      'pw',
      'dev-1',
      { platform: 'web' },
      { ip: '5.5.5.5', userAgent: 'safari' },
      null,
    );
  });

  it('checkDeviceLogin forwards ONLY the email (S-2: no device in, no trust out)', async () => {
    await controller.checkDeviceLogin({ email: 'a@b.c', deviceId: 'dev-1' } as any);
    expect(svc.checkDeviceLogin).toHaveBeenCalledWith('a@b.c');
    expect(svc.checkDeviceLogin.mock.calls[0]).toHaveLength(1);
  });

  // ── S-1: device-trust transport ───────────────────────────────────────
  //
  // The credential is a second-factor bypass, so what crosses the wire around
  // it is security behaviour and is tested as such: it is read only with the
  // same-origin proof, it is never serialized into a body, and the response
  // attributes are the ones that keep it out of page script.

  describe('device-trust transport (S-1)', () => {
    const session = { accessToken: 'a', refreshToken: 'r' };

    /**
     * The positional argument that carries the credential the browser presented.
     * Read from the recorded call rather than the typed signature so a parameter
     * reorder fails loudly instead of silently comparing against `undefined`.
     */
    const presentedArgument = () => {
      const call = svc.loginWithPassword.mock.calls[0];
      if (!call) throw new Error('loginWithPassword was never called');
      return call[5];
    };

    it('forwards a presented credential on password login', async () => {
      svc.loginWithPassword.mockResolvedValue(session);
      await controller.loginPassword(
        { email: 'a@b.c', password: 'pw', deviceId: 'dev-1' } as any,
        presentingReq(CREDENTIAL),
        cookieJar(),
      );
      expect(presentedArgument()).toBe(CREDENTIAL);
    });

    it('ignores a credential presented without the same-origin proof header', async () => {
      svc.loginWithPassword.mockResolvedValue(session);
      await controller.loginPassword(
        { email: 'a@b.c', password: 'pw', deviceId: 'dev-1' } as any,
        presentingReq(CREDENTIAL, false),
        cookieJar(),
      );
      expect(presentedArgument()).toBeNull();
    });

    it('installs a minted credential as an HttpOnly cookie and strips it from the body', async () => {
      svc.verifyOtp.mockResolvedValue({
        ...session,
        deviceTrust: { credential: CREDENTIAL, maxAgeSeconds: 3600 },
      });
      const jar = cookieJar();
      const body = await controller.verifyOtp(
        { phone: '+966500000000', otp: '123456', deviceId: 'dev-1' } as any,
        req(),
        jar,
      );
      expect(body).toEqual(session);
      expect(JSON.stringify(body)).not.toContain(CREDENTIAL);
      expect(jar.cookies).toHaveLength(1);
      expect(jar.cookies[0]).toContain(`${DEVICE_TRUST_COOKIE_NAME}=${CREDENTIAL}`);
      expect(jar.cookies[0]).toContain('HttpOnly');
      expect(jar.cookies[0]).toContain('Max-Age=3600');
      expect(jar.cookies[0]).not.toMatch(/Domain=/);
    });

    it('clears the cookie when the service reports a dead credential', async () => {
      svc.loginWithPassword.mockResolvedValue({
        accessToken: '',
        refreshToken: '',
        requiresOtp: true,
        otpPhone: '+966500000000',
        deviceTrust: { clear: true },
      });
      const jar = cookieJar();
      const body: any = await controller.loginPassword(
        { email: 'a@b.c', password: 'pw', deviceId: 'dev-1' } as any,
        presentingReq(CREDENTIAL),
        jar,
      );
      expect(body.deviceTrust).toBeUndefined();
      expect(jar.cookies).toHaveLength(1);
      expect(jar.cookies[0]).toContain('Max-Age=0');
    });

    it('writes no cookie when the service has nothing to say about device trust', async () => {
      // The only no-op instruction is `undefined`: a live credential that is
      // still being slid is re-installed (next test), not silently skipped.
      svc.refreshToken.mockResolvedValue({
        accessToken: 'a',
        newRefreshToken: 'r2',
        deviceTrust: undefined,
      });
      const jar = cookieJar();
      const body = await controller.refreshToken(
        { refreshToken: 'r1' } as any,
        presentingReq(CREDENTIAL),
        jar,
      );
      expect(svc.refreshToken).toHaveBeenCalledWith('r1', CREDENTIAL);
      expect(body).toEqual({ accessToken: 'a', newRefreshToken: 'r2' });
      expect(jar.cookies).toHaveLength(0);
    });

    it('re-installs a slid credential on refresh so the two clocks stay in step', async () => {
      svc.refreshToken.mockResolvedValue({
        accessToken: 'a',
        newRefreshToken: 'r2',
        deviceTrust: { credential: CREDENTIAL, maxAgeSeconds: 7200 },
      });
      const jar = cookieJar();
      await controller.refreshToken(
        { refreshToken: 'r1' } as any,
        presentingReq(CREDENTIAL),
        jar,
      );
      expect(jar.cookies[0]).toContain('Max-Age=7200');
    });

    it('revokes the presented credential on logout and clears the cookie', async () => {
      svc.logout.mockResolvedValue({ success: true, deviceTrust: { clear: true } });
      const jar = cookieJar();
      const body = await controller.logout(
        { refreshToken: 'r1' } as any,
        presentingReq(CREDENTIAL),
        jar,
      );
      expect(svc.logout).toHaveBeenCalledWith('r1', CREDENTIAL);
      expect(body).toEqual({ success: true });
      expect(jar.cookies[0]).toContain('Max-Age=0');
    });

    it('still keeps the secret out of the body when no response object is injected', async () => {
      svc.verifyOtp.mockResolvedValue({
        ...session,
        deviceTrust: { credential: CREDENTIAL },
      });
      const body = await controller.verifyOtp(
        { phone: '+966500000000', otp: '123456', deviceId: 'dev-1' } as any,
        req(),
      );
      expect(JSON.stringify(body)).not.toContain(CREDENTIAL);
    });
  });

  // ── S1.37: Phase 1 feature-flag gating ────────────────────────────

  describe('auth.email_otp.enabled kill switch (S1.37-F-06)', () => {
    const gated: Array<[string, () => Promise<unknown>]> = [
      ['otp/email/request', () => controller.requestEmailOtp({ email: 'a@b.c' } as any, req() as any)],
      ['otp/email/verify', () => controller.verifyEmailOtp({ email: 'a@b.c', otp: '123456' } as any, req() as any)],
      ['account/link-email', () => controller.linkEmail(payload(), { email: 'a@b.c', otp: '123456' } as any)],
      ['account/link-phone', () => controller.linkPhone(payload(), { phone: '+966500000000', otp: '123456' } as any)],
      ['account/unlink-email', () => controller.unlinkEmail(payload())],
      ['account/unlink-phone', () => controller.unlinkPhone(payload())],
    ];

    it.each(gated)('%s answers 404 while the flag is off', async (_name, call) => {
      svc.isEmailOtpEnabled.mockResolvedValue(false);
      await expect(call()).rejects.toThrow(NotFoundException);
    });

    it.each(gated)('%s reaches the service once the flag is on', async (_name, call) => {
      svc.isEmailOtpEnabled.mockResolvedValue(true);
      await expect(call()).resolves.toBeDefined();
    });

    it('does not invoke the guarded operation when the flag is off', async () => {
      svc.isEmailOtpEnabled.mockResolvedValue(false);
      await expect(controller.linkEmail(payload(), { email: 'a@b.c', otp: '123456' } as any))
        .rejects.toThrow(NotFoundException);
      expect(svc.linkEmailToAccount).not.toHaveBeenCalled();
    });
  });

  // ── S1.37: argument forwarding ─────────────────────────────────────

  describe('Phase 1 wiring', () => {
    it('requestEmailOtp forwards email + client ip', async () => {
      await controller.requestEmailOtp({ email: 'user@example.com' } as any, req('7.7.7.7') as any);
      expect(svc.requestEmailOtp).toHaveBeenCalledWith('user@example.com', '7.7.7.7');
    });

    it('verifyEmailOtp forwards credentials, device and request context', async () => {
      await controller.verifyEmailOtp(
        { email: 'user@example.com', otp: '123456', deviceId: 'dev-1', deviceInfo: { platform: 'web' } } as any,
        req('7.7.7.7', 'firefox'),
      );
      expect(svc.verifyEmailOtp).toHaveBeenCalledWith(
        'user@example.com', '123456', 'dev-1', { platform: 'web' },
        { ip: '7.7.7.7', userAgent: 'firefox' },
      );
    });

    it('linkEmail forwards the caller sub plus the OTP proof of control (S1.37-F-04)', async () => {
      await controller.linkEmail(
        payload({ sub: 'u7' }),
        { email: 'new@example.com', otp: '654321' } as any,
      );
      expect(svc.linkEmailToAccount).toHaveBeenCalledWith('u7', 'new@example.com', '654321');
    });

    it('linkPhone forwards the caller sub plus the OTP proof of control (S1.37-F-05)', async () => {
      await controller.linkPhone(
        payload({ sub: 'u8' }),
        { phone: '+966500000001', otp: '654321' } as any,
      );
      expect(svc.linkPhoneToAccount).toHaveBeenCalledWith('u8', '+966500000001', '654321');
    });

    it('remaining account routes forward the caller sub only', async () => {
      await controller.unlinkEmail(payload({ sub: 'u8' }));
      expect(svc.unlinkEmailFromAccount).toHaveBeenCalledWith('u8');

      await controller.unlinkPhone(payload({ sub: 'u8' }));
      expect(svc.unlinkPhoneFromAccount).toHaveBeenCalledWith('u8');
    });
  });

  // ── S1.37: response-time padding ───────────────────────────────────

  describe('email OTP timing floor (S1.37-F-14)', () => {
    it.each([
      ['request', 'success', () => controller.requestEmailOtp({ email: 'a@b.c' } as any, req() as any)],
      ['request', 'failure', () => {
        svc.requestEmailOtp.mockRejectedValueOnce(new Error('boom'));
        return controller.requestEmailOtp({ email: 'a@b.c' } as any, req() as any);
      }],
      ['verify', 'success', () => controller.verifyEmailOtp({ email: 'a@b.c', otp: '123456' } as any, req() as any)],
      ['verify', 'failure', () => {
        svc.verifyEmailOtp.mockRejectedValueOnce(new Error('Invalid OTP'));
        return controller.verifyEmailOtp({ email: 'a@b.c', otp: '123456' } as any, req() as any);
      }],
    ])('%s endpoint holds a %s answer for at least 250ms', async (_kind, _outcome, call) => {
      const startedAt = Date.now();
      await (call().then(() => undefined).catch(() => undefined));
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(240);
    });

    it('a flag-disabled answer is padded the same way', async () => {
      svc.isEmailOtpEnabled.mockResolvedValue(false);
      const startedAt = Date.now();
      await expect(controller.requestEmailOtp({ email: 'a@b.c' } as any, req() as any))
        .rejects.toThrow(NotFoundException);
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(240);
    });
  });
});
