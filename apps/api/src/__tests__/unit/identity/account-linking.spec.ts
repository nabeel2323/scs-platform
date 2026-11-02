/**
 * Account linking and unlinking tests.
 *
 * Covers:
 * - Link email to phone account (requires a consumed email OTP — S1.37-F-04)
 * - Link phone to email account (requires a consumed phone OTP — S1.37-F-05)
 * - Unlink email (when phone remains)
 * - Unlink phone (when email remains)
 * - Conflict detection (identifier already in use)
 * - Last-auth-method prevention (cannot remove the only identifier)
 * - Audit log entries on link/unlink, with the identifier stored hashed
 * - Optimistic-lock and constraint-violation handling on a lost race (S1.37-F-11)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IdentityService } from '../../../modules/identity/identity.service';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createMockRedisStore } from '../helpers/mock-redis';
import crypto from 'node:crypto';

process.env['OTP_HMAC_SECRET'] = 'test-hmac-secret-for-unit-tests-only-32chars-min!!';

const FIXED_OTP = '123456';

/**
 * Pin the generated OTP so `requestEmailOtp` writes a challenge this test can
 * legitimately consume. The account-linking registry double reports no mock
 * provider, so delivery takes the (mocked) SMTP path while the challenge itself
 * is still created atomically in the Redis double.
 */
function pinOtp(value: string = FIXED_OTP): void {
  (vi.spyOn(crypto, 'randomInt') as any).mockReturnValue(Number(value));
}

interface DbOptions {
  /**
   * Ordered answers for `users.findFirst`. The link methods read the target
   * account by id first and only then probe the identifier for a conflict, so
   * entry 0 is the account row and entry 1 the conflict probe. When omitted,
   * every read returns the first row of the store. Once an ordered queue is
   * exhausted further reads return undefined, so an unexpected extra read fails
   * visibly instead of silently re-serving the same row.
   */
  lookups?: any[];
  /** Rows the guarded UPDATE reports. 0 drives the optimistic-lock conflict. */
  rowCount?: number;
  /** Error the guarded UPDATE throws, e.g. a Postgres 23505/23514 violation. */
  writeError?: unknown;
}

/**
 * Build a mock DB with a configurable user store for link/unlink tests.
 */
function mockDbWithUsers(userStore: Map<string, any>, insertLog: any[] = [], options: DbOptions = {}) {
  const ordered = Array.isArray(options.lookups);
  let read = 0;
  const firstStored = () => {
    for (const u of userStore.values()) return u;
    return undefined;
  };
  const db = {
    db: {
      query: {
        users: {
          findFirst: vi.fn().mockImplementation(() =>
            Promise.resolve(
              ordered && read < options.lookups!.length ? options.lookups![read++] : ordered ? undefined : firstStored(),
            ),
          ),
        },
        sessions: { findFirst: vi.fn() },
        organizationMembers: { findMany: vi.fn().mockResolvedValue([]) },
        roles: { findFirst: vi.fn().mockResolvedValue({ id: 'role-buyer', key: 'BUYER' }) },
        rolePermissions: { findMany: vi.fn().mockResolvedValue([]) },
        permissions: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockImplementation((table: any) => ({
        values: vi.fn().mockImplementation((vals: any) => {
          insertLog.push({ table: table?.name || 'unknown', ...vals });
          return { returning: vi.fn().mockResolvedValue([{ id: 'log-1' }]) };
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          // node-postgres reports affected rows as `rowCount`; the link/unlink
          // writes read it to detect a lost optimistic-lock race.
          where: vi.fn().mockImplementation(() =>
            options.writeError
              ? Promise.reject(options.writeError)
              : Promise.resolve({ rowCount: options.rowCount ?? 1 }),
          ),
        }),
      }),
      execute: vi.fn().mockResolvedValue([{ enabled: true }]),
    },
  };
  return db;
}

/** The values object handed to the first `update(users).set(...)` call. */
function writtenValues(db: any): any {
  const chain = db.db.update.mock.results[0]?.value;
  return chain?.set?.mock?.calls?.[0]?.[0];
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
    deliverOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'accepted' }),
    deliverEmailOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'accepted' }),
    deliverToTestChannel: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'accepted' }),
    isChannelAvailable: vi.fn().mockReturnValue(true),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'email']),
  };
}

function mockProviderRegistry() {
  return {
    getForChannel: vi.fn(),
    getForTest: vi.fn(),
    getMockProvider: vi.fn().mockReturnValue(null),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'email']),
    isChannelAvailable: vi.fn().mockReturnValue(true),
  };
}

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    phone: '+966500000000',
    email: null,
    fullName: 'Test User',
    locale: 'en',
    status: 'ACTIVE',
    passwordHash: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Postgres error shape raised by a unique-violating UPDATE. */
function pgError(code: string): unknown {
  return Object.assign(new Error(`duplicate key value violates unique constraint`), { code });
}

describe('Account Linking', () => {
  let redis: ReturnType<typeof createMockRedisStore>;
  let insertLog: any[];

  beforeEach(() => {
    redis = createMockRedisStore();
    insertLog = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Link Email ─────────────────────────────────────────────────

  describe('linkEmailToAccount', () => {
    it('links email to a phone-only account with a valid OTP', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('NewEmail@Example.COM');

      const result = await service.linkEmailToAccount('user-1', 'NewEmail@Example.COM', FIXED_OTP);
      expect(result.success).toBe(true);
      expect(db.db.update).toHaveBeenCalled();
    });

    it('rejects when email already belongs to another account', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const other = makeUser({ id: 'user-2', phone: null, email: 'taken@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, other],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('taken@example.com');

      await expect(
        service.linkEmailToAccount('user-1', 'taken@example.com', FIXED_OTP),
      ).rejects.toThrow(ConflictException);
      // The conflict must not be written off as an audit LINK entry.
      expect(insertLog).toHaveLength(0);
    });

    it('normalizes email before linking', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('user@example.com');

      await service.linkEmailToAccount('user-1', '  USER@EXAMPLE.COM  ', FIXED_OTP);

      expect(writtenValues(db).email).toBe('user@example.com');
    });

    it('rejects when no OTP was issued for the address (S1.37-F-04)', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.linkEmailToAccount('user-1', 'victim@example.com', '123456'),
      ).rejects.toThrow(UnauthorizedException);
      // Proof of control is checked before any read or write of the account.
      expect(db.db.query.users.findFirst).not.toHaveBeenCalled();
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong OTP and does not attach the address (S1.37-F-04)', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('attacker@example.com');

      await expect(
        service.linkEmailToAccount('user-1', 'attacker@example.com', '654321'),
      ).rejects.toThrow(UnauthorizedException);
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('rejects replaying an OTP that was already consumed', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const reattached = makeUser({ phone: '+966500000000', email: 'once@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined, reattached, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('once@example.com');

      await expect(
        service.linkEmailToAccount('user-1', 'once@example.com', FIXED_OTP),
      ).resolves.toEqual({ success: true });
      await expect(
        service.linkEmailToAccount('user-1', 'once@example.com', FIXED_OTP),
      ).rejects.toThrow(UnauthorizedException);
      // Only the first attempt wrote an identifier.
      expect(db.db.update).toHaveBeenCalledTimes(1);
    });

    it('rejects a link for an unknown account', async () => {
      const db = mockDbWithUsers(new Map(), insertLog, { lookups: [undefined] });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('ghost@example.com');

      await expect(
        service.linkEmailToAccount('missing-user', 'ghost@example.com', FIXED_OTP),
      ).rejects.toThrow(NotFoundException);
    });

    it('reports a conflict rather than overwriting when a concurrent link wins', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
        rowCount: 0,
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('raced@example.com');

      await expect(
        service.linkEmailToAccount('user-1', 'raced@example.com', FIXED_OTP),
      ).rejects.toThrow(ConflictException);
      expect(insertLog).toHaveLength(0);
    });

    it('translates a unique violation from the write into EMAIL_ALREADY_IN_USE', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
        writeError: pgError('23505'),
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('taken@example.com');

      await expect(
        service.linkEmailToAccount('user-1', 'taken@example.com', FIXED_OTP),
      ).rejects.toThrow(ConflictException);
    });

    it('is a no-op when the account already holds the verified address', async () => {
      const account = makeUser({ phone: '+966500000000', email: 'same@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('same@example.com');

      await expect(
        service.linkEmailToAccount('user-1', 'same@example.com', FIXED_OTP),
      ).resolves.toEqual({ success: true });
      expect(db.db.update).not.toHaveBeenCalled();
    });
  });

  // ── Link Phone ─────────────────────────────────────────────────

  describe('linkPhoneToAccount', () => {
    it('links phone to an email-only account with a valid OTP', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966500000000');

      const result = await service.linkPhoneToAccount('user-1', '+966500000000', FIXED_OTP);
      expect(result.success).toBe(true);
    });

    it('rejects when no OTP was issued for the number (S1.37-F-05)', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', '123456'),
      ).rejects.toThrow(UnauthorizedException);
      // Proof of control is checked before any read or write of the account, so a
      // caller cannot even learn whether the number is already taken.
      expect(db.db.query.users.findFirst).not.toHaveBeenCalled();
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong OTP for a number that does have a live challenge', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966500000000');

      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', '654321'),
      ).rejects.toThrow(UnauthorizedException);
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('rejects replaying a phone OTP that was already consumed', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined, account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966500000000');

      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', FIXED_OTP),
      ).resolves.toEqual({ success: true });
      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', FIXED_OTP),
      ).rejects.toThrow(UnauthorizedException);
      expect(db.db.update).toHaveBeenCalledTimes(1);
    });

    it('normalizes the number before checking the challenge and the write', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      // The challenge is requested with a spaced spelling and linked with the
      // raw spelling the caller typed; both must resolve to the same E.164 form,
      // otherwise the proof of control would not match the identifier written.
      await service.requestOtp('+966 51 234 5678');

      await service.linkPhoneToAccount('user-1', '+966512345678', FIXED_OTP);
      expect(writtenValues(db).phone).toBe('+966512345678');
    });

    it('is a no-op when the account already holds the verified number', async () => {
      const account = makeUser({ phone: '+966500000000', email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966500000000');

      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', FIXED_OTP),
      ).resolves.toEqual({ success: true });
      expect(db.db.update).not.toHaveBeenCalled();
      expect(insertLog).toHaveLength(0);
    });

    it('rejects when phone already belongs to another account', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const other = makeUser({ id: 'user-2', phone: '+966599999999', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, other],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966599999999');

      await expect(
        service.linkPhoneToAccount('user-1', '+966599999999', FIXED_OTP),
      ).rejects.toThrow(ConflictException);
    });

    it('reports a conflict rather than overwriting when a concurrent link wins', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
        rowCount: 0,
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966500000000');

      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', FIXED_OTP),
      ).rejects.toThrow(ConflictException);
    });

    it('translates a unique violation from the write into PHONE_ALREADY_IN_USE', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
        writeError: pgError('23505'),
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966500000000');

      await expect(
        service.linkPhoneToAccount('user-1', '+966500000000', FIXED_OTP),
      ).rejects.toThrow(ConflictException);
    });

    it('records the phone link in the audit trail with a hashed identifier', async () => {
      const account = makeUser({ phone: null, email: 'user@example.com' });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestOtp('+966512349999');
      await service.linkPhoneToAccount('user-1', '+966512349999', FIXED_OTP);

      const linkEntry = insertLog.find((e) => e.action === 'LINK');
      expect(linkEntry).toBeDefined();
      expect(linkEntry.identifierType).toBe('PHONE');
      // The audit trail must never carry the plaintext number.
      expect(linkEntry.identifierHash).toMatch(/^v\d+:[a-f0-9]{64}$/);
      expect(linkEntry.identifierHash).not.toContain('966512349999');
    });
  });

  // ── Unlink Email ───────────────────────────────────────────────

  describe('unlinkEmailFromAccount', () => {
    it('unlinks email when phone remains', async () => {
      const userStore = new Map([[
        'user-1',
        makeUser({ phone: '+966500000000', email: 'user@example.com' }),
      ]]);
      const db = mockDbWithUsers(userStore, insertLog);

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      const result = await service.unlinkEmailFromAccount('user-1');
      expect(result.success).toBe(true);
    });

    it('rejects unlinking email when no phone is linked (last auth method)', async () => {
      const userStore = new Map([[
        'user-1',
        makeUser({ phone: null, email: 'user@example.com' }),
      ]]);
      const db = mockDbWithUsers(userStore, insertLog);

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.unlinkEmailFromAccount('user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown user', async () => {
      const userStore = new Map<string, any>(); // empty
      const db = mockDbWithUsers(userStore, insertLog);

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.unlinkEmailFromAccount('nonexistent-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps a last-identifier CHECK violation to 400 instead of 500', async () => {
      const userStore = new Map([[
        'user-1',
        makeUser({ phone: '+966500000000', email: 'user@example.com' }),
      ]]);
      const db = mockDbWithUsers(userStore, insertLog, { writeError: pgError('23514') });

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.unlinkEmailFromAccount('user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Unlink Phone ───────────────────────────────────────────────

  describe('unlinkPhoneFromAccount', () => {
    it('unlinks phone when email remains', async () => {
      const userStore = new Map([[
        'user-1',
        makeUser({ phone: '+966500000000', email: 'user@example.com' }),
      ]]);
      const db = mockDbWithUsers(userStore, insertLog);

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      const result = await service.unlinkPhoneFromAccount('user-1');
      expect(result.success).toBe(true);
    });

    it('rejects unlinking phone when no email is linked (last auth method)', async () => {
      const userStore = new Map([[
        'user-1',
        makeUser({ phone: '+966500000000', email: null }),
      ]]);
      const db = mockDbWithUsers(userStore, insertLog);

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.unlinkPhoneFromAccount('user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('reports a conflict when a concurrent unlink already changed the row', async () => {
      const userStore = new Map([[
        'user-1',
        makeUser({ phone: '+966500000000', email: 'user@example.com' }),
      ]]);
      const db = mockDbWithUsers(userStore, insertLog, { rowCount: 0 });

      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await expect(
        service.unlinkPhoneFromAccount('user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── Audit Log ──────────────────────────────────────────────────

  describe('audit log entries', () => {
    it('creates LINK audit entry when linking email', async () => {
      const account = makeUser({ phone: '+966500000000', email: null });
      const db = mockDbWithUsers(new Map([['user-1', account]]), insertLog, {
        lookups: [account, undefined],
      });
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      pinOtp();
      await service.requestEmailOtp('new@example.com');
      await service.linkEmailToAccount('user-1', 'new@example.com', FIXED_OTP);

      const linkEntry = insertLog.find((e) => e.action === 'LINK');
      expect(linkEntry).toBeDefined();
      expect(linkEntry.identifierType).toBe('EMAIL');
      // The audit trail must never carry the plaintext address.
      expect(linkEntry.identifierHash).toMatch(/^v\d+:[a-f0-9]{64}$/);
      expect(linkEntry.identifierHash).not.toContain('new@example.com');
    });

    it('creates UNLINK audit entries for both identifier types', async () => {
      const emailAccount = makeUser({ phone: '+966500000000', email: 'user@example.com' });
      const insertLog2: any[] = [];
      const db = mockDbWithUsers(new Map([['user-1', emailAccount]]), insertLog2);
      const service = new IdentityService(
        db as any, redis as any, mockJwt() as any, mockRateLimitService() as any,
        mockAuditService() as any, mockOtpDeliveryService() as any, mockProviderRegistry() as any,
      );

      await service.unlinkEmailFromAccount('user-1');
      await service.unlinkPhoneFromAccount('user-1');

      expect(insertLog2.map((e) => e.identifierType)).toEqual(['EMAIL', 'PHONE']);
      expect(insertLog2.every((e) => /^v\d+:[a-f0-9]{64}$/.test(e.identifierHash))).toBe(true);
    });
  });
});
