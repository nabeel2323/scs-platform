import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { createMockRedisStore } from '../helpers/mock-redis';
import { BootstrapService } from '../../../modules/system/bootstrap.service';
import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';

const OWNER_EMAIL = 'platform-owner@example.com';

function insertStub(): any {
  const values = vi.fn().mockResolvedValue(undefined);
  return vi.fn().mockReturnValue({ values });
}

function makeService(overrides: {
  ownerEmail?: string | null;
  redis?: any;
} = {}): BootstrapService {
  const insert = insertStub();
  return new BootstrapService(
    { db: { insert }, transaction: vi.fn(async (fn: any) => fn({ insert })) } as any,
    { record: vi.fn() } as any,
    { checkAndIncrement: vi.fn(async () => ({ allowed: true, remaining: 9 })) } as any,
    overrides.redis ?? createMockRedisStore(),
    {
      deliverEmailOtp: vi.fn(async () => ({ success: true })),
      deliverToTestChannel: vi.fn(async () => ({ success: true })),
    } as any,
    { getMockProvider: vi.fn(() => ({ id: 'mock' })) } as any,
    overrides.ownerEmail ?? OWNER_EMAIL,
  );
}

describe('BootstrapService — owner OTP (unit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects any email that does not match the configured owner', async () => {
    const svc = makeService({ ownerEmail: OWNER_EMAIL });
    await expect(svc.requestOwnerOtp('attacker@example.com', '10.0.0.1')).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.verifyOwnerOtp('attacker@example.com', '123456', '10.0.0.1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('requestOwnerOtp sends only to the owner and returns a masked hint', async () => {
    const svc = makeService({ ownerEmail: OWNER_EMAIL });
    const res = await svc.requestOwnerOtp(OWNER_EMAIL, '10.0.0.1');

    expect(res.success).toBe(true);
    expect(res.deliveryStatus).toBe('delivered');
    expect(res.emailHint).toBe('p****@example.com');
  });

  it('verifyOwnerOtp verifies a known OTP and issues an authorization', async () => {
    const redis = createMockRedisStore();
    const svc = makeService({ ownerEmail: OWNER_EMAIL, redis });

    const otp = '123456';
    const salt = 'deadbeef';
    const hmacSecret = (svc as any).hmacSecret;
    const otpHash = crypto
      .createHmac('sha256', hmacSecret)
      .update(otp + salt)
      .digest('hex');
    await redis.client.set(
      `bootstrap:otp:email:${OWNER_EMAIL}`,
      JSON.stringify({ ch: 'ch-1', hs: otpHash, s: salt, ca: String(Date.now()), co: false }),
    );

    const res = await svc.verifyOwnerOtp(OWNER_EMAIL, otp, '10.0.0.1');
    expect(res.authorization).toHaveLength(64);
    expect(res.expiresInSeconds).toBe(900);
  });

  it('verifyOwnerOtp is single-use (replay fails)', async () => {
    const redis = createMockRedisStore();
    const svc = makeService({ ownerEmail: OWNER_EMAIL, redis });

    const otp = '123456';
    const salt = 'deadbeef';
    const hmacSecret = (svc as any).hmacSecret;
    const otpHash = crypto
      .createHmac('sha256', hmacSecret)
      .update(otp + salt)
      .digest('hex');
    await redis.client.set(
      `bootstrap:otp:email:${OWNER_EMAIL}`,
      JSON.stringify({ ch: 'ch-1', hs: otpHash, s: salt, ca: String(Date.now()), co: false }),
    );

    await svc.verifyOwnerOtp(OWNER_EMAIL, otp, '10.0.0.1'); // consumes
    await expect(svc.verifyOwnerOtp(OWNER_EMAIL, otp, '10.0.0.1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('verifyOwnerOtp rejects a wrong OTP', async () => {
    const redis = createMockRedisStore();
    const svc = makeService({ ownerEmail: OWNER_EMAIL, redis });

    const otp = '123456';
    const salt = 'deadbeef';
    const hmacSecret = (svc as any).hmacSecret;
    const otpHash = crypto
      .createHmac('sha256', hmacSecret)
      .update(otp + salt)
      .digest('hex');
    await redis.client.set(
      `bootstrap:otp:email:${OWNER_EMAIL}`,
      JSON.stringify({ ch: 'ch-1', hs: otpHash, s: salt, ca: String(Date.now()), co: false }),
    );

    await expect(svc.verifyOwnerOtp(OWNER_EMAIL, '000000', '10.0.0.1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('requestOwnerOtp enforces per-owner-email rate limit', async () => {
    const redis = createMockRedisStore();
    const svc = makeService({ ownerEmail: OWNER_EMAIL, redis });

    // Exhaust the per-owner-email request budget (5 per window).
    for (let i = 0; i < 5; i++) {
      await svc.requestOwnerOtp(OWNER_EMAIL, '10.0.0.1');
    }
    let err: any = null;
    try {
      await svc.requestOwnerOtp(OWNER_EMAIL, '10.0.0.1');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RateLimitException);
  });
});
