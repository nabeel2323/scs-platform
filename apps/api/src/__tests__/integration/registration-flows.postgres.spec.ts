/**
 * S1.35 Phase 1 — Registration flows integration (PostgreSQL).
 *
 * Tests all registration paths against a real Postgres container:
 *  - Email-only registration (first-time email OTP verify creates user)
 *  - Phone-only registration (existing flow preserved)
 *  - Dual-identifier: phone-only user links email
 *  - Dual-identifier: email-only user links phone
 *  - CHECK constraint: at least one identifier required
 *  - Case-insensitive email uniqueness
 *  - User ID preservation across operations
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
import { users } from '../../modules/identity/identity.schema';
import { eq } from 'drizzle-orm';
import { IdentityService } from '../../modules/identity/identity.service';
import { createMockRedisStore } from '../unit/helpers/mock-redis';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
const HMAC_SECRET = 'dev-hmac-secret-change-me-in-production-64chars-minimum!!';

const mockAudit = { record: vi.fn() };
const mockRateLimit = {
  checkAndIncrement: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
  getResetSeconds: vi.fn().mockResolvedValue(0),
  resetAttempts: vi.fn().mockResolvedValue(undefined),
};
const mockDelivery = {
  deliverOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'delivered' }),
  deliverEmailOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'delivered' }),
  deliverToTestChannel: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'delivered' }),
};
const mockRegistry = {
  getForChannel: vi.fn(),
  getForTest: vi.fn(),
  getMockProvider: vi.fn(),
  getAvailableChannels: vi.fn().mockReturnValue(['sms', 'whatsapp', 'email']),
  isChannelAvailable: vi.fn().mockReturnValue(true),
};

/** Set up mock provider and return a function to capture the OTP. */
function enableMockProvider() {
  const mockProvider = {
    channel: 'mock',
    isConfigured: () => true,
    sendOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' }),
  };
  mockRegistry.getMockProvider.mockReturnValue(mockProvider);
  mockRegistry.getForTest.mockReturnValue(mockProvider);
}

function captureEmailOtp(): string {
  const call = mockDelivery.deliverToTestChannel.mock.calls.at(-1)?.[0];
  return call?.otp ?? '';
}

/** Inject a known OTP into mock Redis for phone verify. */
function injectKnownPhoneOtp(phone: string, otp: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = crypto.createHmac('sha256', HMAC_SECRET).update(otp + salt).digest('hex');
  const challengeId = crypto.randomUUID();

  mockRedis._store.set(`otp:${phone}`, {
    value: JSON.stringify({ ch: challengeId, hs: otpHash, s: salt, ca: Date.now().toString(), co: false }),
    ttl: 90,
  });
}

let mockRedis: ReturnType<typeof createMockRedisStore>;

describe('Registration Flows Integration (S1.35 Phase 1)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  let service: IdentityService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema }) as any;

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sqlContent); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    await pool.query(`UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled'`);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    mockRedis = createMockRedisStore();
    vi.clearAllMocks();
    mockDelivery.deliverOtp.mockResolvedValue({ success: true, deliveryOutcome: 'delivered' });
    mockDelivery.deliverEmailOtp.mockResolvedValue({ success: true, deliveryOutcome: 'delivered' });
    mockDelivery.deliverToTestChannel.mockResolvedValue({ success: true, deliveryOutcome: 'delivered' });
    mockRegistry.getMockProvider.mockReturnValue(null);

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

  // ── 1. Email-Only Registration ────────────────────────────────────

  describe('Email-only registration', () => {
    it('creates user with email and null phone on first verify', async () => {
      const email = `reg-email-${randomUUID().slice(0, 8)}@example.com`;

      enableMockProvider();
      await service.requestEmailOtp(email);
      const otp = captureEmailOtp();
      expect(otp).toMatch(/^\d{6}$/);

      const tokens = await service.verifyEmailOtp(email, otp);
      expect(tokens.accessToken).toBeTruthy();

      const normalized = email.toLowerCase().trim();
      const user = await db.query.users.findFirst({ where: eq(users.email, normalized) });
      expect(user).toBeDefined();
      expect(user!.phone).toBeNull();
      expect(user!.email).toBe(normalized);
      expect(user!.emailVerifiedAt).not.toBeNull();
      expect(user!.status).toBe('ACTIVE');

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [user!.id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [user!.id]);
    });

    it('normalizes email before storage', async () => {
      const email = `  UPPER@Test.COM  `;

      enableMockProvider();
      await service.requestEmailOtp(email);
      const otp = captureEmailOtp();
      await service.verifyEmailOtp(email, otp);

      const normalized = 'upper@test.com';
      const user = await db.query.users.findFirst({ where: eq(users.email, normalized) });
      expect(user).toBeDefined();
      expect(user!.email).toBe(normalized);

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [user!.id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [user!.id]);
    });
  });

  // ── 2. Phone-Only Registration (Regression) ──────────────────────

  describe('Phone-only registration (regression)', () => {
    it('creates user with phone and null email on first verify', async () => {
      const phone = '+966500000088';

      mockDelivery.deliverOtp.mockResolvedValueOnce({
        success: true, status: 'delivered', deliveryOutcome: 'delivered',
      });

      await service.requestOtp(phone, 'sms');

      // Inject known OTP to bypass delivery capture
      injectKnownPhoneOtp(phone, '123456');

      const tokens = await service.verifyOtp(phone, '123456');
      expect(tokens.accessToken).toBeTruthy();

      const user = await db.query.users.findFirst({ where: eq(users.phone, '+966500000088') });
      expect(user).toBeDefined();
      expect(user!.email).toBeNull();
      expect(user!.phone).toBe('+966500000088');

      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [user!.id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [user!.id]);
    });
  });

  // ── 3. Dual-Identifier: Link After Registration ───────────────────

  describe('Dual-identifier linking', () => {
    it('phone-only user can link email', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'Phone User', '+966500000077', 'en', 'ACTIVE')`,
        [userId],
      );

      // Proof of mailbox control is mandatory: request then consume an OTP.
      enableMockProvider();
      await service.requestEmailOtp('added@example.com');
      const result = await service.linkEmailToAccount(userId, 'added@example.com', captureEmailOtp());
      expect(result.success).toBe(true);

      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(user!.phone).toBe('+966500000077');
      expect(user!.email).toBe('added@example.com');

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('email-only user can link phone', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Email User', 'dual@example.com', 'en', 'ACTIVE')`,
        [userId],
      );

      // Proof of control over the number is mandatory too (S1.37-F-05): inject a
      // challenge the link is then allowed to consume.
      injectKnownPhoneOtp('+966500000066', '135790');
      const result = await service.linkPhoneToAccount(userId, '+966500000066', '135790');
      expect(result.success).toBe(true);

      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(user!.phone).toBe('+966500000066');
      expect(user!.email).toBe('dual@example.com');

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
    it('email-only user cannot link a phone it does not control', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Guarded', 'guarded-link@example.com', 'en', 'ACTIVE')`,
        [userId],
      );

      // No challenge exists for this number, so the link must be refused before
      // the identifier is written (S1.37-F-05).
      await expect(
        service.linkPhoneToAccount(userId, '+966500000065', '111222'),
      ).rejects.toThrow(/OTP|expired|not found/i);

      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(user!.phone).toBeNull();

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
  });

  // ── 4. Schema Constraints ─────────────────────────────────────────

  describe('Schema constraints', () => {
    it('CHECK constraint: cannot have both phone and email null', async () => {
      await expect(
        pool.query(`INSERT INTO users (id, full_name, locale, status) VALUES ($1, 'Nobody', 'en', 'ACTIVE')`, [randomUUID()]),
      ).rejects.toThrow(/violates check constraint/i);
    });

    it('unique index: case-insensitive email collision rejected', async () => {
      const id1 = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'A', 'case@test.com', 'en', 'ACTIVE')`,
        [id1],
      );
      await expect(
        pool.query(
          `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'B', 'CASE@TEST.COM', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/duplicate|unique/i);

      await pool.query(`DELETE FROM users WHERE id = $1`, [id1]);
    });

    it('row count preserved: insert/select count matches', async () => {
      const before = await pool.query(`SELECT COUNT(*) FROM users`);
      const countBefore = parseInt(before.rows[0].count, 10);

      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Count Test', 'count@test.com', 'en', 'ACTIVE')`,
        [userId],
      );

      const after = await pool.query(`SELECT COUNT(*) FROM users`);
      expect(parseInt(after.rows[0].count, 10)).toBe(countBefore + 1);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
  });
});
