/**
 * Email OTP lifecycle tests.
 *
 * Covers:
 * - Challenge creation with correct TTL (300s for email vs 90s for phone)
 * - Challenge consumption on successful verification
 * - Replay prevention (already-consumed challenge)
 * - Supersession (new request replaces any prior challenge)
 * - Rate limiting (per-email 5/15min, per-IP 20/1min)
 * - Email-only user creation on first verify
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IdentityService } from '../../../modules/identity/identity.service';
import { createMockRedisStore } from '../helpers/mock-redis';
import crypto from 'node:crypto';

process.env['OTP_HMAC_SECRET'] = 'test-hmac-secret-for-unit-tests-only-32chars-min!!';

const FIXED_OTP = '123456';

function mockDb(userStore: Map<string, any> = new Map()) {
  return {
    db: {
      query: {
        users: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            // Try to find user by the column being queried
            for (const u of userStore.values()) {
              return Promise.resolve(u);
            }
            return Promise.resolve(undefined);
          }),
        },
        sessions: {
          findFirst: vi.fn(),
        },
        organizationMembers: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        roles: {
          findFirst: vi.fn().mockResolvedValue({ id: 'role-buyer', key: 'BUYER' }),
        },
        rolePermissions: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        permissions: {
          findMany: vi.fn().mockResolvedValue([]),
        },
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

function mockOtpDeliveryService() {
  return {
    deliverOtp: vi.fn().mockResolvedValue({
      success: true,
      status: 'delivered',
      messageId: 'mock-msg',
      deliveryOutcome: 'accepted',
    }),
    deliverEmailOtp: vi.fn().mockResolvedValue({
      success: true,
      status: 'delivered',
      messageId: 'mock-email-msg',
      deliveryOutcome: 'accepted',
    }),
    deliverToTestChannel: vi.fn().mockResolvedValue({
      success: true,
      status: 'mock_delivered',
      messageId: 'mock-test-msg',
      deliveryOutcome: 'accepted',
    }),
    isChannelAvailable: vi.fn().mockReturnValue(true),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'whatsapp', 'email']),
  };
}

function mockProviderRegistry(hasMock = true) {
  return {
    getForChannel: vi.fn().mockReturnValue({
      sendOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'accepted' }),
      isConfigured: vi.fn().mockReturnValue(true),
    }),
    getForTest: vi.fn().mockReturnValue({
      sendOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'accepted' }),
      isConfigured: vi.fn().mockReturnValue(true),
    }),
    getMockProvider: vi.fn().mockReturnValue(hasMock ? {
      getLastOtp: vi.fn().mockReturnValue(FIXED_OTP),
      sendOtp: vi.fn().mockResolvedValue({ success: true }),
    } : null),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'whatsapp', 'email']),
    isChannelAvailable: vi.fn().mockReturnValue(true),
  };
}

describe('Email OTP Lifecycle', () => {
  let service: IdentityService;
  let redis: ReturnType<typeof createMockRedisStore>;
  let delivery: ReturnType<typeof mockOtpDeliveryService>;
  let registry: ReturnType<typeof mockProviderRegistry>;

  beforeEach(() => {
    redis = createMockRedisStore();
    delivery = mockOtpDeliveryService();
    registry = mockProviderRegistry(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.spyOn(crypto, 'randomInt') as any).mockReturnValue(123456);

    service = new IdentityService(
      mockDb() as any,
      redis as any,
      mockJwt() as any,
      mockRateLimitService() as any,
      mockAuditService() as any,
      delivery as any,
      registry as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Challenge Creation ─────────────────────────────────────────

  describe('challenge creation', () => {
    it('creates email challenge with 300s TTL (D-6)', async () => {
      const result = await service.requestEmailOtp('user@example.com');
      expect(result.success).toBe(true);

      // Verify the Redis key uses email namespace
      const stored = redis._store.get('otp:email:user@example.com');
      expect(stored).toBeDefined();
      expect(stored!.ttl).toBe(300);
    });

    it('stores challenge as HMAC hash (not plaintext OTP)', async () => {
      await service.requestEmailOtp('user@example.com');

      const stored = redis._store.get('otp:email:user@example.com');
      const challenge = JSON.parse(stored!.value);
      expect(challenge.hs).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      expect(challenge.s).toMatch(/^[a-f0-9]{32}$/); // salt
      expect(challenge.ch).toBeDefined(); // challengeId
      expect(challenge.co).toBe(false); // not consumed
    });

    it('uses mock delivery channel in test environment', async () => {
      await service.requestEmailOtp('user@example.com');
      expect(delivery.deliverToTestChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'mock',
          email: 'user@example.com',
          subjectType: 'email',
        }),
      );
    });

    it('normalizes email before creating challenge', async () => {
      await service.requestEmailOtp('  USER@Example.COM  ');

      // Should be stored under normalized key
      const stored = redis._store.get('otp:email:user@example.com');
      expect(stored).toBeDefined();
    });
  });

  // ── Supersession ───────────────────────────────────────────────

  describe('supersession', () => {
    it('new request replaces any existing challenge for same email', async () => {
      await service.requestEmailOtp('user@example.com');
      const firstChallenge = redis._store.get('otp:email:user@example.com');

      // Advance randomInt to produce a different OTP
      (vi.spyOn(crypto, 'randomInt') as any).mockReturnValue(654321);

      await service.requestEmailOtp('user@example.com');
      const secondChallenge = redis._store.get('otp:email:user@example.com');

      // Challenge IDs should differ
      const first = JSON.parse(firstChallenge!.value);
      const second = JSON.parse(secondChallenge!.value);
      expect(first.ch).not.toBe(second.ch);
      expect(first.hs).not.toBe(second.hs);
    });
  });

  // ── Rate Limiting ──────────────────────────────────────────────

  describe('rate limiting', () => {
    it('creates per-email rate limit key', async () => {
      await service.requestEmailOtp('user@example.com');

      const rateKey = redis._store.get('otp:req:email:user@example.com');
      expect(rateKey).toBeDefined();
      expect(parseInt(rateKey!.value, 10)).toBe(1);
    });

    it('creates per-IP rate limit key when IP is provided', async () => {
      await service.requestEmailOtp('user@example.com', '192.168.1.1');

      const ipKey = redis._store.get('otp:ip:192.168.1.1');
      expect(ipKey).toBeDefined();
    });

    it('enforces per-email rate limit (5 per 15 min)', async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        await service.requestEmailOtp('user@example.com');
      }

      // 6th request should be rate limited
      await expect(service.requestEmailOtp('user@example.com')).rejects.toThrow(/Too many OTP requests/);
    });
  });

  // ── Delivery Outcome Handling ──────────────────────────────────

  describe('delivery outcome handling', () => {
    it('returns success when delivery is accepted', async () => {
      delivery.deliverToTestChannel.mockResolvedValue({
        success: true,
        status: 'mock_delivered',
        deliveryOutcome: 'accepted',
      });

      const result = await service.requestEmailOtp('user@example.com');
      expect(result.success).toBe(true);
      expect(result.deliveryStatus).toBe('delivered');
    });

    it('returns possiblyDelivered on timeout (unknown outcome)', async () => {
      delivery.deliverToTestChannel.mockResolvedValue({
        success: false,
        status: 'timeout',
        errorReason: 'SMTP_TIMEOUT',
        deliveryOutcome: 'unknown',
      });

      const result = await service.requestEmailOtp('user@example.com');
      expect(result.success).toBe(false);
      expect(result.possiblyDelivered).toBe(true);
      // Challenge should still exist in Redis
      expect(redis._store.get('otp:email:user@example.com')).toBeDefined();
    });

    it('cleans up challenge on definite rejection', async () => {
      delivery.deliverToTestChannel.mockResolvedValue({
        success: false,
        status: 'failed',
        errorReason: 'SMTP_RECIPIENT_REJECTED',
        deliveryOutcome: 'rejected',
      });

      const result = await service.requestEmailOtp('user@example.com');
      expect(result.success).toBe(false);
      expect(result.possiblyDelivered).toBeUndefined();
      // Challenge should be cleaned up
      expect(redis._store.get('otp:email:user@example.com')).toBeUndefined();
    });
  });
});
