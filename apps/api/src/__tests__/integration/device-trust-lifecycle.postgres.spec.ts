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
 *   lifecycle  — logout ends the trust it created, refresh does not.
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

  const rowByDigest = async (credential: string) =>
    (
      await pool.query(`SELECT * FROM device_credentials WHERE credential_hash = $1`, [
        digest(credential),
      ])
    ).rows[0];

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
      const issued = await rowByDigest(credential);
      await setExpiry(credential, { expiresAt: new Date(Date.now() - 1_000) });

      await service.validateDeviceCredential(credential, alice.id);
      const slid = await rowByDigest(credential);
      expect(slid.expires_at.getTime()).toBeGreaterThan(issued.expires_at.getTime());
      expect(slid.expires_at.getTime()).toBeLessThanOrEqual(slid.hard_expires_at.getTime());
      expect(slid.last_used_at.getTime()).toBeGreaterThanOrEqual(issued.last_used_at.getTime());

      // Clamp: with ten minutes left on the absolute ceiling, one more use must
      // land on the ceiling rather than a full sliding window beyond it.
      const hard = new Date(Date.now() + 600_000);
      await setExpiry(credential, { expiresAt: new Date(Date.now() - 1_000), hardExpiresAt: hard });
      await service.validateDeviceCredential(credential, alice.id);
      const clamped = await rowByDigest(credential);
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
});

/** Bytes encoded in a base64url credential (proves 256 bits of entropy). */
function randomBytesLength(credential: string): number {
  return Buffer.from(credential, 'base64url').length;
}
