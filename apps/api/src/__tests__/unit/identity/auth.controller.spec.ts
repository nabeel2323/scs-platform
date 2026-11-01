import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AuthController } from '../../../modules/identity/auth.controller';
import { IdentityService } from '../../../modules/identity/identity.service';
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

  it('refreshToken forwards the refresh token', async () => {
    await controller.refreshToken({ refreshToken: 'r1' } as any);
    expect(svc.refreshToken).toHaveBeenCalledWith('r1');
  });

  it('logout forwards the refresh token', async () => {
    await controller.logout({ refreshToken: 'r1' } as any);
    expect(svc.logout).toHaveBeenCalledWith('r1');
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

  it('loginPassword forwards credentials + device + request context', async () => {
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
    );
  });

  it('checkDeviceLogin forwards email + deviceId', async () => {
    await controller.checkDeviceLogin({ email: 'a@b.c', deviceId: 'dev-1' } as any);
    expect(svc.checkDeviceLogin).toHaveBeenCalledWith('a@b.c', 'dev-1');
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
