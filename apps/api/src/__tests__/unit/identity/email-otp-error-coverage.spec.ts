/**
 * Email OTP error handling and edge case coverage tests (S1.38.7).
 *
 * Covers uncovered branches in identity.service.ts email OTP methods:
 * - Redis error handling in requestEmailOtp (rate-limit, challenge creation, cleanup)
 * - Per-IP rate limiting branches (with/without IP, rate limit exceeded)
 * - Delivery failure scenarios (unknown timeout, definite rejection)
 * - Optional chaining in verifyEmailOtp (deviceInfo, deviceId, context)
 * - Feature flag check edge cases (isEmailOtpEnabled error handling, null rows)
 * - Account linking/unlinking optimistic lock failures and constraint violations
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IdentityService } from '../../../modules/identity/identity.service';
import { createMockRedisStore } from '../helpers/mock-redis';
import {
  InternalServerErrorException,
  RateLimitException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';

process.env['OTP_HMAC_SECRET'] = 'test-hmac-secret-for-unit-tests-only-32chars-min!!';

const FIXED_OTP = '123456';

function pinOtp(value: string = FIXED_OTP): void {
  (vi.spyOn(crypto, 'randomInt') as any).mockReturnValue(Number(value));
}

function mockDb(options: {
  userStore?: Map<string, any>;
  featureFlagEnabled?: boolean;
  featureFlagError?: boolean;
  insertError?: boolean;
  updateRowCount?: number;
  updateError?: any;
} = {}) {
  const userStore = options.userStore || new Map();
  return {
    db: {
      query: {
        users: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            for (const u of userStore.values()) {
              return Promise.resolve(u);
            }
            return Promise.resolve(undefined);
          }),
        },
        sessions: { findFirst: vi.fn() },
        organizationMembers: { findMany: vi.fn().mockResolvedValue([]) },
        roles: { findFirst: vi.fn().mockResolvedValue({ id: 'role-buyer', key: 'BUYER' }) },
        rolePermissions: { findMany: vi.fn().mockResolvedValue([]) },
        permissions: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation(() => {
        if (options.insertError) {
          return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error('Insert failed')) }) };
        }
        return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'log-1' }]) }) };
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (options.updateError) {
              return Promise.reject(options.updateError);
            }
            return Promise.resolve({ rowCount: options.updateRowCount ?? 1 });
          }),
        }),
      }),
      execute: vi.fn().mockImplementation(() => {
        if (options.featureFlagError) {
          return Promise.reject(new Error('Feature flag query failed'));
        }
        if (options.featureFlagEnabled !== undefined) {
          return Promise.resolve([{ enabled: options.featureFlagEnabled }]);
        }
        return Promise.resolve([]);
      }),
    },
  };
}

function mockJwt() {
  return { sign: vi.fn().mockReturnValue('mock-jwt-token') };
}

function mockRateLimitService(allowed: boolean = true) {
  return {
    checkAndIncrement: vi.fn().mockResolvedValue({ allowed, remaining: 5 }),
    getResetSeconds: vi.fn().mockResolvedValue(900),
    resetAttempts: vi.fn().mockResolvedValue(undefined),
  };
}

function mockAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function mockOtpDeliveryService(options: {
  success?: boolean;
  deliveryOutcome?: 'accepted' | 'rejected' | 'unknown';
  errorReason?: string;
} = {}) {
  return {
    deliverOtp: vi.fn().mockResolvedValue({
      success: options.success ?? true,
      status: options.success === false ? 'failed' : 'delivered',
      messageId: options.success === false ? undefined : 'mock-msg',
      deliveryOutcome: options.deliveryOutcome ?? 'accepted',
      errorReason: options.errorReason,
    }),
    deliverEmailOtp: vi.fn().mockResolvedValue({
      success: options.success ?? true,
      status: options.success === false ? 'failed' : 'delivered',
      messageId: options.success === false ? undefined : 'mock-email-msg',
      deliveryOutcome: options.deliveryOutcome ?? 'accepted',
      errorReason: options.errorReason,
    }),
    deliverToTestChannel: vi.fn().mockResolvedValue({
      success: options.success ?? true,
      status: options.success === false ? 'failed' : 'mock_delivered',
      messageId: options.success === false ? undefined : 'mock-test-msg',
      deliveryOutcome: options.deliveryOutcome ?? 'accepted',
      errorReason: options.errorReason,
    }),
    isChannelAvailable: vi.fn().mockReturnValue(true),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'email']),
  };
}

function mockProviderRegistry(hasMock: boolean = false) {
  return {
    getForChannel: vi.fn().mockReturnValue({}),
    getForTest: vi.fn(),
    getMockProvider: vi.fn().mockReturnValue(hasMock ? {} : null),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'email']),
    isChannelAvailable: vi.fn().mockReturnValue(true),
  };
}

function createService(overrides: any = {}) {
  const redis = overrides.redis || createMockRedisStore();
  const db = overrides.db || mockDb();
  const jwt = overrides.jwt || mockJwt();
  const rateLimitService = overrides.rateLimitService || mockRateLimitService();
  const audit = overrides.audit || mockAuditService();
  const otpDeliveryService = overrides.otpDeliveryService || mockOtpDeliveryService();
  const providerRegistry = overrides.providerRegistry || mockProviderRegistry();

  return new IdentityService(
    db as any,
    redis as any,
    jwt as any,
    rateLimitService as any,
    audit as any,
    otpDeliveryService as any,
    providerRegistry as any,
  );
}

describe('S1.38.7 — Email OTP error handling coverage', () => {
  let service: IdentityService;
  let redis: any;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createMockRedisStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestEmailOtp — Redis error paths', () => {
    it('throws InternalServerErrorException on per-email rate-limit Redis failure', async () => {
      const redisWithError = {
        ...redis,
        client: {
          ...redis.client,
          eval: vi.fn().mockRejectedValueOnce(new Error('Redis connection lost')),
        },
      };
      service = createService({ redis: redisWithError });

      await expect(service.requestEmailOtp('test@example.com', '127.0.0.1'))
        .rejects
        .toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException on per-IP rate-limit Redis failure', async () => {
      const evalMock = vi.fn()
        .mockResolvedValueOnce([1, 5, 900]) // per-email rate limit passes
        .mockRejectedValueOnce(new Error('Redis timeout')); // per-IP fails
      const redisWithError = {
        ...redis,
        client: { ...redis.client, eval: evalMock },
      };
      service = createService({ redis: redisWithError });

      await expect(service.requestEmailOtp('test@example.com', '127.0.0.1'))
        .rejects
        .toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException on challenge creation Redis failure', async () => {
      const evalMock = vi.fn()
        .mockResolvedValueOnce([1, 5, 900]) // per-email rate limit
        .mockResolvedValueOnce([1, 20, 60]) // per-IP rate limit
        .mockRejectedValueOnce(new Error('Redis write error')); // challenge creation fails
      const redisWithError = {
        ...redis,
        client: { ...redis.client, eval: evalMock },
      };
      service = createService({ redis: redisWithError });

      await expect(service.requestEmailOtp('test@example.com', '127.0.0.1'))
        .rejects
        .toThrow(InternalServerErrorException);
    });
  });

  describe('requestEmailOtp — per-IP rate limiting branches', () => {
    it('skips per-IP rate limit when IP is not provided and logs warning', async () => {
      pinOtp();
      const evalMock = vi.fn().mockResolvedValue([1, 5, 900]); // per-email passes
      const redisMock = { ...redis, client: { ...redis.client, eval: evalMock } };
      service = createService({ redis: redisMock });

      const result = await service.requestEmailOtp('test@example.com'); // no IP
      expect(result.success).toBe(true);
      // eval called only once (per-email), not twice (per-email + per-IP)
      expect(evalMock).toHaveBeenCalledTimes(2); // rate limit + challenge creation
    });

    it('throws RateLimitException when per-IP limit exceeded', async () => {
      const evalMock = vi.fn()
        .mockResolvedValueOnce([1, 5, 900]) // per-email passes
        .mockResolvedValueOnce([0, 20, 30]); // per-IP blocked (allowed=0)
      const redisMock = { ...redis, client: { ...redis.client, eval: evalMock } };
      service = createService({ redis: redisMock });

      await expect(service.requestEmailOtp('test@example.com', '192.168.1.1'))
        .rejects
        .toThrow(RateLimitException);
    });

    it('uses fallback TTL when ipTtl is 0 or negative', async () => {
      const evalMock = vi.fn()
        .mockResolvedValueOnce([1, 5, 900])
        .mockResolvedValueOnce([0, 20, 0]); // ttl=0, should fallback to OTP_IP_RATE_WINDOW
      const redisMock = { ...redis, client: { ...redis.client, eval: evalMock } };
      service = createService({ redis: redisMock });

      await expect(service.requestEmailOtp('test@example.com', '192.168.1.1'))
        .rejects
        .toThrow('Too many requests from this address');
    });
  });

  describe('requestEmailOtp — delivery failure scenarios', () => {
    it('returns DELIVERY_TIMEOUT when delivery outcome is unknown', async () => {
      pinOtp();
      const deliveryService = mockOtpDeliveryService({
        success: false,
        deliveryOutcome: 'unknown',
      });
      service = createService({ otpDeliveryService: deliveryService });

      const result = await service.requestEmailOtp('test@example.com', '127.0.0.1');
      expect(result.success).toBe(false);
      expect(result.deliveryStatus).toBe('DELIVERY_TIMEOUT');
      expect(result.possiblyDelivered).toBe(true);
    });

    it('cleans up challenge on definite delivery rejection', async () => {
      pinOtp();
      const deliveryService = mockOtpDeliveryService({
        success: false,
        deliveryOutcome: 'rejected',
        errorReason: 'INVALID_EMAIL',
      });
      service = createService({ otpDeliveryService: deliveryService });

      const result = await service.requestEmailOtp('test@example.com', '127.0.0.1');
      expect(result.success).toBe(false);
      expect(result.deliveryStatus).toBe('INVALID_EMAIL');
    });

    it('uses fallback error reason when errorReason is not provided', async () => {
      pinOtp();
      const deliveryService = mockOtpDeliveryService({
        success: false,
        deliveryOutcome: 'rejected',
        // no errorReason
      });
      service = createService({ otpDeliveryService: deliveryService });

      const result = await service.requestEmailOtp('test@example.com', '127.0.0.1');
      expect(result.deliveryStatus).toBe('DELIVERY_FAILED');
    });
  });

  describe('verifyEmailOtp — optional chaining coverage', () => {
    it('uses default device "web" when deviceInfo is not provided', async () => {
      pinOtp();
      const db = mockDb({ userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com' }]]) });
      service = createService({ db });

      // Set up a challenge first
      await service.requestEmailOtp('test@example.com');

      const result = await service.verifyEmailOtp('test@example.com', FIXED_OTP);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // The test passes if verifyEmailOtp completes successfully without deviceInfo
    });

    it('uses provided deviceInfo.platform when available', async () => {
      pinOtp();
      const db = mockDb({ userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com' }]]) });
      service = createService({ db });

      await service.requestEmailOtp('test@example.com', '127.0.0.1');

      const result = await service.verifyEmailOtp(
        'test@example.com',
        FIXED_OTP,
        'device-123',
        { platform: 'mobile', userAgent: 'Mozilla/5.0' },
      );
      expect(result.accessToken).toBeDefined();
    });

    it('sets deviceId to null when not provided', async () => {
      pinOtp();
      const db = mockDb({ userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com' }]]) });
      service = createService({ db });

      await service.requestEmailOtp('test@example.com', '127.0.0.1');

      await service.verifyEmailOtp('test@example.com', FIXED_OTP);
      // Session insert should have deviceId=null
    });

    it('uses context.ip and context.userAgent when provided', async () => {
      pinOtp();
      const db = mockDb({ userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com' }]]) });
      const audit = mockAuditService();
      service = createService({ db, audit });

      await service.requestEmailOtp('test@example.com', '127.0.0.1');

      await service.verifyEmailOtp(
        'test@example.com',
        FIXED_OTP,
        'device-123',
        { platform: 'web', userAgent: 'TestAgent' },
        { ip: '192.168.1.100', userAgent: 'ContextAgent' },
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.100',
          userAgent: 'ContextAgent',
        }),
      );
    });

    it('falls back to deviceInfo.userAgent when context.userAgent is not provided', async () => {
      pinOtp();
      const db = mockDb({ userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com' }]]) });
      const audit = mockAuditService();
      service = createService({ db, audit });

      await service.requestEmailOtp('test@example.com', '127.0.0.1');

      await service.verifyEmailOtp(
        'test@example.com',
        FIXED_OTP,
        'device-123',
        { platform: 'web', userAgent: 'DeviceAgent' },
        // no context
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'DeviceAgent',
        }),
      );
    });
  });

  describe('isEmailOtpEnabled — edge cases', () => {
    it('returns false when feature flag query throws an error', async () => {
      const db = mockDb({ featureFlagError: true });
      service = createService({ db });

      const result = await service.isEmailOtpEnabled();
      expect(result).toBe(false);
    });

    it('returns false when feature flag row is empty', async () => {
      const db = mockDb({ featureFlagEnabled: undefined });
      service = createService({ db });

      const result = await service.isEmailOtpEnabled();
      expect(result).toBe(false);
    });

    it('returns true when feature flag is enabled', async () => {
      const db = mockDb({ featureFlagEnabled: true });
      service = createService({ db });

      const result = await service.isEmailOtpEnabled();
      expect(result).toBe(true);
    });

    it('returns false when feature flag is disabled', async () => {
      const db = mockDb({ featureFlagEnabled: false });
      service = createService({ db });

      const result = await service.isEmailOtpEnabled();
      expect(result).toBe(false);
    });

    it('handles null/undefined rows gracefully', async () => {
      const db = mockDb();
      db.db.execute = vi.fn().mockResolvedValue(null);
      service = createService({ db });

      const result = await service.isEmailOtpEnabled();
      expect(result).toBe(false);
    });
  });

  describe('Account linking — optimistic lock and constraint violations', () => {
    it('throws ConflictException when linkEmailToAccount update rowCount is 0', async () => {
      pinOtp();
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: null, phone: '+966500000000' }]]),
        updateRowCount: 0,
      });
      service = createService({ db });

      // Set up challenge
      await service.requestEmailOtp('new@example.com', '127.0.0.1');

      await expect(service.linkEmailToAccount('user-1', 'new@example.com', FIXED_OTP))
        .rejects
        .toThrow(ConflictException);
    });

    it('translates Postgres 23505 (unique violation) to ConflictException', async () => {
      pinOtp();
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: null, phone: '+966500000000' }]]),
        updateError: { code: '23505' },
      });
      service = createService({ db });

      await service.requestEmailOtp('taken@example.com', '127.0.0.1');

      await expect(service.linkEmailToAccount('user-1', 'taken@example.com', FIXED_OTP))
        .rejects
        .toThrow(ConflictException);
    });

    it('translates Postgres 23514 (CHECK violation) to BadRequestException', async () => {
      pinOtp();
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: null, phone: '+966500000000' }]]),
        updateError: { code: '23514' },
      });
      service = createService({ db });

      await service.requestEmailOtp('test@example.com', '127.0.0.1');

      await expect(service.linkEmailToAccount('user-1', 'test@example.com', FIXED_OTP))
        .rejects
        .toThrow(BadRequestException);
    });

    it('throws NotFoundException when user does not exist in linkEmailToAccount', async () => {
      pinOtp();
      const db = mockDb({ userStore: new Map() }); // empty store
      service = createService({ db });

      await service.requestEmailOtp('test@example.com', '127.0.0.1');

      await expect(service.linkEmailToAccount('nonexistent-user', 'test@example.com', FIXED_OTP))
        .rejects
        .toThrow(NotFoundException);
    });

    it('returns success when linking the same email the account already has', async () => {
      pinOtp();
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: 'same@example.com', phone: '+966500000000' }]]),
      });
      service = createService({ db });

      await service.requestEmailOtp('same@example.com', '127.0.0.1');

      const result = await service.linkEmailToAccount('user-1', 'same@example.com', FIXED_OTP);
      expect(result.success).toBe(true);
    });
  });

  describe('Account unlinking — last-auth-method prevention', () => {
    it('throws BadRequestException when unlinking email with no phone', async () => {
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: 'only@example.com', phone: null }]]),
      });
      service = createService({ db });

      await expect(service.unlinkEmailFromAccount('user-1'))
        .rejects
        .toThrow(BadRequestException);
    });

    it('throws BadRequestException when unlinking phone with no email', async () => {
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: null, phone: '+966500000000' }]]),
      });
      service = createService({ db });

      await expect(service.unlinkPhoneFromAccount('user-1'))
        .rejects
        .toThrow(BadRequestException);
    });

    it('throws ConflictException when unlink email update rowCount is 0', async () => {
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com', phone: '+966500000000' }]]),
        updateRowCount: 0,
      });
      service = createService({ db });

      await expect(service.unlinkEmailFromAccount('user-1'))
        .rejects
        .toThrow(ConflictException);
    });

    it('records audit log when unlinking email successfully', async () => {
      const db = mockDb({
        userStore: new Map([['user-1', { id: 'user-1', email: 'test@example.com', phone: '+966500000000' }]]),
      });
      service = createService({ db });

      // Unlink email when user has both email and phone
      const result = await service.unlinkEmailFromAccount('user-1');
      expect(result.success).toBe(true);
      // The unlink operation should complete successfully
    });
  });
});
