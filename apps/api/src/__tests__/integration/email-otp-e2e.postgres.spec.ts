/**
 * S1.35 Phase 1 — Email OTP end-to-end integration (PostgreSQL).
 *
 * Boots IdentityService against a disposable Postgres container (full migration
 * chain including 0064_email_identity) and a mock Redis store. Proves the full
 * email OTP lifecycle: request → challenge creation → verify → JWT issuance →
 * session persistence. No real email/SMS messages are sent.
 *
 * Coverage:
 *  - Email OTP request creates a Redis challenge with 300s TTL
 *  - Email OTP verify consumes the challenge and issues JWT pair
 *  - Replay prevention (consumed OTP cannot be reused)
 *  - Wrong OTP rejection
 *  - Expired/missing challenge rejection
 *  - Email-only user auto-registration on first verify
 *  - Existing email user login on subsequent verify
 *  - Session persistence (refresh token stored in DB)
 *  - Feature flag check (isEmailOtpEnabled)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as schema from '../../drizzle/schema';
import { users, sessions } from '../../modules/identity/identity.schema';
import { eq } from 'drizzle-orm';
import { IdentityService } from '../../modules/identity/identity.service';
import { createMockRedisStore } from '../unit/helpers/mock-redis';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import { normalizeEmail, hashEmail } from '../../common/utils/email-normalization';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
const HMAC_SECRET = 'dev-hmac-secret-change-me-in-production-64chars-minimum!!';

/**
 * Capture the OTP from the mock delivery service's call arguments.
 * When mock provider is active, requestEmailOtp calls deliverToTestChannel
 * with { otp, channel: 'mock', ... }.
 */
function captureOtpFromDeliveryMock(): string {
  const call = mockDelivery.deliverToTestChannel.mock.calls.at(-1)?.[0];
  return call?.otp ?? '';
}

/**
 * Inject a known OTP into the mock Redis challenge for direct verify testing.
 * Uses the module-level mockRedis reference set in beforeEach.
 */
let mockRedis: ReturnType<typeof createMockRedisStore>;

function injectKnownEmailOtp(email: string, otp: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = crypto.createHmac('sha256', HMAC_SECRET).update(otp + salt).digest('hex');
  const challengeId = crypto.randomUUID();
  const normalized = normalizeEmail(email);

  mockRedis._store.set(`otp:email:${normalized}`, {
    value: JSON.stringify({ ch: challengeId, hs: otpHash, s: salt, ca: Date.now().toString(), co: false }),
    ttl: 300,
  });
}

// Shared mock collaborators
const mockAudit = { record: vi.fn() };
const mockRateLimit = {
  checkAndIncrement: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
  getResetSeconds: vi.fn().mockResolvedValue(0),
  resetAttempts: vi.fn().mockResolvedValue(undefined),
};
const mockDelivery = {
  deliverOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' as const }),
  deliverEmailOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' as const }),
  deliverToTestChannel: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' as const }),
  isChannelAvailable: vi.fn().mockReturnValue(true),
  getAvailableChannels: vi.fn().mockReturnValue(['sms', 'whatsapp', 'email']),
};
const mockRegistry = {
  getForChannel: vi.fn(),
  getForTest: vi.fn(),
  getMockProvider: vi.fn().mockReturnValue(null),
  getAvailableChannels: vi.fn().mockReturnValue(['sms', 'whatsapp', 'email']),
  isChannelAvailable: vi.fn().mockReturnValue(true),
};

describe('Email OTP E2E (S1.35 Phase 1)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  let service: IdentityService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema }) as any;

    // Run all migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(sqlContent);
        await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
        await pool.query('COMMIT');
      } catch {
        await pool.query('ROLLBACK');
      }
    }

    // Seed RBAC
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // Enable the email OTP feature flag
    await pool.query(`UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled'`);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    mockRedis = createMockRedisStore();
    vi.clearAllMocks();
    mockRegistry.getMockProvider.mockReturnValue(null);
    mockDelivery.deliverEmailOtp.mockResolvedValue({
      success: true, status: 'delivered', deliveryOutcome: 'delivered' as const,
    });
    mockDelivery.deliverToTestChannel.mockResolvedValue({
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

  /** Set up mock provider so requestEmailOtp captures OTP via deliverToTestChannel. */
  function enableMockProvider() {
    const mockProvider = {
      channel: 'mock',
      isConfigured: () => true,
      sendOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' }),
    };
    mockRegistry.getMockProvider.mockReturnValue(mockProvider);
    mockRegistry.getForTest.mockReturnValue(mockProvider);
    return mockProvider;
  }

  // ── 1. Email OTP Request ──────────────────────────────────────────

  describe('Email OTP request', () => {
    it('creates a challenge in Redis with email-namespaced key', async () => {
      const result = await service.requestEmailOtp('Test@Example.COM');

      expect(result.success).toBe(true);
      expect(result.deliveryStatus).toBe('delivered');

      const normalized = normalizeEmail('Test@Example.COM');
      const challenge = mockRedis._store.get(`otp:email:${normalized}`);
      expect(challenge).toBeDefined();

      const parsed = JSON.parse(challenge!.value);
      expect(parsed.ch).toMatch(/^[0-9a-f-]+$/);
      expect(parsed.hs).toHaveLength(64);
      expect(parsed.s).toHaveLength(32);
      expect(parsed.co).toBe(false);
    });

    it('creates per-email and per-IP rate limit keys', async () => {
      await service.requestEmailOtp('ratelimit@example.com', '10.0.0.1');

      const normalized = normalizeEmail('ratelimit@example.com');
      expect(mockRedis._store.has(`otp:req:email:${normalized}`)).toBe(true);
      expect(mockRedis._store.has(`otp:ip:10.0.0.1`)).toBe(true);
    });

    it('delivers via mock provider when available', async () => {
      enableMockProvider();

      await service.requestEmailOtp('mock@example.com');

      expect(mockDelivery.deliverToTestChannel).toHaveBeenCalledTimes(1);
      const call = mockDelivery.deliverToTestChannel.mock.calls[0]![0]!;
      expect(call.channel).toBe('mock');
      expect(call.subjectType).toBe('email');
    });

    it('challenge TTL is 300 seconds (email D-6)', async () => {
      await service.requestEmailOtp('ttl@example.com');

      const normalized = normalizeEmail('ttl@example.com');
      const challenge = mockRedis._store.get(`otp:email:${normalized}`);
      expect(challenge).toBeDefined();
      expect(challenge!.ttl).toBe(300);
    });
  });

  // ── 2. Email OTP Verify ───────────────────────────────────────────

  describe('Email OTP verify', () => {
    it('issues JWT pair on correct OTP for existing user', async () => {
      const userId = randomUUID();
      const email = 'existing@example.com';
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Test User', $2, 'en', 'ACTIVE')`,
        [userId, email],
      );

      // Use mock provider to capture OTP
      enableMockProvider();
      await service.requestEmailOtp(email);
      const otp = captureOtpFromDeliveryMock();
      expect(otp).toMatch(/^\d{6}$/);

      // Verify
      const tokens = await service.verifyEmailOtp(email, otp, 'device-1', {
        platform: 'web', userAgent: 'test-agent',
      });

      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();

      // Session persisted in DB
      const sessionRows = await db.query.sessions.findMany({
        where: eq(sessions.userId, userId),
      });
      expect(sessionRows.length).toBeGreaterThanOrEqual(1);

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('auto-registers email-only user on first verify', async () => {
      const email = `newuser-${randomUUID().slice(0, 8)}@example.com`;

      enableMockProvider();
      await service.requestEmailOtp(email);
      const otp = captureOtpFromDeliveryMock();

      const tokens = await service.verifyEmailOtp(email, otp);
      expect(tokens.accessToken).toBeTruthy();

      const normalized = normalizeEmail(email);
      const created = await db.query.users.findFirst({
        where: eq(users.email, normalized),
      });
      expect(created).toBeDefined();
      expect(created!.phone).toBeNull();
      expect(created!.emailVerifiedAt).toBeDefined();
      expect(created!.status).toBe('ACTIVE');
    });

    it('rejects replay of consumed OTP', async () => {
      const email = `replay-${randomUUID().slice(0, 8)}@example.com`;

      enableMockProvider();
      await service.requestEmailOtp(email);
      const otp = captureOtpFromDeliveryMock();

      // First verify succeeds
      await service.verifyEmailOtp(email, otp);

      // Second verify with same OTP fails (challenge consumed)
      await expect(service.verifyEmailOtp(email, otp))
        .rejects.toThrow(/expired|not found|already used/i);
    });

    it('rejects wrong OTP', async () => {
      const email = `wrongotp-${randomUUID().slice(0, 8)}@example.com`;

      // Inject a known challenge, then try wrong OTP
      injectKnownEmailOtp(email, '123456');

      await expect(service.verifyEmailOtp(email, '000000'))
        .rejects.toThrow(/invalid|Invalid OTP/i);
    });

    it('rejects verify when no challenge exists', async () => {
      await expect(service.verifyEmailOtp('nochallenge@example.com', '123456'))
        .rejects.toThrow(/expired|not found/i);
    });

    it('verify with injected OTP (no mock provider needed)', async () => {
      const userId = randomUUID();
      const email = `injected-${randomUUID().slice(0, 8)}@example.com`;
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Inject User', $2, 'en', 'ACTIVE')`,
        [userId, email],
      );

      injectKnownEmailOtp(email, '654321');

      const tokens = await service.verifyEmailOtp(email, '654321');
      expect(tokens.accessToken).toBeTruthy();

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
  });

  // ── 3. Feature Flag ───────────────────────────────────────────────

  describe('Feature flag', () => {
    it('isEmailOtpEnabled returns true when flag is set', async () => {
      const enabled = await service.isEmailOtpEnabled();
      expect(enabled).toBe(true);
    });

    it('isEmailOtpEnabled returns false when flag is disabled', async () => {
      await pool.query(`UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled'`);
      const enabled = await service.isEmailOtpEnabled();
      expect(enabled).toBe(false);

      // Restore
      await pool.query(`UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled'`);
    });
  });

  // ── 4. Migration 0064 Verification ────────────────────────────────

  describe('Migration 0064 schema', () => {
    it('account_link_log table exists and accepts inserts', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Link Test', $2, 'en', 'ACTIVE')`,
        [userId, 'linktest@example.com'],
      );

      await pool.query(
        `INSERT INTO account_link_log (user_id, action, identifier_type, identifier_hash, performed_by)
         VALUES ($1, 'LINK', 'EMAIL', $2, $1)`,
        [userId, hashEmail('linktest@example.com')],
      );

      const logs = await pool.query(`SELECT * FROM account_link_log WHERE user_id = $1`, [userId]);
      expect(logs.rows).toHaveLength(1);
      expect(logs.rows[0].action).toBe('LINK');
      expect(logs.rows[0].identifier_type).toBe('EMAIL');
      expect(logs.rows[0].identifier_hash).toHaveLength(64);

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('users.phone is nullable (email-only accounts allowed)', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Email Only', $2, 'en', 'ACTIVE')`,
        [userId, 'emailonly@example.com'],
      );

      const row = await pool.query(`SELECT phone, email FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].phone).toBeNull();
      expect(row.rows[0].email).toBe('emailonly@example.com');

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('CHECK constraint prevents both phone and email being null', async () => {
      await expect(
        pool.query(
          `INSERT INTO users (id, full_name, locale, status) VALUES ($1, 'No Identifier', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/violates check constraint|users_at_least_one_identifier/i);
    });

    it('case-insensitive unique index on email', async () => {
      const userId1 = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'User 1', 'unique@example.com', 'en', 'ACTIVE')`,
        [userId1],
      );

      await expect(
        pool.query(
          `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'User 2', 'UNIQUE@EXAMPLE.COM', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/duplicate|unique/i);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId1]);
    });
  });
});
