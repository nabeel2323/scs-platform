/**
 * S1.35 Phase 1 — Account linking/unlinking integration (PostgreSQL).
 *
 * Tests the full link/unlink lifecycle against a real Postgres container:
 *  - Link email to phone-based account
 *  - Link phone to email-based account
 *  - Unlink email (when phone remains)
 *  - Unlink phone (when email remains)
 *  - Cannot unlink last auth method
 *  - Conflict detection (email/phone already in use)
 *  - Audit log entries created on every link/unlink
 *  - Normalization applied before storage
 *  - Email linking refuses any request without a consumed email OTP (S1.37-F-04)
 *  - Phone linking refuses any request without a consumed phone OTP (S1.37-F-05)
 *  - A unique violation raised by the write surfaces as 409, never 500 (S1.37-F-11)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as schema from '../../drizzle/schema';

import { IdentityService } from '../../modules/identity/identity.service';
import { createMockRedisStore } from '../unit/helpers/mock-redis';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import { hashEmail } from '../../common/utils/email-normalization';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

/** Every OTP the service generates in this file, so tests need no real mailbox. */
const PINNED_OTP = '246810';

describe('Account Linking Integration (S1.35 Phase 1)', () => {
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
    deliverOtp: vi.fn().mockResolvedValue({ success: true, deliveryOutcome: 'delivered' }),
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

    // Run all migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    const failed: string[] = [];
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query('COMMIT'); }
      catch (e) { await pool.query('ROLLBACK'); failed.push(`${file}: ${(e as Error).message}`); }
    }
    // A migration that failed and was rolled back would otherwise leave this
    // suite asserting against a half-built schema while appearing to pass.
    if (failed.length) throw new Error(`Migrations did not apply cleanly:\n  ${failed.join('\n  ')}`);

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    mockRedis = createMockRedisStore();
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

    // Pin the generated code so a test can request a challenge it is then
    // allowed to consume. Delivery itself is mocked, so no message is sent.
    (vi.spyOn(crypto, 'randomInt') as any).mockReturnValue(Number(PINNED_OTP));
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  /**
   * Requests an email OTP through the service under test and returns the code,
   * so a link test carries the same proof of mailbox control the live endpoint
   * requires. The registry double exposes no mock provider, so delivery goes
   * through the (mocked) SMTP path while the challenge is still created.
   */
  async function issueEmailOtp(email: string): Promise<string> {
    await service.requestEmailOtp(email);
    return PINNED_OTP;
  }

  /**
   * Requests a phone OTP through the service under test, the same way
   * `/v1/auth/otp/request` does, so a link-phone test carries real proof of
   * control of the number (S1.37-F-05). Delivery is mocked; no message is sent.
   */
  async function issuePhoneOtp(phone: string): Promise<string> {
    await service.requestOtp(phone);
    return PINNED_OTP;
  }

  async function makePhoneOnlyUser(phone: string): Promise<string> {
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'Phone User', $2, 'en', 'ACTIVE')`,
      [userId, phone],
    );
    return userId;
  }

  async function cleanup(...userIds: string[]): Promise<void> {
    await pool.query(`DELETE FROM account_link_log WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }

  // ── 1. Link Email ─────────────────────────────────────────────────

  describe('linkEmailToAccount', () => {
    it('links email to a phone-only account with a consumed OTP', async () => {
      const userId = await makePhoneOnlyUser('+966500000099');
      const otp = await issueEmailOtp('NewEmail@Example.COM');

      const result = await service.linkEmailToAccount(userId, 'NewEmail@Example.COM', otp);
      expect(result.success).toBe(true);

      // Verify DB state
      const row = await pool.query(`SELECT email, email_verified_at FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].email).toBe('newemail@example.com'); // normalized
      expect(row.rows[0].email_verified_at).not.toBeNull();

      // Audit log entry
      const logs = await pool.query(`SELECT * FROM account_link_log WHERE user_id = $1`, [userId]);
      expect(logs.rows).toHaveLength(1);
      expect(logs.rows[0].action).toBe('LINK');
      expect(logs.rows[0].identifier_type).toBe('EMAIL');
      expect(logs.rows[0].identifier_hash).toHaveLength(64);
      // The audit trail stores the hash only, never the address.
      expect(JSON.stringify(logs.rows[0])).not.toContain('newemail@example.com');

      await cleanup(userId);
    });

    it('refuses to attach an address that was never proven controlled (S1.37-F-04)', async () => {
      const userId = await makePhoneOnlyUser('+966500000098');

      // No OTP was ever issued for this address.
      await expect(
        service.linkEmailToAccount(userId, 'someone.elses@mailbox.com', '246810'),
      ).rejects.toThrow(/OTP|expired|not found/i);

      const row = await pool.query(`SELECT email, email_verified_at FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].email).toBeNull();
      expect(row.rows[0].email_verified_at).toBeNull();

      const logs = await pool.query(`SELECT * FROM account_link_log WHERE user_id = $1`, [userId]);
      expect(logs.rows).toHaveLength(0);

      await cleanup(userId);
    });

    it('refuses a wrong OTP for an issued challenge', async () => {
      const userId = await makePhoneOnlyUser('+966500000097');
      await service.requestEmailOtp('wrongcode@example.com');

      await expect(
        service.linkEmailToAccount(userId, 'wrongcode@example.com', '999999'),
      ).rejects.toThrow(/OTP/i);

      const row = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].email).toBeNull();

      await cleanup(userId);
    });

    it('consumes the challenge so a link OTP cannot be replayed (S1.37-F-04)', async () => {
      const userId = await makePhoneOnlyUser('+966500000096');
      const otp = await issueEmailOtp('replay@example.com');

      await expect(
        service.linkEmailToAccount(userId, 'replay@example.com', otp),
      ).resolves.toEqual({ success: true });

      // The same code must no longer be usable, so it cannot be turned into a
      // login against the freshly attached address either.
      await expect(
        service.linkEmailToAccount(userId, 'replay@example.com', otp),
      ).rejects.toThrow(/OTP|expired|not found/i);

      const logs = await pool.query(`SELECT action FROM account_link_log WHERE user_id = $1`, [userId]);
      expect(logs.rows).toHaveLength(1);

      await cleanup(userId);
    });

    it('surfaces a case-variant collision the pre-check misses as 409, not 500 (S1.37-F-11)', async () => {
      // A legacy row written straight to the table bypasses normalizeEmail, so
      // the stored value differs in case from the identifier being attached.
      const owner = await makePhoneOnlyUser('+966500000095');
      await pool.query(`UPDATE users SET email = 'CaseOwned@Example.COM' WHERE id = $1`, [owner]);

      const attacker = await makePhoneOnlyUser('+966500000094');
      const otp = await issueEmailOtp('caseowned@example.com');

      // eq(users.email, 'caseowned@example.com') does not match the stored row,
      // so only the unique index can stop this write.
      await expect(
        service.linkEmailToAccount(attacker, 'caseowned@example.com', otp),
      ).rejects.toThrow(/EMAIL_ALREADY_IN_USE/i);

      const stillOwned = await pool.query(`SELECT email FROM users WHERE id = $1`, [owner]);
      expect(stillOwned.rows[0].email).toBe('CaseOwned@Example.COM');

      await cleanup(owner, attacker);
    });

    it('rejects linking email already owned by another user', async () => {
      const userA = randomUUID();
      const userB = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'A', '+966500000001', 'taken@example.com', 'en', 'ACTIVE')`,
        [userA],
      );
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'B', '+966500000002', 'en', 'ACTIVE')`,
        [userB],
      );

      await expect(service.linkEmailToAccount(userB, 'taken@example.com', await issueEmailOtp('taken@example.com')))
        .rejects.toThrow(/EMAIL_ALREADY_IN_USE|conflict/i);

      await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
    });
  });

  // ── 2. Link Phone ─────────────────────────────────────────────────

  describe('linkPhoneToAccount', () => {
    it('links phone to an email-only account with a consumed OTP', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Email User', 'phoneless@example.com', 'en', 'ACTIVE')`,
        [userId],
      );

      const otp = await issuePhoneOtp('+966500000099');
      const result = await service.linkPhoneToAccount(userId, '+966500000099', otp);
      expect(result.success).toBe(true);

      const row = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].phone).toBe('+966500000099');

      // Audit log
      const logs = await pool.query(`SELECT * FROM account_link_log WHERE user_id = $1`, [userId]);
      expect(logs.rows.some((l: any) => l.action === 'LINK' && l.identifier_type === 'PHONE')).toBe(true);
      // The audit trail stores the hash only, never the number.
      const phoneEntry = logs.rows.find((l: any) => l.identifier_type === 'PHONE');
      expect(phoneEntry.identifier_hash).toBe(hashEmail('+966500000099'));
      expect(JSON.stringify(phoneEntry)).not.toContain('966500000099');

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('refuses to attach a number that was never proven controlled (S1.37-F-05)', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'No Proof', 'noproof@example.com', 'en', 'ACTIVE')`,
        [userId],
      );

      // No OTP was ever issued for this number.
      await expect(
        service.linkPhoneToAccount(userId, '+966500000090', PINNED_OTP),
      ).rejects.toThrow(/OTP|expired|not found/i);

      const row = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].phone).toBeNull();

      const logs = await pool.query(`SELECT * FROM account_link_log WHERE user_id = $1`, [userId]);
      expect(logs.rows).toHaveLength(0);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('refuses a wrong OTP for a number that does have a live challenge', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Wrong Code', 'wrongphone@example.com', 'en', 'ACTIVE')`,
        [userId],
      );
      await service.requestOtp('+966500000089');

      await expect(
        service.linkPhoneToAccount(userId, '+966500000089', '999999'),
      ).rejects.toThrow(/OTP/i);

      const row = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].phone).toBeNull();

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('consumes the challenge so a link OTP cannot also be used to log in', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Replay', 'replayphone@example.com', 'en', 'ACTIVE')`,
        [userId],
      );
      const otp = await issuePhoneOtp('+966500000088');

      await expect(
        service.linkPhoneToAccount(userId, '+966500000088', otp),
      ).resolves.toEqual({ success: true });

      // The consumed code must not be reusable, so it cannot be turned into a
      // session against the freshly attached number either.
      await expect(
        service.linkPhoneToAccount(userId, '+966500000088', otp),
      ).rejects.toThrow(/OTP|expired|not found/i);
      await expect(service.verifyOtp('+966500000088', otp)).rejects.toThrow(/OTP|expired|not found/i);

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('rejects linking phone already owned by another user', async () => {
      const userA = randomUUID();
      const userB = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'A', '+966500000010', 'en', 'ACTIVE')`,
        [userA],
      );
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'B', 'b@example.com', 'en', 'ACTIVE')`,
        [userB],
      );

      const otp = await issuePhoneOtp('+966500000010');
      await expect(service.linkPhoneToAccount(userB, '+966500000010', otp))
        .rejects.toThrow(/PHONE_ALREADY_IN_USE|conflict/i);

      // The refused link must not have touched the owner's row.
      const owner = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userA]);
      expect(owner.rows[0].phone).toBe('+966500000010');

      await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
    });
  });

  // ── 3. Unlink Email ───────────────────────────────────────────────

  describe('unlinkEmailFromAccount', () => {
    it('unlinks email when phone remains', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, email, email_verified_at, locale, status)
         VALUES ($1, 'Dual User', '+966500000020', 'dual@example.com', now(), 'en', 'ACTIVE')`,
        [userId],
      );

      const result = await service.unlinkEmailFromAccount(userId);
      expect(result.success).toBe(true);

      const row = await pool.query(`SELECT email, email_verified_at FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].email).toBeNull();
      expect(row.rows[0].email_verified_at).toBeNull();

      // Audit log
      const logs = await pool.query(`SELECT * FROM account_link_log WHERE user_id = $1 AND action = 'UNLINK'`, [userId]);
      expect(logs.rows).toHaveLength(1);
      expect(logs.rows[0].identifier_type).toBe('EMAIL');

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('rejects unlinking email when no phone exists (last auth method)', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Email Only', 'only@example.com', 'en', 'ACTIVE')`,
        [userId],
      );

      await expect(service.unlinkEmailFromAccount(userId))
        .rejects.toThrow(/cannot remove|last.*auth|at least one/i);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
  });

  // ── 4. Unlink Phone ──────────────────────────────────────────────

  describe('unlinkPhoneFromAccount', () => {
    it('unlinks phone when email remains', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status)
         VALUES ($1, 'Dual User 2', '+966500000030', 'hasemail@example.com', 'en', 'ACTIVE')`,
        [userId],
      );

      const result = await service.unlinkPhoneFromAccount(userId);
      expect(result.success).toBe(true);

      const row = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].phone).toBeNull();

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    it('rejects unlinking phone when no email exists (last auth method)', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'Phone Only', '+966500000040', 'en', 'ACTIVE')`,
        [userId],
      );

      await expect(service.unlinkPhoneFromAccount(userId))
        .rejects.toThrow(/cannot remove|last.*auth|at least one/i);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
  });

  // ── 5. Round-trip: Link then Unlink ──────────────────────────────

  describe('Link → Unlink round-trip', () => {
    it('preserves user ID through link/unlink cycle', async () => {
      const userId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'Round Trip', '+966500000050', 'en', 'ACTIVE')`,
        [userId],
      );

      // Link email
      await service.linkEmailToAccount(
        userId, 'roundtrip@example.com', await issueEmailOtp('roundtrip@example.com'),
      );
      let row = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].id).toBe(userId);
      expect(row.rows[0].email).toBe('roundtrip@example.com');
      expect(row.rows[0].phone).toBe('+966500000050');

      // Unlink email
      await service.unlinkEmailFromAccount(userId);
      row = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      expect(row.rows[0].id).toBe(userId);
      expect(row.rows[0].email).toBeNull();
      expect(row.rows[0].phone).toBe('+966500000050');

      // Audit log has both LINK and UNLINK
      const logs = await pool.query(`SELECT action FROM account_link_log WHERE user_id = $1 ORDER BY created_at`, [userId]);
      expect(logs.rows).toHaveLength(2);
      expect(logs.rows[0].action).toBe('LINK');
      expect(logs.rows[1].action).toBe('UNLINK');

      await pool.query(`DELETE FROM account_link_log WHERE user_id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });
  });
});
