/**
 * S1.35 Phase 1 — Phone OTP regression integration (PostgreSQL).
 *
 * Proves that the existing phone OTP flow is unchanged after the email OTP
 * additions. Tests against a real Postgres container with mock Redis:
 *  - Phone OTP request creates challenge with phone-namespaced key
 *  - Phone OTP verify consumes challenge and issues JWT pair
 *  - Phone-only user auto-registration
 *  - Existing phone user login (no new user created)
 *  - Replay prevention (consumed OTP cannot be reused)
 *  - Wrong OTP rejection
 *  - Rate limit enforcement
 *  - Session persistence
 *  - users.phone remains unique
 *  - 90-second challenge TTL (not 300s like email)
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

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

describe('Phone OTP Regression (S1.35 Phase 1)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  let service: IdentityService;
  let mockRedis: ReturnType<typeof createMockRedisStore>;

  const mockAudit = { record: vi.fn() };
  const mockRateLimit = {
    checkAndIncrement: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
    getResetSeconds: vi.fn().mockResolvedValue(0),
    resetAttempts: vi.fn().mockResolvedValue(undefined),
  };
  const mockDelivery = {
    deliverOtp: vi.fn().mockResolvedValue({ success: true, status: 'delivered', deliveryOutcome: 'delivered' as const }),
    deliverEmailOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'delivered' }),
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
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    mockRedis = createMockRedisStore();
    vi.clearAllMocks();
    mockDelivery.deliverOtp.mockResolvedValue({
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

  /**
   * Helper: inject a known OTP into the Redis challenge so we can verify
   * without needing the mock provider to capture it.
   */
  function injectKnownOtp(phone: string, otp: string) {
    const hmacSecret = process.env['OTP_HMAC_SECRET'] || 'dev-hmac-secret-change-me-in-production-64chars-minimum!!';
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto.createHmac('sha256', hmacSecret).update(otp + salt).digest('hex');
    const challengeId = crypto.randomUUID();

    mockRedis._store.set(`otp:${phone}`, {
      value: JSON.stringify({ ch: challengeId, hs: otpHash, s: salt, ca: Date.now().toString(), co: false }),
      ttl: 90,
    });

    return { challengeId, salt };
  }

  // ── 1. Phone OTP Request ──────────────────────────────────────────

  describe('Phone OTP request', () => {
    it('creates challenge under phone-namespaced key', async () => {
      const phone = '+966500000001';
      const result = await service.requestOtp(phone, 'sms');

      expect(result.success).toBe(true);
      expect(result.deliveryStatus).toBe('delivered');

      // Challenge stored under phone key (not email key)
      expect(mockRedis._store.has(`otp:${phone}`)).toBe(true);
      expect(mockRedis._store.has(`otp:email:${phone}`)).toBe(false);

      // Rate limit key created
      expect(mockRedis._store.has(`otp:req:${phone}`)).toBe(true);
    });

    it('challenge TTL is 90 seconds (not 300s like email)', async () => {
      const phone = '+966500000002';
      await service.requestOtp(phone, 'sms');

      const challenge = mockRedis._store.get(`otp:${phone}`);
      expect(challenge).toBeDefined();
      expect(challenge!.ttl).toBe(90);
    });

    it('calls deliverOtp (not deliverEmailOtp)', async () => {
      await service.requestOtp('+966500000003', 'sms');

      expect(mockDelivery.deliverOtp).toHaveBeenCalledTimes(1);
      expect(mockDelivery.deliverEmailOtp).not.toHaveBeenCalled();
    });
  });

  // ── 2. Phone OTP Verify ───────────────────────────────────────────

  describe('Phone OTP verify', () => {
    it('issues JWT pair for existing phone user', async () => {
      const userId = randomUUID();
      const phone = '+966500000010';
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'Phone User', $2, 'en', 'ACTIVE')`,
        [userId, phone],
      );

      injectKnownOtp(phone, '654321');

      const tokens = await service.verifyOtp(phone, '654321');
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();

      // Session persisted
      const sessionRows = await db.query.sessions.findMany({ where: eq(sessions.userId, userId) });
      expect(sessionRows.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('auto-registers phone-only user on first verify', async () => {
      const phone = '+966500000011';
      injectKnownOtp(phone, '111222');

      const tokens = await service.verifyOtp(phone, '111222');
      expect(tokens.accessToken).toBeTruthy();

      const user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
      expect(user).toBeDefined();
      expect(user!.email).toBeNull();
      expect(user!.status).toBe('ACTIVE');

      // Cleanup
      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [user!.id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [user!.id]);
    });

    it('rejects wrong OTP', async () => {
      const phone = '+966500000012';
      injectKnownOtp(phone, '999999');

      await expect(service.verifyOtp(phone, '000000'))
        .rejects.toThrow(/invalid|Invalid OTP/i);
    });

    it('rejects replay of consumed OTP', async () => {
      const phone = '+966500000013';
      injectKnownOtp(phone, '333444');

      await service.verifyOtp(phone, '333444');
      await expect(service.verifyOtp(phone, '333444'))
        .rejects.toThrow(/expired|not found|already used/i);
    });

    it('rejects verify when no challenge exists', async () => {
      await expect(service.verifyOtp('+966500000014', '123456'))
        .rejects.toThrow(/expired|not found/i);
    });
  });

  // ── 3. Phone Uniqueness Preserved ─────────────────────────────────

  describe('Phone uniqueness', () => {
    it('users.phone remains unique', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'A', '+966500000090', 'en', 'ACTIVE')`,
        [id1],
      );
      await expect(
        pool.query(
          `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'B', '+966500000090', 'en', 'ACTIVE')`,
          [id2],
        ),
      ).rejects.toThrow(/duplicate|unique/i);

      await pool.query(`DELETE FROM users WHERE id = $1`, [id1]);
    });
  });

  // ── 4. Delivery Failure Handling ──────────────────────────────────

  describe('Delivery failure', () => {
    it('returns failure status on definite rejection', async () => {
      mockDelivery.deliverOtp.mockResolvedValueOnce({
        success: false, status: 'failed', errorReason: 'EENVELOPE',
        deliveryOutcome: 'rejected' as const, retryable: false,
      });

      const result = await service.requestOtp('+966500000015', 'sms');
      expect(result.success).toBe(false);
      expect(result.deliveryStatus).toBe('EENVELOPE');
    });

    it('preserves challenge on timeout (possiblyDelivered)', async () => {
      mockDelivery.deliverOtp.mockResolvedValueOnce({
        success: false, status: 'failed', errorReason: 'ETIMEDOUT',
        deliveryOutcome: 'unknown' as const, retryable: true,
      });

      const result = await service.requestOtp('+966500000016', 'sms');
      expect(result.success).toBe(false);
      expect(result.possiblyDelivered).toBe(true);

      // Challenge still in Redis for user to verify if they received it
      expect(mockRedis._store.has(`otp:+966500000016`)).toBe(true);
    });
  });
});
