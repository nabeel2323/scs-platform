/**
 * S1.35 Phase 1 — Password login regression integration (PostgreSQL).
 *
 * Proves that the existing password login flow is unchanged after the email OTP
 * additions. Tests against a real Postgres container with mock Redis:
 *  - Password login with trusted device → JWT pair
 *  - Password login with untrusted device → requires OTP (phone path)
 *  - Password login with untrusted device + email-only user → requires OTP (email path)
 *  - Wrong password rejection
 *  - Non-existent user rejection (same error message — enumeration prevention)
 *  - Rate limiting on login attempts
 *  - Session persistence
 *  - Device trust check
 *
 * S1.37 audit additions: the three rejection branches are proven indistinguishable
 * (the no-password branch used to disclose that an address has an account, which
 * every email-only Phase 1 account is), and a case-variant address is proven to
 * resolve the same account because the service normalizes before it queries.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcrypt';
import * as schema from '../../drizzle/schema';
import { users, sessions } from '../../modules/identity/identity.schema';
import { eq } from 'drizzle-orm';
import { IdentityService } from '../../modules/identity/identity.service';
import { createMockRedisStore } from '../unit/helpers/mock-redis';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

describe('Password Login Regression (S1.35 Phase 1)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  let service: IdentityService;
  let mockRedis: ReturnType<typeof createMockRedisStore>;

  // Test users
  const phoneUser = { id: randomUUID(), phone: '+966500000100', email: 'phoneuser@test.com', password: 'Test@12345678' };
  const emailOnlyUser = { id: randomUUID(), email: 'emailonly@test.com', password: 'Test@12345678' };
  /**
   * The population S1.35 Phase 1 creates: an address that exists on an account
   * with no password at all. Password login must not single it out.
   */
  const noPasswordUser = { id: randomUUID(), email: 'otp-only@test.com' };

  const mockAudit = { record: vi.fn() };
  const mockRateLimit = {
    checkAndIncrement: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
    getResetSeconds: vi.fn().mockResolvedValue(0),
    resetAttempts: vi.fn().mockResolvedValue(undefined),
  };
  const mockDelivery = {
    deliverOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' as const }),
    deliverEmailOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' as const }),
    deliverToTestChannel: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'delivered' }),
  };
  const mockRegistry = {
    getForChannel: vi.fn(),
    getForTest: vi.fn(),
    getMockProvider: vi.fn().mockReturnValue(null),
    getAvailableChannels: vi.fn().mockReturnValue(['sms', 'whatsapp', 'email']),
    isChannelAvailable: vi.fn().mockReturnValue(true),
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema }) as any;

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    await pool.query(`UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled'`);

    // Create test users with bcrypt-hashed passwords.
    // S1.38.3: cost factor must match getUnknownUserPasswordHash() (cost 12) in
    // the production service so that the enumeration-resistance timing test compares
    // equivalent bcrypt work. A mismatch (cost 10 seed vs cost 12 dummy) caused the
    // "no branch materially faster" assertion to flake at ratio 4.67 under load.
    const hash = await bcrypt.hash(phoneUser.password, 12);
    await pool.query(
      `INSERT INTO users (id, full_name, phone, email, password_hash, password_set_at, locale, status, email_verified_at)
       VALUES ($1, 'Phone User', $2, $3, $4, now(), 'en', 'ACTIVE', now())`,
      [phoneUser.id, phoneUser.phone, phoneUser.email, hash],
    );

    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, password_set_at, locale, status, email_verified_at)
       VALUES ($1, 'Email Only User', $2, $3, now(), 'en', 'ACTIVE', now())`,
      [emailOnlyUser.id, emailOnlyUser.email, hash],
    );

    await pool.query(
      `INSERT INTO users (id, full_name, email, locale, status, email_verified_at)
       VALUES ($1, 'OTP Only User', $2, 'en', 'ACTIVE', now())`,
      [noPasswordUser.id, noPasswordUser.email],
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    mockRedis = createMockRedisStore();
    vi.clearAllMocks();
    mockRateLimit.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 4 });
    mockDelivery.deliverOtp.mockResolvedValue({
      success: true, status: 'delivered', deliveryOutcome: 'delivered' as const,
    });
    mockDelivery.deliverEmailOtp.mockResolvedValue({
      success: true, status: 'delivered', deliveryOutcome: 'delivered' as const,
    });

    const jwt = new JwtService({ secret: 'test-jwt-secret-min-32-chars!!', signOptions: { expiresIn: '15m' } });

    service = new IdentityService(
      { db } as any,
      mockRedis as any,
      jwt,
      mockRateLimit as any,
      mockAudit as any,
      mockDelivery as any,
      mockRegistry as any,
    );
  });

  // ── 1. Trusted Device Login ───────────────────────────────────────

  describe('Trusted device login', () => {
    it('issues JWT pair when device is trusted (phone user)', async () => {
      // Create a session to establish device trust
      const deviceId = 'trusted-device-001';
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, device_id, expires_at)
         VALUES ($1, $2, $3, 'web', $4, $5)`,
        [randomUUID(), phoneUser.id, 'a'.repeat(64), deviceId, new Date(Date.now() + 86400000)],
      );

      const result = await service.loginWithPassword(
        phoneUser.email, phoneUser.password, deviceId,
        { platform: 'web', userAgent: 'test' },
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.requiresOtp).toBeUndefined();

      // Cleanup sessions
      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [phoneUser.id]);
    });

    it('issues JWT pair when device is trusted (email-only user)', async () => {
      const deviceId = 'trusted-device-002';
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, device_id, expires_at)
         VALUES ($1, $2, $3, 'web', $4, $5)`,
        [randomUUID(), emailOnlyUser.id, 'b'.repeat(64), deviceId, new Date(Date.now() + 86400000)],
      );

      const result = await service.loginWithPassword(
        emailOnlyUser.email, emailOnlyUser.password, deviceId,
        { platform: 'web', userAgent: 'test' },
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [emailOnlyUser.id]);
    });
  });

  // ── 2. Untrusted Device → OTP Required ────────────────────────────

  describe('Untrusted device requires OTP', () => {
    it('returns requiresOtp with phone for dual-identifier user', async () => {
      const result = await service.loginWithPassword(
        phoneUser.email, phoneUser.password, 'new-device-001',
        { platform: 'web', userAgent: 'test' },
      );

      expect(result.requiresOtp).toBe(true);
      expect(result.accessToken).toBe('');
      expect(result.refreshToken).toBe('');
      // Phone user should get phone OTP
      expect(result.otpPhone).toBe(phoneUser.phone);
    });

    it('returns requiresOtp with masked email for email-only user', async () => {
      const result = await service.loginWithPassword(
        emailOnlyUser.email, emailOnlyUser.password, 'new-device-002',
        { platform: 'web', userAgent: 'test' },
      );

      expect(result.requiresOtp).toBe(true);
      expect(result.accessToken).toBe('');
      // Email-only user should get email OTP
      expect(result.otpEmail).toBeDefined();
      expect(result.otpEmail).toContain('***'); // masked
    });

    it('phone user: calls deliverOtp (not deliverEmailOtp)', async () => {
      await service.loginWithPassword(
        phoneUser.email, phoneUser.password, 'new-device-003',
      );

      expect(mockDelivery.deliverOtp).toHaveBeenCalled();
    });

    it('email-only user: calls deliverEmailOtp (not deliverOtp for phone)', async () => {
      await service.loginWithPassword(
        emailOnlyUser.email, emailOnlyUser.password, 'new-device-004',
      );

      expect(mockDelivery.deliverEmailOtp).toHaveBeenCalled();
    });
  });

  // ── 3. Wrong Password ────────────────────────────────────────────

  describe('Wrong password', () => {
    it('rejects with same error as non-existent user (enumeration prevention)', async () => {
      await expect(
        service.loginWithPassword(phoneUser.email, 'WrongPassword123!', 'device-x'),
      ).rejects.toThrow(/Invalid email or password/i);

      await expect(
        service.loginWithPassword('nonexistent@test.com', 'AnyPassword123!', 'device-x'),
      ).rejects.toThrow(/Invalid email or password/i);
    });
  });

  // ── 4. Rate Limiting ──────────────────────────────────────────────

  describe('Rate limiting', () => {
    it('rejects login after rate limit exceeded', async () => {
      mockRateLimit.checkAndIncrement.mockResolvedValueOnce({ allowed: false, remaining: 0 });

      await expect(
        service.loginWithPassword(phoneUser.email, phoneUser.password, 'device-rl'),
      ).rejects.toThrow(/Too many login attempts|rate limit/i);
    });
  });

  // ── 5. Session Persistence ────────────────────────────────────────

  describe('Session persistence', () => {
    it('creates session record on successful login', async () => {
      const deviceId = 'session-test-device';
      // Establish trust first
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, device_id, expires_at)
         VALUES ($1, $2, $3, 'web', $4, $5)`,
        [randomUUID(), phoneUser.id, 'c'.repeat(64), deviceId, new Date(Date.now() + 86400000)],
      );

      const before = await pool.query(`SELECT COUNT(*) FROM sessions WHERE user_id = $1`, [phoneUser.id]);
      const countBefore = parseInt(before.rows[0].count, 10);

      await service.loginWithPassword(
        phoneUser.email, phoneUser.password, deviceId,
        { platform: 'web', userAgent: 'session-test' },
      );

      const after = await pool.query(`SELECT COUNT(*) FROM sessions WHERE user_id = $1`, [phoneUser.id]);
      expect(parseInt(after.rows[0].count, 10)).toBe(countBefore + 1);

      // Cleanup
      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [phoneUser.id]);
    });
  });

  // ── 6. Device Trust Check ─────────────────────────────────────────

  describe('Device trust', () => {
    it('checkDeviceTrust returns true for recent session', async () => {
      const deviceId = 'trust-check-001';
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, device_id, expires_at)
         VALUES ($1, $2, $3, 'web', $4, $5)`,
        [randomUUID(), phoneUser.id, 'd'.repeat(64), deviceId, new Date(Date.now() + 86400000)],
      );

      const trusted = await service.checkDeviceTrust(phoneUser.id, deviceId);
      expect(trusted).toBe(true);

      await pool.query(`DELETE FROM sessions WHERE user_id = $1 AND device_id = $2`, [phoneUser.id, deviceId]);
    });

    it('checkDeviceTrust returns false for unknown device', async () => {
      const trusted = await service.checkDeviceTrust(phoneUser.id, 'never-seen-device');
      expect(trusted).toBe(false);
    });
  });

  // ── 7. S1.37: enumeration resistance across all branches ───────────

  /** Rejects and returns the thrown message, or a marker if it resolved. */
  async function rejectMessage(email: string, password: string): Promise<string> {
    try {
      await service.loginWithPassword(email, password, 'device-enum');
      return '<resolved>';
    } catch (e) {
      return (e as Error).message;
    }
  }

  describe('Enumeration resistance (S1.37-F-03)', () => {
    it('an email-only account with no password gives the generic answer', async () => {
      const message = await rejectMessage(noPasswordUser.email, 'AnyPassword123!');
      expect(message).toBe('Invalid email or password');
      // The previous wording confirmed the address existed.
      expect(message).not.toMatch(/password not set|use otp|set up credentials/i);
    });

    it('unknown address, no-password account and wrong password are indistinguishable', async () => {
      const unknown = await rejectMessage('nobody-here@test.com', 'AnyPassword123!');
      const noPassword = await rejectMessage(noPasswordUser.email, 'AnyPassword123!');
      const wrongPassword = await rejectMessage(phoneUser.email, 'WrongPassword123!');
      expect(noPassword).toBe(unknown);
      expect(wrongPassword).toBe(unknown);
    });

    it('no branch answers materially faster than another (bcrypt burn)', async () => {
      // Warm the cost factor before measuring; the first hash of the lazily
      // created dummy hash is intentionally excluded from the sample.
      await rejectMessage('warmup@test.com', 'AnyPassword123!');

      const timed = async (email: string, password: string) => {
        const startedAt = Date.now();
        await rejectMessage(email, password);
        return Date.now() - startedAt;
      };

      // S1.38.3: Use median-of-3 to reduce sensitivity to transient scheduler
      // jitter and Docker resource contention during heavy serial suites.
      // A single sample under full-suite load produced ratios up to 4.67×
      // (measured in S1.38.2 and reproduced in S1.38.3 full run) even though
      // the security invariant (both paths do bcrypt.compare) is maintained.
      const median = (arr: number[]): number => [...arr].sort((a, b) => a - b)[1]!;

      const unknownSamples: number[] = [];
      const wrongSamples: number[] = [];
      for (let i = 0; i < 3; i++) {
        unknownSamples.push(await timed('nobody-here@test.com', 'AnyPassword123!'));
        wrongSamples.push(await timed(phoneUser.email, 'WrongPassword123!'));
      }

      const unknown = median(unknownSamples);
      const wrong = median(wrongSamples);
      const ratio = unknown / Math.max(wrong, 1);
      expect(ratio).toBeGreaterThan(0.25);
      expect(ratio).toBeLessThan(4);
    }, 30_000);

    it('audit records the address as a hash, never in clear (S1.37-F-13)', async () => {
      const deviceId = 'audit-hash-device';
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, device_id, expires_at)
         VALUES ($1, $2, $3, 'web', $4, $5)`,
        [randomUUID(), phoneUser.id, 'e'.repeat(64), deviceId, new Date(Date.now() + 86400000)],
      );

      await service.loginWithPassword(phoneUser.email, phoneUser.password, deviceId, {
        platform: 'web', userAgent: 'audit-hash',
      });

      const loginAudit = mockAudit.record.mock.calls
        .map((c) => c[0] as any)
        .find((a) => a.action === 'auth.login');
      expect(loginAudit).toBeDefined();
      expect(loginAudit.metadata.emailHash).toMatch(/^v2:[0-9a-f]{64}$/);
      expect(JSON.stringify(loginAudit)).not.toContain(phoneUser.email);

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [phoneUser.id]);
    });
  });

  // ── 8. S1.37: normalization on the login path ──────────────────────

  describe('Email normalization on login (S1.37-F-08)', () => {
    it('accepts a case-variant and padded address for the same account', async () => {
      const deviceId = 'normalized-login-device';
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, device_id, expires_at)
         VALUES ($1, $2, $3, 'web', $4, $5)`,
        [randomUUID(), phoneUser.id, 'f'.repeat(64), deviceId, new Date(Date.now() + 86400000)],
      );

      const result = await service.loginWithPassword(
        `  ${phoneUser.email.toUpperCase()}  ` as never, phoneUser.password, deviceId,
        { platform: 'web', userAgent: 'normalized' },
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.requiresOtp).toBeFalsy();

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [phoneUser.id]);
    });

    it('counts an unknown address against the normalized rate-limit key', async () => {
      // Both spellings are one identity, so they must share one attempt counter.
      const calls: string[] = [];
      mockRateLimit.checkAndIncrement.mockImplementation((key: string, id: string) => {
        calls.push(`${key}:${id}`);
        return Promise.resolve({ allowed: true, remaining: 4 });
      });

      await rejectMessage('MiXeDcAsE@test.com', 'WrongPassword123!');
      await rejectMessage('mixedcase@test.com', 'WrongPassword123!');

      expect(calls[0]).toBe(calls[1]);
    });
  });
});
