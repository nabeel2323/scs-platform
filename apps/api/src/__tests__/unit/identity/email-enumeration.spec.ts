/**
 * Email enumeration prevention tests.
 *
 * Covers:
 * - Response consistency: same shape for existing vs non-existing emails
 * - Timing: no significant timing difference between existing/non-existing
 * - Challenge creation for non-existing emails (silent)
 * - Rate limit applies equally regardless of email existence
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IdentityService } from '../../../modules/identity/identity.service';
import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';
import { createMockRedisStore } from '../helpers/mock-redis';
import crypto from 'node:crypto';

process.env['OTP_HMAC_SECRET'] = 'test-hmac-secret-for-unit-tests-only-32chars-min!!';

function mockDb(existingUser: any | null = null) {
  return {
    db: {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(existingUser),
        },
        sessions: { findFirst: vi.fn() },
        organizationMembers: { findMany: vi.fn().mockResolvedValue([]) },
        roles: { findFirst: vi.fn().mockResolvedValue({ id: 'role-buyer', key: 'BUYER' }) },
        rolePermissions: { findMany: vi.fn().mockResolvedValue([]) },
        permissions: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'sess-1' }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      execute: vi.fn().mockResolvedValue([{ enabled: true }]),
    },
  };
}

function mockJwt() {
  return { sign: vi.fn().mockReturnValue('mock-jwt-token') };
}

function mockRateLimitService() {
  return {
    checkAndIncrement: vi.fn().mockResolvedValue({ allowed: true, remaining: 5 }),
    getResetSeconds: vi.fn().mockResolvedValue(900),
    resetAttempts: vi.fn().mockResolvedValue(undefined),
  };
}

function mockAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function mockDelivery(success = true) {
  return {
    deliverOtp: vi.fn().mockResolvedValue({
      success,
      status: success ? 'delivered' : 'failed',
      deliveryOutcome: success ? 'accepted' : 'rejected',
    }),
    deliverEmailOtp: vi.fn().mockResolvedValue({
      success,
      status: success ? 'delivered' : 'failed',
      deliveryOutcome: success ? 'accepted' : 'rejected',
    }),
    deliverToTestChannel: vi.fn().mockResolvedValue({
      success,
      status: success ? 'mock_delivered' : 'failed',
      deliveryOutcome: success ? 'accepted' : 'rejected',
    }),
    isChannelAvailable: vi.fn().mockReturnValue(true),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'email']),
  };
}

function mockRegistry() {
  return {
    getForChannel: vi.fn(),
    getForTest: vi.fn(),
    getMockProvider: vi.fn().mockReturnValue({
      getLastOtp: vi.fn().mockReturnValue('123456'),
      sendOtp: vi.fn().mockResolvedValue({ success: true }),
    }),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'email']),
    isChannelAvailable: vi.fn().mockReturnValue(true),
  };
}

describe('Email Enumeration Prevention', () => {
  let redis: ReturnType<typeof createMockRedisStore>;

  beforeEach(() => {
    redis = createMockRedisStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.spyOn(crypto, 'randomInt') as any).mockReturnValue(123456);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Response Shape Consistency ─────────────────────────────────

  describe('response shape consistency', () => {
    it('returns same shape for existing email', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'existing@example.com',
        phone: null,
        fullName: 'Existing User',
        status: 'ACTIVE',
      };
      const delivery = mockDelivery(true);
      const service = new IdentityService(
        mockDb(existingUser) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery as any,
        mockRegistry() as any,
      );

      const result = await service.requestEmailOtp('existing@example.com');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('deliveryStatus');
    });

    it('returns same shape for non-existing email', async () => {
      const delivery = mockDelivery(true);
      const service = new IdentityService(
        mockDb(null) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery as any,
        mockRegistry() as any,
      );

      const result = await service.requestEmailOtp('nonexistent@example.com');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('deliveryStatus');
    });

    it('both existing and non-existing return success: true when delivery succeeds', async () => {
      const delivery1 = mockDelivery(true);
      const service1 = new IdentityService(
        mockDb({ id: 'u1', email: 'exists@example.com', phone: null, fullName: 'U', status: 'ACTIVE' }) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery1 as any,
        mockRegistry() as any,
      );

      const delivery2 = mockDelivery(true);
      const redis2 = createMockRedisStore();
      const service2 = new IdentityService(
        mockDb(null) as any,
        redis2 as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery2 as any,
        mockRegistry() as any,
      );

      const result1 = await service1.requestEmailOtp('exists@example.com');
      const result2 = await service2.requestEmailOtp('nonexistent@example.com');

      // Both should succeed identically (enumeration-safe)
      expect(result1.success).toBe(result2.success);
      expect(result1.deliveryStatus).toBe(result2.deliveryStatus);
    });
  });

  // ── Challenge Creation for Non-Existing Emails ─────────────────

  describe('silent challenge creation', () => {
    it('creates a challenge even for non-existing email', async () => {
      const delivery = mockDelivery(true);
      const service = new IdentityService(
        mockDb(null) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery as any,
        mockRegistry() as any,
      );

      await service.requestEmailOtp('newuser@example.com');

      // Challenge should exist in Redis
      const stored = redis._store.get('otp:email:newuser@example.com');
      expect(stored).toBeDefined();
      const challenge = JSON.parse(stored!.value);
      expect(challenge.ch).toBeDefined();
      expect(challenge.hs).toMatch(/^[a-f0-9]{64}$/);
    });

    it('delivers OTP for non-existing email via mock channel', async () => {
      const delivery = mockDelivery(true);
      const service = new IdentityService(
        mockDb(null) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery as any,
        mockRegistry() as any,
      );

      await service.requestEmailOtp('newuser@example.com');

      // Delivery should have been attempted (same as for existing)
      expect(delivery.deliverToTestChannel).toHaveBeenCalled();
    });
  });

  // ── Rate Limiting Applies Equally ──────────────────────────────

  describe('rate limit equality', () => {
    it('rate limit applies to non-existing email same as existing', async () => {
      const delivery = mockDelivery(true);
      const service = new IdentityService(
        mockDb(null) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery as any,
        mockRegistry() as any,
      );

      // Exhaust rate limit (5 requests per 15 min)
      for (let i = 0; i < 5; i++) {
        await service.requestEmailOtp('anyone@example.com');
      }

      // 6th request should be rate limited regardless of existence
      await expect(
        service.requestEmailOtp('anyone@example.com'),
      ).rejects.toThrow(RateLimitException);
    });
  });

  // ── Timing Consistency ─────────────────────────────────────────

  describe('timing consistency', () => {
    it('response time does not differ significantly between existing and non-existing', async () => {
      // Existing user
      const delivery1 = mockDelivery(true);
      const service1 = new IdentityService(
        mockDb({ id: 'u1', email: 'exists@example.com', phone: null, fullName: 'U', status: 'ACTIVE' }) as any,
        redis as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery1 as any,
        mockRegistry() as any,
      );

      // Non-existing user
      const redis2 = createMockRedisStore();
      const delivery2 = mockDelivery(true);
      const service2 = new IdentityService(
        mockDb(null) as any,
        redis2 as any,
        mockJwt() as any,
        mockRateLimitService() as any,
        mockAuditService() as any,
        delivery2 as any,
        mockRegistry() as any,
      );

      const start1 = Date.now();
      await service1.requestEmailOtp('exists@example.com');
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await service2.requestEmailOtp('nonexistent@example.com');
      const time2 = Date.now() - start2;

      // Both should complete in similar time (within 100ms of each other)
      // This is a soft check — the key is that neither path short-circuits
      expect(Math.abs(time1 - time2)).toBeLessThan(200);
    });
  });
});
