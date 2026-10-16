import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    expect(svc.requestOtp).toHaveBeenCalledWith('+966500000000');
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
});
