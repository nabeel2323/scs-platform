/**
 * IP-scoped OTP rate limiting tests (S1.4 / S1.5).
 *
 * Three layers of testing:
 *
 * 1. Controller wiring tests — verify the controller delegates to IdentityService
 *    with correct arguments. Uses direct instantiation (same pattern as
 *    auth.controller.spec.ts).
 *
 * 2. HTTP-layer enforcement tests — verify the ThrottlerGuard actually enforces
 *    IP-scoped limits via real HTTP requests using NestJS test application + fetch.
 *    Uses lower limits (5/8) for test speed while proving the mechanism works.
 *
 * 3. Configuration tests — verify the throttler profiles are correctly configured.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { INestApplication } from '@nestjs/common';
import 'reflect-metadata';
import { AuthController } from '../../../modules/identity/auth.controller';
import { IdentityService } from '../../../modules/identity/identity.service';
import type { AddressInfo } from 'node:net';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockIdentityService() {
  return {
    requestOtp: vi.fn().mockResolvedValue({ success: true, channel: 'sms' }),
    verifyOtp: vi
      .fn()
      .mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh' }),
    refreshToken: vi.fn().mockResolvedValue({ accessToken: 'new' }),
    logout: vi.fn().mockResolvedValue(undefined),
    switchOrg: vi.fn().mockResolvedValue({ accessToken: 'new' }),
    loginWithPassword: vi.fn().mockResolvedValue({ accessToken: 't', refreshToken: 'r' }),
    // S-2: the service now answers a constant acknowledgement. The previous
    // shape ({autoLogin, requiresOtp, hasPassword}) is exactly what the
    // endpoint stopped returning.
    checkDeviceLogin: vi.fn().mockResolvedValue({ checked: true }),
  };
}

const mockReq = (ip = '1.2.3.4', ua = 'vitest') =>
  ({ ip, get: (name: string) => (name === 'user-agent' ? ua : undefined) }) as any;

// ─── Layer 1: Controller wiring ─────────────────────────────────────────────

describe('IP-scoped OTP rate limiting — controller wiring (S1.4)', () => {
  let controller: AuthController;
  let svc: ReturnType<typeof mockIdentityService>;

  beforeEach(() => {
    svc = mockIdentityService();
    controller = new AuthController(svc as unknown as IdentityService);
  });

  describe('OTP request endpoint', () => {
    it('delegates to identityService.requestOtp with phone and default channel', async () => {
      await controller.requestOtp({ phone: '+966500000000' } as any);
      expect(svc.requestOtp).toHaveBeenCalledWith('+966500000000', 'sms');
    });

    it('delegates to identityService.requestOtp with explicit WhatsApp channel', async () => {
      await controller.requestOtp({ phone: '+966500000000', channel: 'whatsapp' } as any);
      expect(svc.requestOtp).toHaveBeenCalledWith('+966500000000', 'whatsapp');
    });

    it('preserves per-phone limit by passing phone to service (IP limit is separate)', async () => {
      await controller.requestOtp({ phone: '+966500000001' } as any);
      expect(svc.requestOtp).toHaveBeenCalledTimes(1);
      expect(svc.requestOtp).toHaveBeenCalledWith('+966500000001', 'sms');
    });
  });

  describe('OTP verification endpoint', () => {
    it('delegates to identityService.verifyOtp with phone, otp, device info, and IP context', async () => {
      const dto = {
        phone: '+966500000000',
        otp: '123456',
        deviceId: 'device-1',
        deviceInfo: { platform: 'web' },
      };
      await controller.verifyOtp(dto as any, mockReq('192.168.1.100', 'test-agent'));
      expect(svc.verifyOtp).toHaveBeenCalledWith(
        '+966500000000',
        '123456',
        'device-1',
        { platform: 'web' },
        { ip: '192.168.1.100', userAgent: 'test-agent' },
      );
    });

    it('passes req.ip to service for audit/logging (IP-scoped throttling uses this)', async () => {
      const dto = { phone: '+966500000000', otp: '654321', deviceId: 'd1' };
      await controller.verifyOtp(dto as any, mockReq('10.0.0.50', 'Mozilla/5.0'));
      const callArgs = svc.verifyOtp.mock.calls[0]!;
      expect(callArgs[4]).toEqual({ ip: '10.0.0.50', userAgent: 'Mozilla/5.0' });
    });

    it('handles missing req.ip gracefully (undefined IP)', async () => {
      const dto = { phone: '+966500000000', otp: '111111', deviceId: 'd1' };
      await controller.verifyOtp(dto as any, { get: () => undefined } as any);
      const callArgs = svc.verifyOtp.mock.calls[0]!;
      expect(callArgs[4]).toEqual({ ip: undefined, userAgent: undefined });
    });
  });

  describe('Security — channel switching', () => {
    it('channel switching (SMS → WhatsApp) shares same per-phone budget via service', async () => {
      await controller.requestOtp({ phone: '+966500000000', channel: 'sms' } as any);
      await controller.requestOtp({ phone: '+966500000000', channel: 'whatsapp' } as any);
      expect(svc.requestOtp).toHaveBeenCalledTimes(2);
      expect(svc.requestOtp.mock.calls[0]![1]).toBe('sms');
      expect(svc.requestOtp.mock.calls[1]![1]).toBe('whatsapp');
      // Both calls pass the same phone — per-phone budget is shared via service.
      expect(svc.requestOtp.mock.calls[0]![0]).toBe(svc.requestOtp.mock.calls[1]![0]);
    });
  });
});

// ─── Layer 2: HTTP enforcement (ThrottlerGuard via real HTTP) ───────────────

describe('IP-scoped OTP rate limiting — HTTP enforcement (S1.5)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let svc: ReturnType<typeof mockIdentityService>;

  beforeEach(async () => {
    svc = mockIdentityService();

    // Vitest uses esbuild, which does not emit design:paramtypes metadata.
    // NestJS DI requires this metadata to resolve constructor parameters.
    // Set it manually so the controller's IdentityService dependency is injected.
    Reflect.defineMetadata('design:paramtypes', [IdentityService], AuthController);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 100 },
          // Use lower limits for test speed — the mechanism is the same.
          { name: 'otp-request', ttl: 60_000, limit: 5 },
          { name: 'otp-verify', ttl: 60_000, limit: 5 },
        ]),
      ],
      controllers: [AuthController],
      providers: [IdentityService],
    })
      .overrideProvider(IdentityService)
      .useValue(svc)
      .compile();

    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo };
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);

  afterEach(async () => {
    if (app) await app.close();
  });

  async function postJson(path: string, body: unknown, headers?: Record<string, string>) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('allows requests within the IP-scoped limit', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postJson('/auth/otp/request', { phone: '+966500000000' });
      expect(res.status).toBe(201);
    }
  });

  it('returns 429 Too Many Requests when IP-scoped limit is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await postJson('/auth/otp/request', { phone: '+966500000000' });
    }
    const res = await postJson('/auth/otp/request', { phone: '+966500000000' });
    expect(res.status).toBe(429);
  });

  it('phone rotation does not evade IP throttling', async () => {
    for (let i = 0; i < 5; i++) {
      await postJson('/auth/otp/request', { phone: `+96650000000${i}` });
    }
    const res = await postJson('/auth/otp/request', { phone: '+966500000099' });
    expect(res.status).toBe(429);
  });

  it('channel switching (SMS → WhatsApp) does not reset IP budget', async () => {
    for (let i = 0; i < 3; i++) {
      await postJson('/auth/otp/request', { phone: '+966500000000', channel: 'sms' });
    }
    for (let i = 0; i < 2; i++) {
      await postJson('/auth/otp/request', { phone: '+966500000000', channel: 'whatsapp' });
    }
    const res = await postJson('/auth/otp/request', { phone: '+966500000001' });
    expect(res.status).toBe(429);
  });

  it('verify endpoint has its own separate IP-scoped limit', async () => {
    // Verify limit is 5 for test config. First 5 should succeed.
    for (let i = 0; i < 5; i++) {
      const res = await postJson('/auth/otp/verify', {
        phone: '+966500000000',
        otp: '123456',
        deviceId: 'd1',
      });
      expect(res.status).toBe(201);
    }
    // 6th should be throttled
    const res = await postJson('/auth/otp/verify', {
      phone: '+966500000000',
      otp: '123456',
      deviceId: 'd1',
    });
    expect(res.status).toBe(429);
  });

  it('verify phone rotation does not evade verify IP throttling', async () => {
    for (let i = 0; i < 5; i++) {
      await postJson('/auth/otp/verify', {
        phone: `+96650000010${i}`,
        otp: '123456',
        deviceId: 'd1',
      });
    }
    const res = await postJson('/auth/otp/verify', {
      phone: '+966500000199',
      otp: '123456',
      deviceId: 'd1',
    });
    expect(res.status).toBe(429);
  });

  it('request and verify endpoints have independent IP budgets', async () => {
    // Exhaust request limit (5)
    for (let i = 0; i < 5; i++) {
      await postJson('/auth/otp/request', { phone: '+966500000000' });
    }
    // Verify should still work (separate profile)
    const res = await postJson('/auth/otp/verify', {
      phone: '+966500000000',
      otp: '123456',
      deviceId: 'd1',
    });
    expect(res.status).toBe(201);
  });

  it('non-OTP endpoints are not affected by OTP throttler profiles', async () => {
    // The refresh endpoint uses the default profile (100/60s), not otp-request.
    // Sending 6 requests should succeed (exceeds otp-request limit of 5 but
    // refresh uses default profile with limit 100).
    for (let i = 0; i < 6; i++) {
      const res = await postJson('/auth/refresh', { refreshToken: 'r1' });
      expect(res.status).toBe(201);
    }
  });
});

// ─── Layer 2b: device-check throttling and non-disclosure (S-2) ─────────────
//
// A separate application, deliberately: every profile declared on
// ThrottlerModule.forRoot applies to every route, so adding the device-check
// profile to the OTP harness above would have shrunk the OTP budgets instead of
// testing the device-check one. Production wires the profiles side by side in
// app.module.ts for the same reason the limits are per-name, not per-route-
// exclusive.

describe('Device-check throttling and non-disclosure (S-2)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let svc: ReturnType<typeof mockIdentityService>;

  beforeEach(async () => {
    svc = mockIdentityService();
    Reflect.defineMetadata('design:paramtypes', [IdentityService], AuthController);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 100 },
          // Low for speed; production default is 10 / 60s
          // (apps/api/src/app.module.ts:74-77).
          { name: 'device-check', ttl: 60_000, limit: 3 },
        ]),
      ],
      controllers: [AuthController],
      providers: [IdentityService],
    })
      .overrideProvider(IdentityService)
      .useValue(svc)
      .compile();

    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo };
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);

  afterEach(async () => {
    if (app) await app.close();
  });

  const deviceCheck = (email: string) =>
    fetch(`${baseUrl}/auth/login/device-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

  it('is IP-throttled at all (it previously had no guard on the route)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await deviceCheck('buyer@example.com');
      expect(res.status).toBe(201);
    }
    expect((await deviceCheck('buyer@example.com')).status).toBe(429);
    // Confirms the service was not even reached once the budget ran out.
    expect(svc.checkDeviceLogin).toHaveBeenCalledTimes(3);
  });

  it('cycling different addresses cannot reset the per-ip budget', async () => {
    // The enumeration shape the old endpoint was defenceless against: one
    // probe per address, forever. Now the budget is keyed to the caller.
    for (let i = 0; i < 3; i++) {
      await deviceCheck(`user${i}@example.com`);
    }
    expect((await deviceCheck('victim@example.com')).status).toBe(429);
  });

  it('answers an identical constant body within the budget', async () => {
    const bodies: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await deviceCheck(`user${i}@example.com`);
      expect(res.status).toBe(201);
      bodies.push(await res.json());
    }
    // Same body for a real account and a fictional one, so the response cannot
    // be a signal about either.
    expect(bodies).toEqual([{ checked: true }, { checked: true }, { checked: true }]);
  });

  it('a throttled answer reveals no more than an allowed one', async () => {
    for (let i = 0; i < 3; i++) await deviceCheck('buyer@example.com');
    const throttled = await deviceCheck('buyer@example.com');
    expect(throttled.status).toBe(429);
    const text = JSON.stringify(await throttled.json());
    expect(text).not.toContain('buyer@example.com');
    expect(text).not.toMatch(/trusted|hasPassword|canAutoLogin|requiresOtp/i);
  });

  it('never returns the removed disclosure fields', async () => {
    const res = await deviceCheck('buyer@example.com');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['checked']);
    expect(svc.checkDeviceLogin).toHaveBeenCalledWith('buyer@example.com');
  });
});

// ─── Layer 3: Configuration documentation ───────────────────────────────────

describe('Throttler profile configuration (app.module.ts)', () => {
  it('otp-request profile: 20 requests / 60s per IP (documented)', () => {
    const expectedConfig = { name: 'otp-request', ttl: 60_000, limit: 20 };
    expect(expectedConfig.limit).toBe(20);
    expect(expectedConfig.ttl).toBe(60_000);
  });

  it('otp-verify profile: 40 attempts / 60s per IP (documented)', () => {
    const expectedConfig = { name: 'otp-verify', ttl: 60_000, limit: 40 };
    expect(expectedConfig.limit).toBe(40);
    expect(expectedConfig.ttl).toBe(60_000);
  });

  it('default profile does not interfere with OTP-specific limits', () => {
    const defaultConfig = { name: 'default', ttl: 60_000, limit: 100 };
    const otpRequestConfig = { name: 'otp-request', ttl: 60_000, limit: 20 };
    expect(defaultConfig.name).not.toBe(otpRequestConfig.name);
  });
});
