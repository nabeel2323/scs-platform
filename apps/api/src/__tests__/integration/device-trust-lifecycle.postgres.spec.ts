/**
 * S-1 device-trust credential lifecycle (PostgreSQL).
 *
 * Where `password-login-regression.postgres.spec.ts` proves the login decision,
 * this file proves the state machine underneath it, against the real schema
 * created by `infra/drizzle/migrations/0066_device_trust_credential.sql`:
 *
 *   storage    — only a SHA-256 digest exists server-side, and the CHECK
 *                constraints make storing anything else a database error rather
 *                than a code-review item;
 *   validation — each outcome, including the ones that must be indistinguishable
 *                to the client (user_mismatch, revoked and expired all evaluate
 *                as "not trusted", and the login response collapses them);
 *   expiry     — the sliding horizon moves forward on use and is clamped by the
 *                absolute ceiling; expiry is written down durably;
 *   revocation — ownership-scoped single revocation, bulk revocation, session
 *                revocation de-trusting the device, and refresh-token reuse
 *                ending trust with the token chain;
 *   lifecycle  — logout ends the trust it created, refresh does not;
 *   logout     — and it ends it through the session anchor, so a logout that
 *                presents no cookie and no proof header still de-trusts the
 *                browser (finding B6);
 *   password   — a successful password change ends every exemption the account
 *                has, and a failed one ends nothing (finding B5).
 *
 * The container is throwaway: this migration is NOT applied to staging or
 * production as part of the remediation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcrypt';
import * as schema from '../../drizzle/schema';
import { IdentityService } from '../../modules/identity/identity.service';
import {
  DEVICE_TRUST_COOKIE_NAME,
  DEVICE_TRUST_PROOF_HEADER,
  DEVICE_TRUST_PROOF_VALUE,
  readPresentedDeviceCredential,
} from '../../common/auth/device-trust-cookie';
import { createMockRedisStore } from '../unit/helpers/mock-redis';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

/** The service's own digest rule, asserted rather than assumed. */
const digest = (credential: string) => createHash('sha256').update(credential).digest('hex');

describe('Device-trust credential lifecycle (S-1)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  let service: IdentityService;
  let mockRedis: ReturnType<typeof createMockRedisStore>;
  /**
   * The hash the two user rows were created with, re-applied before every test.
   * `changePassword` writes to those rows for real, and a password change is
   * exactly what the B5 cases exercise — without a reset, the second one in the
   * file would be testing "current password is wrong" instead of revocation.
   */
  let sharedPasswordHash: string;

  const alice = {
    id: randomUUID(),
    email: 'alice-devicetrust@test.com',
    phone: '+966500090001',
    password: 'Test@12345678',
  };
  const bob = {
    id: randomUUID(),
    email: 'bob-devicetrust@test.com',
    phone: '+966500090002',
    password: 'Test@12345678',
  };

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

  /** Every test owns its credential rows; nothing here is shared state. */
  const wipe = () => pool.query(`DELETE FROM device_credentials`);

  /**
   * Explicit timestamp normalisation for raw rows.
   *
   * A raw `pool.query` under vitest/vite-node yields `timestamptz` as a STRING
   * (the runner loads pg-types in a way that never registers the Date parser),
   * while the same column read through drizzle yields a Date. Nothing in this
   * suite may depend on which of the two the loader happened to give it, so raw
   * rows are converted here, once, and every assertion below sees a Date.
   *
   * An unparseable value throws, naming the column's raw text: a silently
   * Invalid Date would turn the expiry assertions below into NaN comparisons
   * that can only ever fail confusingly.
   */
  const asDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError(`Unparseable timestamp from PostgreSQL: ${String(value)}`);
    }
    return parsed;
  };

  const TIMESTAMP_COLUMNS = [
    'created_at',
    'last_used_at',
    'expires_at',
    'hard_expires_at',
    'revoked_at',
  ] as const;

  /**
   * Normalise a raw pg row in place. Typed as `any` deliberately: it wraps
   * `SELECT *`, whose shape pg hands back untyped anyway, and naming every
   * column here would only add a second schema definition to keep in sync. The
   * timestamp conversion is the part that needs to be real.
   */
  const withDateColumns = (row: any): any => {
    for (const column of TIMESTAMP_COLUMNS) {
      if (row && column in row) row[column] = asDate(row[column]);
    }
    return row;
  };

  const rowByDigest = async (credential: string) => {
    const result = await pool.query(
      `SELECT * FROM device_credentials WHERE credential_hash = $1`,
      [digest(credential)],
    );
    return result.rows[0] ? withDateColumns(result.rows[0]) : undefined;
  };

  const setExpiry = async (
    credential: string,
    over: { expiresAt?: Date; hardExpiresAt?: Date },
  ) => {
    await pool.query(
      `UPDATE device_credentials
         SET expires_at = COALESCE($2, expires_at),
             hard_expires_at = COALESCE($3, hard_expires_at)
       WHERE credential_hash = $1`,
      [digest(credential), over.expiresAt ?? null, over.hardExpiresAt ?? null],
    );
  };

  /** A live second factor for `phone`, so verifyOtp can complete a real login. */
  function injectKnownOtp(phone: string, otp: string) {
    const hmacSecret =
      process.env['OTP_HMAC_SECRET'] || 'dev-hmac-secret-change-me-in-production-64chars-minimum!!';
    const salt = randomBytes(16).toString('hex');
    const otpHash = createHmac('sha256', hmacSecret).update(otp + salt).digest('hex');
    mockRedis._store.set(`otp:${phone}`, {
      value: JSON.stringify({
        ch: randomUUID(),
        hs: otpHash,
        s: salt,
        ca: Date.now().toString(),
        co: false,
      }),
      ttl: 90,
    });
  }

  /**
   * Enrol a device the way a real client does — a completed second factor —
   * so the credential carries the session anchor that `issueDeviceCredential`
   * alone would leave NULL. Returns the credential, the tokens the enrolment
   * handed out, and the session row the credential is anchored to.
   */
  async function enrolViaOtp(phone: string, otp: string, deviceId: string, platform = 'web') {
    injectKnownOtp(phone, otp);
    const verified = await service.verifyOtp(phone, otp, deviceId, {
      platform,
      userAgent: `ua-${deviceId}`,
    });
    const credential = verified.deviceTrust?.credential ?? '';
    const anchored = await pool.query(
      `SELECT created_by_session FROM device_credentials WHERE credential_hash = $1`,
      [digest(credential)],
    );
    return {
      ...verified,
      credential,
      anchoredSession: anchored.rows[0]?.created_by_session ?? null,
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema }) as any;

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('COMMIT');
      } catch {
        await pool.query('ROLLBACK');
      }
    }

    const client = await pool.connect();
    try {
      await seedPlatformRbac(client);
    } finally {
      client.release();
    }
    await pool.query(`UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled'`);

    const hash = await bcrypt.hash(alice.password, 12);
    sharedPasswordHash = hash;
    await pool.query(
      `INSERT INTO users (id, full_name, phone, email, password_hash, password_set_at, locale, status, email_verified_at)
       VALUES ($1, 'Alice', $2, $3, $4, now(), 'en', 'ACTIVE', now())`,
      [alice.id, alice.phone, alice.email, hash],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone, email, password_hash, password_set_at, locale, status, email_verified_at)
       VALUES ($1, 'Bob', $2, $3, $4, now(), 'en', 'ACTIVE', now())`,
      [bob.id, bob.phone, bob.email, hash],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    mockRedis = createMockRedisStore();
    vi.clearAllMocks();
    mockRateLimit.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 4 });
    mockDelivery.deliverOtp.mockResolvedValue({
      success: true,
      status: 'delivered',
      deliveryOutcome: 'delivered' as const,
    });
    mockDelivery.deliverEmailOtp.mockResolvedValue({
      success: true,
      status: 'delivered',
      deliveryOutcome: 'delivered' as const,
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
    await wipe();
    // Credentials are wiped per test; passwords are the one other piece of state
    // a test here can change, so they are restored from the hash the rows were
    // created with. Sessions are deliberately left accumulating: no assertion
    // below counts them, and the ones it does read are selected by session id.
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id IN ($2, $3)`, [
      sharedPasswordHash,
      alice.id,
      bob.id,
    ]);
  });

  // ── 1. Storage: what the server keeps ─────────────────────────────

  describe('Storage (requirement 4)', () => {
    it('stores a SHA-256 hex digest and never the credential', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'alice-laptop' });

      const row = await rowByDigest(credential);
      expect(row).toBeTruthy();
      expect(row.credential_hash).toBe(digest(credential));
      expect(row.credential_hash.trim()).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(credential);
    });

    it('mints a full 256-bit opaque value, unique per issuance', async () => {
      const a = await service.issueDeviceCredential(alice.id, { label: 'a' });
      const b = await service.issueDeviceCredential(alice.id, { label: 'b' });

      // base64url of 32 random bytes: 43 characters, unpadded.
      expect(a.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a.credential).not.toBe(b.credential);
      expect(randomBytesLength(a.credential)).toBe(32);
    });

    it('refuses a plaintext credential in the digest column at the database level', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'x' });
      // The migration's CHECK is what makes "only a digest is stored" an
      // enforced property: an accidental plaintext insert is an error, not a
      // review finding.
      await expect(
        pool.query(
          `INSERT INTO device_credentials (user_id, credential_hash, device_label, expires_at, hard_expires_at)
           VALUES ($1, $2, 'oops', now() + interval '1 day', now() + interval '2 day')`,
          [alice.id, credential],
        ),
      ).rejects.toThrow(/violating check constraint|device_credentials_hash_is_sha256_hex/i);
    });

    it('will not let one digest belong to two accounts (requirement 8, structurally)', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'shared?' });
      await expect(
        pool.query(
          `INSERT INTO device_credentials (user_id, credential_hash, device_label, expires_at, hard_expires_at)
           VALUES ($1, $2, 'dup', now() + interval '1 day', now() + interval '2 day')`,
          [bob.id, digest(credential)],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    });

    it('refuses an expiry that outlives its own ceiling', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'bad window' });
      await expect(
        pool.query(
          `UPDATE device_credentials SET expires_at = hard_expires_at + interval '1 day'
           WHERE credential_hash = $1`,
          [digest(credential)],
        ),
      ).rejects.toThrow(/device_credentials_expiry_ordered|violating check constraint/i);
    });

    it('survives deletion of the session that enrolled it, keeping the audit row', async () => {
      // created_by_session is SET NULL, not CASCADE: pruning a session must not
      // erase trust state, and must not leave a dangling reference either.
      const sessionId = randomUUID();
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, expires_at)
         VALUES ($1, $2, $3, 'web', now() + interval '1 day')`,
        [sessionId, alice.id, 'e'.repeat(64)],
      );

      const { credential } = await service.issueDeviceCredential(alice.id, {
        sessionId,
        label: 'from session',
      });
      expect((await rowByDigest(credential)).created_by_session).toBe(sessionId);

      await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      const after = await rowByDigest(credential);
      expect(after.created_by_session).toBeNull();
      expect(after.revoked_at).toBeNull();
    });
  });

  // ── 2. Validation outcomes ────────────────────────────────────────

  describe('Validation outcomes (requirements 1, 2, 6, 7, 8)', () => {
    it('treats an absent presentation as no credential at all', async () => {
      expect((await service.validateDeviceCredential(null, alice.id)).status).toBe('absent');
      expect((await service.validateDeviceCredential(undefined, alice.id)).status).toBe('absent');
      expect((await service.validateDeviceCredential('', alice.id)).status).toBe('absent');
    });

    it('treats a never-issued value as unknown rather than erroring', async () => {
      const forged = randomBytes(32).toString('base64url');
      expect((await service.validateDeviceCredential(forged, alice.id)).status).toBe('unknown');
    });

    it('trusts the account that owns a live credential', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'mine' });
      const result = await service.validateDeviceCredential(credential, alice.id);
      expect(result.status).toBe('trusted');
      expect(result.hardExpiresAt).toBeInstanceOf(Date);
    });

    it("rejects another account's credential and cannot consume its slide", async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'alice only' });
      const before = await rowByDigest(credential);

      expect((await service.validateDeviceCredential(credential, bob.id)).status).toBe('user_mismatch');

      // A foreign presentation must not touch Alice's row: not its horizon, not
      // its last-used stamp — otherwise another account could keep a device
      // trusted forever, or mark it used at a time that never happened.
      const after = await rowByDigest(credential);
      expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
      expect(after.last_used_at.getTime()).toBe(before.last_used_at.getTime());

      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('trusted');
    });

    it('rejects a revoked credential (requirement 6)', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'revoked soon' });
      const row = await rowByDigest(credential);
      await service.revokeDeviceCredentialById(alice.id, row.id);
      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('revoked');
    });

    it('expires with the sliding horizon and revokes it durably (requirement 7)', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'idle' });
      await setExpiry(credential, { expiresAt: new Date(Date.now() - 60_000) });

      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('expired');

      const row = await rowByDigest(credential);
      expect(row.revoked_at).toBeTruthy();
      expect(row.revoked_reason).toBe('EXPIRED');
      // Durably, not transiently: the next presentation is already 'revoked',
      // so an expired device cannot slide itself back to life.
      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('revoked');
      expect((await rowByDigest(credential)).expires_at.getTime()).toBe(row.expires_at.getTime());
    });

    it('expires at the absolute ceiling even while the slide is still live', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'too old' });
      await setExpiry(credential, {
        expiresAt: new Date(Date.now() - 120_000),
        hardExpiresAt: new Date(Date.now() - 60_000),
      });

      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('expired');
    });

    it('slides the horizon on validated use but never past the ceiling', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'sliding' });
      // Burn almost all of the horizon WITHOUT expiring it. A past-due horizon is
      // not a slide candidate — it is an expiry, asserted in the test above — so
      // the value is one minute ahead of now: still live, and shorter than the
      // sliding window a validated use should restore.
      const nearExpiry = new Date(Date.now() + 60_000);
      await setExpiry(credential, { expiresAt: nearExpiry });
      // Pin `last_used_at` from the host clock before comparing it to anything.
      // `issueDeviceCredential` lets PostgreSQL fill the column default, and the
      // container clock can sit a few milliseconds off the host's — which would
      // make "the stamp moved forward on validated use" fail for a reason that
      // has nothing to do with the code under test. Timestamps the service itself
      // writes (expires_at, hard_expires_at) are host-clock values throughout.
      await pool.query(
        `UPDATE device_credentials SET last_used_at = $2 WHERE credential_hash = $1`,
        [digest(credential), new Date(Date.now() - 1_000)],
      );
      const before = await rowByDigest(credential);
      expect(before.expires_at.getTime()).toBe(nearExpiry.getTime());

      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('trusted');

      const slid = await rowByDigest(credential);
      expect(slid.expires_at.getTime()).toBeGreaterThan(before.expires_at.getTime());
      expect(slid.expires_at.getTime()).toBeLessThanOrEqual(slid.hard_expires_at.getTime());
      expect(slid.last_used_at.getTime()).toBeGreaterThan(before.last_used_at.getTime());

      // Clamp: with ten minutes left on the absolute ceiling, one more use must
      // land on the ceiling rather than a full sliding window beyond it.
      const hard = new Date(Date.now() + 600_000);
      await setExpiry(credential, { expiresAt: new Date(Date.now() + 60_000), hardExpiresAt: hard });
      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('trusted');
      const clamped = await rowByDigest(credential);
      expect(clamped.expires_at.getTime()).toBeLessThanOrEqual(clamped.hard_expires_at.getTime());
      expect(Math.abs(clamped.expires_at.getTime() - hard.getTime())).toBeLessThan(2_000);
    });
  });

  // ── 3. Revocation ─────────────────────────────────────────────────

  describe('Revocation (requirements 6, 10)', () => {
    it('scopes a single revocation to the caller', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'alice' });
      const row = await rowByDigest(credential);

      // Bob names Alice's id: nothing is revoked, and no error discloses whose
      // id it was.
      const foreign = await service.revokeDeviceCredentialById(bob.id, row.id);
      expect(foreign).toEqual({ success: true, revokedCount: 0 });
      expect((await rowByDigest(credential)).revoked_at).toBeNull();

      const own = await service.revokeDeviceCredentialById(alice.id, row.id);
      expect(own.revokedCount).toBe(1);
      expect((await rowByDigest(credential)).revoked_reason).toBe('MANUAL');
    });

    it('records a revocation in the audit trail without credential material', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'audit me' });
      const row = await rowByDigest(credential);
      await service.revokeDeviceCredentialById(alice.id, row.id);

      const calls = mockAudit.record.mock.calls as unknown as Array<[{ action: string }]>;
      const entry = calls.find(([e]) => e?.action === 'auth.device_trust_revoked')?.[0];
      expect(entry).toBeTruthy();
      const serialized = JSON.stringify(calls.find(([e]) => e?.action === 'auth.device_trust_revoked'));
      expect(serialized).not.toContain(credential);
      expect(serialized).not.toContain(digest(credential));
    });

    it('bulk-revokes only the live credentials of that account', async () => {
      const a = await service.issueDeviceCredential(alice.id, { label: 'a' });
      const b = await service.issueDeviceCredential(alice.id, { label: 'b' });
      const c = await service.issueDeviceCredential(bob.id, { label: 'bob' });

      const aRow = await rowByDigest(a.credential);
      await service.revokeDeviceCredentialById(alice.id, aRow.id);

      // Only one live row left for Alice, so the bulk call reports exactly that.
      expect(await service.revokeAllDeviceCredentials(alice.id, 'ROTATION_REUSE')).toBe(1);
      expect((await rowByDigest(b.credential)).revoked_reason).toBe('ROTATION_REUSE');
      // Bob's trust is untouched by Alice's incident.
      expect((await rowByDigest(c.credential)).revoked_at).toBeNull();
    });

    it("lists the caller's live devices and exposes no secret field", async () => {
      const keep = await service.issueDeviceCredential(alice.id, { label: 'keep' });
      const drop = await service.issueDeviceCredential(alice.id, { label: 'drop' });
      const other = await service.issueDeviceCredential(bob.id, { label: 'not alice' });

      const dropRow = await rowByDigest(drop.credential);
      await service.revokeDeviceCredentialById(alice.id, dropRow.id);

      const list = await service.listDeviceCredentials(alice.id);
      expect(list.map((device) => device.deviceLabel)).toEqual(['keep']);
      for (const device of list) {
        // No digest, no prefix of one, no credential — just what a person needs
        // to recognise a device they no longer control.
        expect(Object.keys(device).sort()).toEqual(
          ['createdAt', 'deviceLabel', 'expiresAt', 'hardExpiresAt', 'id', 'lastUsedAt'].sort(),
        );
      }
      const serialized = JSON.stringify(list);
      expect(serialized).not.toContain(keep.credential);
      expect(serialized).not.toContain(digest(keep.credential));
      expect(serialized).not.toContain(other.credential);
    });

    it('de-trusts the device whose session revoked it (requirement 5)', async () => {
      const deviceId = 'device-to-forget';
      injectKnownOtp(alice.phone, '424242');
      await service.verifyOtp(alice.phone, '424242', deviceId, { platform: 'web', userAgent: 'ua' });

      const enrolled = await pool.query(
        `SELECT credential_hash, created_by_session FROM device_credentials WHERE user_id = $1`,
        [alice.id],
      );
      expect(enrolled.rowCount).toBe(1);

      // The credential was enrolled by that login, so revoking the session by
      // device must remove the second-factor exemption with it.
      const result = await service.revokeSessionsByDevice(alice.id, deviceId);
      expect(result.success).toBe(true);
      expect(result.revokedCount).toBeGreaterThanOrEqual(1);
      expect(result.deTrustedCount).toBe(1);
      expect(
        (await pool.query(`SELECT revoked_reason FROM device_credentials WHERE user_id = $1`, [alice.id]))
          .rows[0].revoked_reason,
      ).toBe('SESSION_REVOKED');
    });

    it('revoking a device leaves another device of the same account trusted', async () => {
      injectKnownOtp(alice.phone, '246246');
      const first = await service.verifyOtp(alice.phone, '246246', 'device-A', {
        platform: 'web',
        userAgent: 'ua-a',
      });
      injectKnownOtp(alice.phone, '135135');
      const second = await service.verifyOtp(alice.phone, '135135', 'device-B', {
        platform: 'ios',
        userAgent: 'ua-b',
      });

      await service.revokeSessionsByDevice(alice.id, 'device-A');

      expect(
        (await service.validateDeviceCredential(second.deviceTrust?.credential ?? '', alice.id)).status,
      ).toBe('trusted');
      expect(
        (await service.validateDeviceCredential(first.deviceTrust?.credential ?? '', alice.id)).status,
      ).toBe('revoked');
    });
  });

  // ── 4. Login / refresh / logout behavior ──────────────────────────

  describe('Login, refresh and logout (requirements 9, 10)', () => {
    it('enrols a device when a second factor completes, and that enrolment is what trusts it later', async () => {
      injectKnownOtp(alice.phone, '135135');
      const verified = await service.verifyOtp(
        alice.phone,
        '135135',
        'browser-1',
        { platform: 'web', userAgent: 'ua' },
      );

      // The credential travels to the transport, and nowhere else: it is not a
      // field of the auth response the service returns to a caller that logs it.
      expect(verified.accessToken).toBeTruthy();
      expect(verified.refreshToken).toBeTruthy();
      const credential = verified.deviceTrust?.credential ?? '';
      expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(verified.deviceTrust?.maxAgeSeconds).toBeGreaterThan(0);

      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('trusted');

      // …and the next password login skips OTP because of it, re-installing the
      // same value so the browser keeps presenting what it already has.
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-1',
        undefined,
        undefined,
        credential,
      );
      expect(login.accessToken).toBeTruthy();
      expect(login.requiresOtp).toBeUndefined();
      expect(login.deviceTrust).toEqual({ credential, maxAgeSeconds: expect.any(Number) });
    });

    it('ends the trust it created on logout (requirement 10)', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'logout test' });
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-2',
        undefined,
        undefined,
        credential,
      );
      expect(login.accessToken).toBeTruthy();

      const out = await service.logout(login.refreshToken, credential);
      expect(out.success).toBe(true);
      expect(out.deviceTrust).toEqual({ clear: true });

      // The next login from this browser is an ordinary untrusted one.
      const again = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-2',
        undefined,
        undefined,
        credential,
      );
      expect(again.requiresOtp).toBe(true);
      expect(again.accessToken).toBe('');
      expect((await rowByDigest(credential)).revoked_reason).toBe('LOGOUT');
    });

    it("will not revoke someone else's credential through a logout", async () => {
      const aliceCredential = (await service.issueDeviceCredential(alice.id, { label: 'alice' })).credential;
      const bobRefreshToken = randomUUID();
      const bobSession = randomUUID();
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, expires_at)
         VALUES ($1, $2, $3, 'web', now() + interval '1 day')`,
        [bobSession, bob.id, digest(bobRefreshToken)],
      );

      const out = await service.logout(bobRefreshToken, aliceCredential);
      expect(out.success).toBe(true);
      // Nothing of Bob's was revoked, so no cookie-clear is claimed…
      expect(out.deviceTrust).toBeUndefined();
      // …and Alice's credential is still live.
      expect((await rowByDigest(aliceCredential)).revoked_at).toBeNull();

      await pool.query(`DELETE FROM sessions WHERE id = $1`, [bobSession]);
    });

    it('preserves device trust across refresh-token rotation (requirement 9)', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'rotation' });
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-3',
        undefined,
        undefined,
        credential,
      );

      const refreshed = await service.refreshToken(login.refreshToken, credential);
      expect(refreshed.accessToken).toBeTruthy();
      expect(refreshed.newRefreshToken).toBeTruthy();
      expect(refreshed.deviceTrust).toEqual({ credential, maxAgeSeconds: expect.any(Number) });

      // Still trusted after the rotation…
      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('trusted');
      const afterRotation = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-3',
        undefined,
        undefined,
        credential,
      );
      expect(afterRotation.requiresOtp).toBeUndefined();

      // …and the rotated token still works, so the session survived too.
      await expect(service.refreshToken(refreshed.newRefreshToken, credential)).resolves.toBeTruthy();
    });

    it('revokes device trust when a refresh token is replayed', async () => {
      // Reuse detection already ends the token chain; the second-factor
      // exemption lives in the same browser, so it goes with it.
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'compromised' });
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-4',
        undefined,
        undefined,
        credential,
      );

      await service.refreshToken(login.refreshToken, credential);
      await expect(service.refreshToken(login.refreshToken, credential)).rejects.toThrow(
        /Invalid or expired/i,
      );

      expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('revoked');
      expect((await rowByDigest(credential)).revoked_reason).toBe('ROTATION_REUSE');

      // The browser still presenting the dead value is told to drop it.
      const challenged = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-4',
        undefined,
        undefined,
        credential,
      );
      expect(challenged.requiresOtp).toBe(true);
      expect(challenged.deviceTrust).toEqual({ clear: true });
    });

    it('tells a browser presenting an expired credential to drop it', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'stale cookie' });
      await setExpiry(credential, { expiresAt: new Date(Date.now() - 1_000) });

      const result = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-5',
        undefined,
        undefined,
        credential,
      );
      expect(result.requiresOtp).toBe(true);
      expect(result.deviceTrust).toEqual({ clear: true });
    });

    it('gives a credential-less browser the same OTP challenge as any other', async () => {
      const result = await service.loginWithPassword(
        alice.email,
        alice.password,
        'brand-new-browser',
      );
      expect(result.requiresOtp).toBe(true);
      expect(result.deviceTrust).toBeUndefined();
      expect(result.otpDelivery).toBe('accepted');

      // Nothing was minted for a challenge that has not been completed.
      const rows = await pool.query(
        `SELECT COUNT(*) FROM device_credentials WHERE user_id = $1`,
        [alice.id],
      );
      expect(parseInt(rows.rows[0].count, 10)).toBe(0);
    });

    it('does not let a copied client-side deviceId carry trust it once had', async () => {
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'device id test' });
      const trusted = await service.loginWithPassword(
        alice.email,
        alice.password,
        'device-6',
        undefined,
        undefined,
        credential,
      );
      expect(trusted.requiresOtp).toBeUndefined();

      // Same account, same password, same deviceId — but the credential stayed
      // in the original browser. This is the exact S-1 bypass: a UUID a client
      // can read out of localStorage and paste elsewhere.
      const copied = await service.loginWithPassword(
        alice.email,
        alice.password,
        'device-6',
        undefined,
        undefined,
        null,
      );
      expect(copied.requiresOtp).toBe(true);
      expect(copied.accessToken).toBe('');
    });
  });

  // ── 5. Logout revokes through the session anchor (finding B6) ─────

  describe('Logout through the session anchor (finding B6)', () => {
    /**
     * Requirement 10 said logout ends the trust it created. Before this fix it
     * only did that when the request handed the credential back — and handing it
     * back needs BOTH the cookie and the `x-device-trust` proof header. A logout
     * that carried neither closed the session and left the exemption live in the
     * browser profile, which is the shared-profile case the requirement exists for.
     * The anchor (`device_credentials.created_by_session`) is the server-side link
     * that closes it, and these tests exercise it the way the transport does.
     */
    it('revokes the credential the session earned when nothing is presented', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '600600', 'browser-anchored');
      expect(enrolled.anchoredSession).toBeTruthy();

      const out = await service.logout(enrolled.refreshToken, null);
      expect(out.success).toBe(true);
      // The cookie-clear instruction is still issued, so a browser holding the
      // value stops presenting it (preserved requirement 10 behaviour).
      expect(out.deviceTrust).toEqual({ clear: true });

      const row = await rowByDigest(enrolled.credential);
      expect(row.revoked_at).toBeInstanceOf(Date);
      expect(row.revoked_reason).toBe('LOGOUT');

      // A revoked credential cannot establish trust — not through validation,
      // not through a password login that presents it.
      expect((await service.validateDeviceCredential(enrolled.credential, alice.id)).status).toBe(
        'revoked',
      );
      const again = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-anchored',
        undefined,
        undefined,
        enrolled.credential,
      );
      expect(again.requiresOtp).toBe(true);
      expect(again.accessToken).toBe('');
      expect(again.deviceTrust).toEqual({ clear: true });
    });

    it('revokes it when the cookie is there but the proof header is not', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '610610', 'browser-noproof');

      // Exactly what the controller computes for a request that carries the
      // cookie without the same-origin proof: the CSRF control makes the
      // credential unread to the service, so path 1 cannot revoke anything.
      const withoutProof = { headers: { cookie: `${DEVICE_TRUST_COOKIE_NAME}=${enrolled.credential}` } };
      expect(
        readPresentedDeviceCredential(withoutProof as any),
      ).toBeNull();

      const out = await service.logout(
        enrolled.refreshToken,
        readPresentedDeviceCredential(withoutProof as any),
      );
      expect(out.deviceTrust).toEqual({ clear: true });
      expect((await rowByDigest(enrolled.credential)).revoked_reason).toBe('LOGOUT');

      // With the proof header the same request reads as a real presentation,
      // which is why both revocation paths exist rather than one.
      const withProof = {
        headers: {
          cookie: `${DEVICE_TRUST_COOKIE_NAME}=${enrolled.credential}`,
          [DEVICE_TRUST_PROOF_HEADER]: DEVICE_TRUST_PROOF_VALUE,
        },
      };
      expect(readPresentedDeviceCredential(withProof as any)).toBe(enrolled.credential);
    });

    it('revokes once when the session anchor and the presented credential are the same row', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '620620', 'browser-both');

      const out = await service.logout(enrolled.refreshToken, enrolled.credential);
      expect(out).toEqual({ success: true, deviceTrust: { clear: true } });

      const row = await rowByDigest(enrolled.credential);
      expect(row.revoked_reason).toBe('LOGOUT');
      // Both paths target one row and both are guarded on `revoked_at IS NULL`,
      // so there is exactly one revocation to see.
      const live = await pool.query(`SELECT COUNT(*) FROM device_credentials WHERE revoked_at IS NULL`);
      expect(parseInt(live.rows[0].count, 10)).toBe(0);
    });

    it('keeps the anchor pointed at the live session across rotation and trusted login', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '630630', 'browser-rotated');

      // A real browser rotates within minutes of enrolling. If the anchor stayed
      // on the enrolment session, every logout after the first refresh would miss.
      const refreshed = await service.refreshToken(enrolled.refreshToken, enrolled.credential);
      expect((await rowByDigest(enrolled.credential)).created_by_session).not.toBe(
        enrolled.anchoredSession,
      );

      const out = await service.logout(refreshed.newRefreshToken, null);
      expect(out.deviceTrust).toEqual({ clear: true });
      expect((await rowByDigest(enrolled.credential)).revoked_reason).toBe('LOGOUT');

      // Same for a session created by a later trusted password login.
      const reEnrolled = await enrolViaOtp(alice.phone, '640640', 'browser-relogin');
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-relogin',
        undefined,
        undefined,
        reEnrolled.credential,
      );
      expect(login.requiresOtp).toBeUndefined();

      const loggedOut = await service.logout(login.refreshToken, null);
      expect(loggedOut.deviceTrust).toEqual({ clear: true });
      expect((await service.validateDeviceCredential(reEnrolled.credential, alice.id)).status).toBe(
        'revoked',
      );
    });

    it('leaves another device of the same account trusted when it presents nothing', async () => {
      const a = await enrolViaOtp(alice.phone, '650650', 'device-A');
      const b = await enrolViaOtp(alice.phone, '660660', 'device-B');

      const out = await service.logout(a.refreshToken, null);
      expect(out.deviceTrust).toEqual({ clear: true });

      expect((await rowByDigest(a.credential)).revoked_reason).toBe('LOGOUT');
      // The sweep is by session, not by account: B keeps its exemption…
      expect((await rowByDigest(b.credential)).revoked_at).toBeNull();
      expect((await service.validateDeviceCredential(b.credential, alice.id)).status).toBe('trusted');
      // …and so does its session.
      const bSession = await pool.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [
        b.anchoredSession,
      ]);
      expect(bSession.rows[0].revoked_at).toBeNull();
    });

    it('revokes a credential the logout request itself presents, even if another session earned it', async () => {
      const a = await enrolViaOtp(alice.phone, '670670', 'device-A');
      const b = await enrolViaOtp(alice.phone, '680680', 'device-B');

      const out = await service.logout(a.refreshToken, b.credential);
      expect(out.deviceTrust).toEqual({ clear: true });

      // The session closing loses what it earned, and so does the exemption that
      // was handed to the request closing it. The only way to present a
      // credential is to already hold one, so this is not a revocation primitive
      // against anyone else — while leaving it live would keep an OTP-free path
      // in the very profile that just logged out.
      expect((await rowByDigest(a.credential)).revoked_reason).toBe('LOGOUT');
      expect((await rowByDigest(b.credential)).revoked_reason).toBe('LOGOUT');
    });

    it('is idempotent: a second logout changes nothing and cannot revive trust', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '690690', 'browser-twice');

      const first = await service.logout(enrolled.refreshToken, enrolled.credential);
      const revokedAt = (await rowByDigest(enrolled.credential)).revoked_at as Date;
      expect(first.success).toBe(true);

      const second = await service.logout(enrolled.refreshToken, enrolled.credential);
      expect(second.success).toBe(true);

      const row = await rowByDigest(enrolled.credential);
      // Not re-stamped, not re-reasoned: the guard is `revoked_at IS NULL`.
      expect(row.revoked_at.getTime()).toBe(revokedAt.getTime());
      expect(row.revoked_reason).toBe('LOGOUT');
      const count = await pool.query(
        `SELECT COUNT(*) FROM device_credentials WHERE user_id = $1 AND revoked_at IS NOT NULL`,
        [alice.id],
      );
      expect(parseInt(count.rows[0].count, 10)).toBe(1);
      expect((await service.validateDeviceCredential(enrolled.credential, alice.id)).status).toBe(
        'revoked',
      );
    });

    it('de-trusts after logout even for a credential minted without a session anchor', async () => {
      // The half of the story that predates this fix, kept under test so the new
      // path cannot quietly replace it: `issueDeviceCredential` (used by the
      // device list and by tests) leaves `created_by_session` NULL, so only the
      // presented-credential path can revoke it.
      const { credential } = await service.issueDeviceCredential(alice.id, { label: 'unanchored' });
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-unanchored',
        undefined,
        undefined,
        credential,
      );
      expect(login.requiresOtp).toBeUndefined();

      // A trusted login moves the anchor onto its own session, so the logout that
      // follows finds the row even though it was minted unanchored.
      const out = await service.logout(login.refreshToken, null);
      expect(out.deviceTrust).toEqual({ clear: true });
      expect((await rowByDigest(credential)).revoked_reason).toBe('LOGOUT');
    });
  });

  // ── 6. Password change ends every exemption (finding B5) ──────────

  describe('Password change revocation (finding B5)', () => {
    const rotated = 'Rotated#Passphrase7';

    it('revokes every credential so a previously trusted browser must verify OTP again', async () => {
      const a = await enrolViaOtp(alice.phone, '700700', 'phone-A');
      const b = await enrolViaOtp(alice.phone, '710710', 'phone-B');
      const bobCredential = await service.issueDeviceCredential(bob.id, { label: 'bob unaffected' });

      const out = await service.changePassword(alice.id, alice.password, rotated);
      expect(out.success).toBe(true);

      for (const credential of [a.credential, b.credential]) {
        const row = await rowByDigest(credential);
        expect(row.revoked_at).toBeInstanceOf(Date);
        expect(row.revoked_reason).toBe('PASSWORD_CHANGE');
        expect((await service.validateDeviceCredential(credential, alice.id)).status).toBe('revoked');
      }
      // One account's password is not another account's problem.
      expect((await rowByDigest(bobCredential.credential)).revoked_at).toBeNull();

      // Both browsers now face the second factor they were exempt from.
      for (const [credential, deviceId] of [
        [a.credential, 'phone-A'],
        [b.credential, 'phone-B'],
      ] as const) {
        const challenged = await service.loginWithPassword(
          alice.email,
          rotated,
          deviceId,
          undefined,
          undefined,
          credential,
        );
        expect(challenged.requiresOtp).toBe(true);
        expect(challenged.accessToken).toBe('');
        expect(challenged.deviceTrust).toEqual({ clear: true });
      }
    });

    it('revokes nothing when the change does not succeed', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '720720', 'browser-fail');

      await expect(
        service.changePassword(alice.id, 'Wrong#OldPassword1', rotated),
      ).rejects.toThrow(/incorrect/i);
      expect((await rowByDigest(enrolled.credential)).revoked_at).toBeNull();

      await expect(service.changePassword(alice.id, alice.password, 'short')).rejects.toThrow(
        /at least 12 characters/i,
      );
      expect((await rowByDigest(enrolled.credential)).revoked_at).toBeNull();
      expect((await service.validateDeviceCredential(enrolled.credential, alice.id)).status).toBe(
        'trusted',
      );

      // The old secret still works, which is the point: a rejected change must not
      // be a way to lock an account out of its own trusted devices.
      const login = await service.loginWithPassword(
        alice.email,
        alice.password,
        'browser-fail',
        undefined,
        undefined,
        enrolled.credential,
      );
      expect(login.requiresOtp).toBeUndefined();
    });

    it('audits the de-trust with a reason and no credential material', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '730730', 'audit-browser');

      await service.changePassword(alice.id, alice.password, rotated);

      const calls = mockAudit.record.mock.calls as unknown as Array<[any]>;
      const entry = calls.find(([e]) => e?.action === 'auth.device_trust_revoked')?.[0];
      expect(entry).toBeTruthy();
      expect(entry.actorType).toBe('SYSTEM');
      expect(entry.actorId).toBe(alice.id);
      expect(entry.metadata).toEqual({ revokedCount: 1, reason: 'PASSWORD_CHANGE' });

      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(enrolled.credential);
      expect(serialized).not.toContain(digest(enrolled.credential));

      // The credential audit row for the change itself is the pre-existing one.
      const rows = await pool.query(
        `SELECT action FROM credential_audit_log WHERE user_id = $1`,
        [alice.id],
      );
      expect(rows.rows.map((r: { action: string }) => r.action)).toContain('PASSWORD_CHANGE');
    });

    it('leaves the inherited session semantics alone: the named device is revoked, others are not', async () => {
      // Pins what changePassword does to sessions today (byte-identical to the
      // baseline) next to the new credential revocation, so the asymmetry between
      // them is a tested fact rather than a footnote. Fixing that asymmetry is a
      // session-semantics change outside finding B5.
      const a = await enrolViaOtp(alice.phone, '740740', 'device-A');
      const b = await enrolViaOtp(alice.phone, '750750', 'device-B');

      await service.changePassword(alice.id, alice.password, rotated, 'device-A');

      // Credentials: account-wide.
      expect((await rowByDigest(a.credential)).revoked_reason).toBe('PASSWORD_CHANGE');
      expect((await rowByDigest(b.credential)).revoked_reason).toBe('PASSWORD_CHANGE');

      // Sessions: only the device named by the request. Queried by session id,
      // because sessions are not wiped between tests and `device_id` values
      // repeat across them.
      const sessionRows = await pool.query(
        `SELECT id, device_id, revoked_at FROM sessions WHERE user_id = $1`,
        [alice.id],
      );
      const byId = new Map(sessionRows.rows.map((r: any) => [r.id, r]));
      expect(byId.get(a.anchoredSession).device_id).toBe('device-A');
      // asDate, not toBeInstanceOf: this row came from a raw query, where the
      // runner hands back a string (see the note above `withDateColumns`).
      expect(asDate(byId.get(a.anchoredSession).revoked_at)).toBeInstanceOf(Date);
      expect(byId.get(b.anchoredSession).device_id).toBe('device-B');
      expect(byId.get(b.anchoredSession).revoked_at).toBeNull();
    });

    it('lets a browser earn trust again after the change, with a different credential', async () => {
      const enrolled = await enrolViaOtp(alice.phone, '760760', 'browser-recover');
      await service.changePassword(alice.id, alice.password, rotated);

      const challenged = await service.loginWithPassword(
        alice.email,
        rotated,
        'browser-recover',
        undefined,
        undefined,
        enrolled.credential,
      );
      expect(challenged.requiresOtp).toBe(true);

      const verified = await enrolViaOtp(alice.phone, '770770', 'browser-recover');
      expect(verified.credential).toBeTruthy();
      expect(verified.credential).not.toBe(enrolled.credential);
      expect((await service.validateDeviceCredential(verified.credential, alice.id)).status).toBe(
        'trusted',
      );
      // The value the change killed stays dead.
      expect((await service.validateDeviceCredential(enrolled.credential, alice.id)).status).toBe(
        'revoked',
      );
    });
  });
});

/** Bytes encoded in a base64url credential (proves 256 bits of entropy). */
function randomBytesLength(credential: string): number {
  return Buffer.from(credential, 'base64url').length;
}
