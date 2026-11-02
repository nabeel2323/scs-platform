/**
 * S1.35 Phase 1 — Migration 0064 email identity tests (PostgreSQL).
 *
 * Validates the migration's schema changes and data integrity:
 *  - Migration applies cleanly on fresh DB
 *  - users.phone becomes nullable
 *  - CHECK constraint: at least one identifier (phone or email)
 *  - Case-insensitive unique index on email
 *  - account_link_log table created with correct schema
 *  - Feature flag row inserted
 *  - Pre-migration duplicate email detection (preflight)
 *  - Forward-fix policy: never restores NOT NULL on phone
 *  - Row count preservation
 *  - User ID preservation
 *  - Org membership integrity after migration
 *  - Session validity after migration
 *
 * S1.37 audit additions: the migration is asserted against the definitions it
 * actually produces (trim-aware CHECK and lower(btrim) index), blank identifiers
 * are proven rejected, a rerun is proven to be a no-op, an aborted preflight is
 * proven to roll the whole file back, and a silently failed migration can no
 * longer pass as green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
const MIGRATION_0064 = '0064_email_identity.sql';
const MIGRATION_0065 = '0065_hmac_identifier_hash.sql';

/** Run all migrations except 0064 (to set up pre-migration state). */
async function runMigrationsUpTo(pool: Pool, excludeFile?: string) {
  // 0065 depends on account_link_log created by 0064, so exclude it too when 0064 is excluded.
  const alsoExclude = excludeFile === MIGRATION_0064 ? MIGRATION_0065 : undefined;
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f) && f !== excludeFile && f !== alsoExclude)
    .sort();
  await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const failed: string[] = [];
  for (const file of files) {
    const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(sqlContent);
      await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      failed.push(`${file}: ${(e as Error).message}`);
    }
  }
  // Without this, a migration that failed and rolled back still left the suite
  // asserting against a half-built schema and reporting success.
  if (failed.length) throw new Error(`Migrations did not apply cleanly:\n  ${failed.join('\n  ')}`);
}

/** Run a single migration file. */
async function runSingleMigration(pool: Pool, filename: string) {
  const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
  await pool.query('BEGIN');
  try { await pool.query(sqlContent); await pool.query('COMMIT'); }
  catch (e) { await pool.query('ROLLBACK'); throw e; }
}

/**
 * Applies one file exactly as both real runners do: BEGIN -> <file> ->
 * INSERT INTO _migration_log -> COMMIT. The log row is what makes a blind rerun
 * of an already-recorded migration fail, and therefore what any rerun claim in
 * the runbook has to account for (S1.37 section 3).
 */
async function runThroughRunnerContract(pool: Pool, filename: string) {
  const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
  await pool.query('BEGIN');
  try {
    await pool.query(sqlContent);
    await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [filename]);
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

/** Read back the identifier-integrity objects 0064 creates. */
async function readIdentityDefinitions(pool: Pool) {
  const con = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'users_at_least_one_identifier'`,
  );
  const idx = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_users_email_lower'`,
  );
  const phone = await pool.query(
    `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone'`,
  );
  return {
    check: con.rows[0]?.def ?? null,
    index: idx.rows[0]?.indexdef ?? null,
    phoneNullable: phone.rows[0]?.is_nullable ?? null,
  };
}

describe('Migration 0064 — Email Identity', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  // ── 1. Fresh DB Migration ─────────────────────────────────────────

  describe('Migration on fresh DB', () => {
    let freshPool: Pool;
    let freshContainer: StartedPostgreSqlContainer;

    beforeAll(async () => {
      freshContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
      freshPool = new Pool({ connectionString: freshContainer.getConnectionUri() });
      await runMigrationsUpTo(freshPool);
    }, 120_000);

    afterAll(async () => {
      await freshPool?.end();
      await freshContainer?.stop();
    });

    it('applies all migrations including 0064 without error', async () => {
      const applied = await freshPool.query(`SELECT name FROM _migration_log ORDER BY name`);
      const names = applied.rows.map((r: any) => r.name);
      expect(names).toContain('0064_email_identity.sql');
    });

    it('users.phone column is nullable', async () => {
      const col = await freshPool.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'phone'
      `);
      expect(col.rows[0].is_nullable).toBe('YES');
    });

    it('CHECK constraint users_at_least_one_identifier exists', async () => {
      const constraint = await freshPool.query(`
        SELECT conname FROM pg_constraint WHERE conname = 'users_at_least_one_identifier'
      `);
      expect(constraint.rows).toHaveLength(1);
    });

    it('unique index idx_users_email_lower exists', async () => {
      const idx = await freshPool.query(`
        SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_email_lower'
      `);
      expect(idx.rows).toHaveLength(1);
    });

    it('unique index normalizes case AND surrounding whitespace (S1.37-F-08)', async () => {
      const idx = await freshPool.query(`
        SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_users_email_lower'
      `);
      const def: string = idx.rows[0].indexdef;
      expect(def).toMatch(/lower\(btrim\(/);
      expect(def).toMatch(/CREATE UNIQUE INDEX/);
    });

    it('CHECK predicate rejects a blank email as an identifier (S1.37-F-07)', async () => {
      const con = await freshPool.query(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'users_at_least_one_identifier'
      `);
      expect(con.rows[0].def).toMatch(/btrim/);
    });

    it('migration file carries no embedded transaction control (runner contract)', async () => {
      // Both runners wrap each file in BEGIN/<file>/INSERT INTO _migration_log/
      // COMMIT. An embedded COMMIT closes that outer transaction early, so the
      // DDL lands even if a later step fails, and an embedded BEGIN makes the
      // runner's own COMMIT a no-op. S1.37-F-02.
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_0064), 'utf-8');
      const statements = raw.replace(/--[^\n]*/g, '').toUpperCase();
      expect(/BEGIN\s*;/.test(statements)).toBe(false);
      expect(/COMMIT\s*;/.test(statements)).toBe(false);
      expect(/ROLLBACK\s*;/.test(statements)).toBe(false);
      expect(statements).not.toContain('_MIGRATION_LOG');
    });

    it('every migration is recorded as applied', async () => {
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
        .sort();
      const log = await freshPool.query(`SELECT name FROM _migration_log`);
      expect(log.rows.map((r: any) => r.name).sort()).toEqual(files);
    });

    it('account_link_log table exists with correct columns', async () => {
      const cols = await freshPool.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'account_link_log' ORDER BY ordinal_position
      `);
      const colNames = cols.rows.map((r: any) => r.column_name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('user_id');
      expect(colNames).toContain('action');
      expect(colNames).toContain('identifier_type');
      expect(colNames).toContain('identifier_hash');
      expect(colNames).toContain('performed_by');
      expect(colNames).toContain('created_at');
    });

    it('feature flag row inserted', async () => {
      const flag = await freshPool.query(
        `SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled'`,
      );
      expect(flag.rows).toHaveLength(1);
      // Default is disabled
      expect(flag.rows[0].enabled).toBe(false);
    });
  });

  // ── 2. Pre-existing Data Migration ────────────────────────────────

  describe('Migration with existing data', () => {
    let dataPool: Pool;
    let dataContainer: StartedPostgreSqlContainer;
    const userPhoneOnly = randomUUID();
    const userDual = randomUUID();
    const userEmailNull = randomUUID();

    beforeAll(async () => {
      dataContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
      dataPool = new Pool({ connectionString: dataContainer.getConnectionUri() });

      // Run migrations up to 0063 (before email identity)
      await runMigrationsUpTo(dataPool, '0064_email_identity.sql');

      // Seed RBAC
      const { seedPlatformRbac } = await import('../../../infra/drizzle/seed-pg');
      const client = await dataPool.connect();
      try { await seedPlatformRbac(client); } finally { client.release(); }

      // Create pre-migration users
      // Phone-only user (email is null or empty)
      await dataPool.query(
        `INSERT INTO users (id, full_name, phone, locale, status) VALUES ($1, 'Phone Only', '+966500000001', 'en', 'ACTIVE')`,
        [userPhoneOnly],
      );

      // Dual-identifier user
      await dataPool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'Dual User', '+966500000002', 'dual@test.com', 'en', 'ACTIVE')`,
        [userDual],
      );

      // User with email set to NULL explicitly (phone-only)
      await dataPool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'Null Email', '+966500000003', NULL, 'en', 'ACTIVE')`,
        [userEmailNull],
      );

      // Record pre-migration row count
      const beforeCount = await dataPool.query(`SELECT COUNT(*) FROM users`);
      expect(parseInt(beforeCount.rows[0].count)).toBe(3);

      // Now run migration 0064
      await runSingleMigration(dataPool, '0064_email_identity.sql');
    }, 120_000);

    afterAll(async () => {
      await dataPool?.end();
      await dataContainer?.stop();
    });

    it('preserves row count', async () => {
      const afterCount = await dataPool.query(`SELECT COUNT(*) FROM users`);
      expect(parseInt(afterCount.rows[0].count)).toBe(3);
    });

    it('preserves user IDs', async () => {
      const ids = await dataPool.query(`SELECT id FROM users ORDER BY id`);
      const idSet = new Set(ids.rows.map((r: any) => r.id));
      expect(idSet.has(userPhoneOnly)).toBe(true);
      expect(idSet.has(userDual)).toBe(true);
      expect(idSet.has(userEmailNull)).toBe(true);
    });

    it('phone-only user retains phone and null email', async () => {
      const row = await dataPool.query(`SELECT phone, email FROM users WHERE id = $1`, [userPhoneOnly]);
      expect(row.rows[0].phone).toBe('+966500000001');
      expect(row.rows[0].email).toBeNull();
    });

    it('dual-identifier user retains both', async () => {
      const row = await dataPool.query(`SELECT phone, email FROM users WHERE id = $1`, [userDual]);
      expect(row.rows[0].phone).toBe('+966500000002');
      expect(row.rows[0].email).toBe('dual@test.com');
    });

    it('CHECK constraint allows phone-only users', async () => {
      // Phone-only user should still be valid
      const row = await dataPool.query(`SELECT phone, email FROM users WHERE id = $1`, [userPhoneOnly]);
      expect(row.rows[0].phone).not.toBeNull();
    });

    it('CHECK constraint rejects setting both to null', async () => {
      await expect(
        dataPool.query(`UPDATE users SET phone = NULL, email = NULL WHERE id = $1`, [userPhoneOnly]),
      ).rejects.toThrow(/violates check constraint/i);
    });

    it('case-insensitive unique index prevents duplicate emails', async () => {
      await expect(
        dataPool.query(
          `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Dup', 'DUAL@TEST.COM', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/duplicate|unique/i);
    });

    it('unique index rejects a whitespace-variant duplicate (S1.37-F-08)', async () => {
      // normalizeEmail() trims before comparing, so ' dual@test.com' is the same
      // identity as 'dual@test.com' as far as the application is concerned.
      await expect(
        dataPool.query(
          `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Pad Dup', ' dual@test.com', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/duplicate|unique/i);
    });

    it('CHECK rejects an empty-string email as the only identifier (S1.37-F-07)', async () => {
      await expect(
        dataPool.query(
          `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Blank Email', '', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/check constraint/i);
    });

    it('CHECK rejects a whitespace-only email as the only identifier (S1.37-F-07)', async () => {
      await expect(
        dataPool.query(
          `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Blank Email', '   ', 'en', 'ACTIVE')`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/check constraint/i);
    });

    it('CHECK rejects clearing both identifiers in one UPDATE', async () => {
      await expect(
        dataPool.query(`UPDATE users SET phone = NULL, email = '  ' WHERE id = $1`, [userDual]),
      ).rejects.toThrow(/check constraint/i);
    });

    it('CHECK still accepts a legitimate email-only account', async () => {
      const id = randomUUID();
      await dataPool.query(
        `INSERT INTO users (id, full_name, email, locale, status) VALUES ($1, 'Email Only', 'email.only@test.com', 'en', 'ACTIVE')`,
        [id],
      );
      const row = await dataPool.query(`SELECT email FROM users WHERE id = $1`, [id]);
      expect(row.rows[0].email).toBe('email.only@test.com');
      await dataPool.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    it('org membership integrity preserved', async () => {
      // Verify organization_members table still references valid users
      const members = await dataPool.query(`
        SELECT om.user_id FROM organization_members om
        JOIN users u ON u.id = om.user_id
      `);
      // All member user_ids should exist in users table
      for (const member of members.rows) {
        const user = await dataPool.query(`SELECT id FROM users WHERE id = $1`, [member.user_id]);
        expect(user.rows).toHaveLength(1);
      }
    });

    it('sessions remain valid after migration', async () => {
      // Create a session for a user
      const sessionId = randomUUID();
      await dataPool.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, expires_at)
         VALUES ($1, $2, $3, 'web', $4)`,
        [sessionId, userDual, 'a'.repeat(64), new Date(Date.now() + 86400000)],
      );

      // Session should be queryable
      const session = await dataPool.query(
        `SELECT s.id, s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
        [sessionId],
      );
      expect(session.rows).toHaveLength(1);
      expect(session.rows[0].user_id).toBe(userDual);

      await dataPool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    });
  });

  // ── 3. Preflight: Duplicate Email Detection ──────────────────────

  describe('Preflight duplicate detection', () => {
    let dupPool: Pool;
    let dupContainer: StartedPostgreSqlContainer;

    beforeAll(async () => {
      dupContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
      dupPool = new Pool({ connectionString: dupContainer.getConnectionUri() });
      await runMigrationsUpTo(dupPool, '0064_email_identity.sql');
    }, 120_000);

    afterAll(async () => {
      await dupPool?.end();
      await dupContainer?.stop();
    });

    it('migration fails when case-insensitive duplicate emails exist', async () => {
      // Insert duplicate emails (different case)
      await dupPool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'A', '+966500000010', 'dup@test.com', 'en', 'ACTIVE')`,
        [randomUUID()],
      );
      await dupPool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'B', '+966500000011', 'DUP@TEST.COM', 'en', 'ACTIVE')`,
        [randomUUID()],
      );

      // Migration should fail due to preflight check
      await expect(runSingleMigration(dupPool, '0064_email_identity.sql'))
        .rejects.toThrow(/PREFLIGHT FAILED|duplicate email/i);
    });

    it('preflight matches the applications normalization, not just case (S1.37-F-08)', async () => {
      // normalizeEmail() trims as well as lowercases. Two rows that differ only
      // by padding are one identity to the application, so the preflight must
      // use LOWER(BTRIM(email)) or the unique index would fail mid-migration.
      await dupPool.query(`DELETE FROM users WHERE email IS NOT NULL`);
      await dupPool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'C', '+966500000012', 'wsdup@test.com', 'en', 'ACTIVE')`,
        [randomUUID()],
      );
      await dupPool.query(
        `INSERT INTO users (id, full_name, phone, email, locale, status) VALUES ($1, 'D', '+966500000013', ' wsdup@test.com', 'en', 'ACTIVE')`,
        [randomUUID()],
      );

      await expect(runSingleMigration(dupPool, '0064_email_identity.sql'))
        .rejects.toThrow(/PREFLIGHT FAILED|duplicate email/i);
    });

    it('an aborted preflight leaves no partial schema behind (S1.37-F-02)', async () => {
      const rowsBefore = await dupPool.query(`SELECT id, phone, email FROM users ORDER BY id`);

      await expect(runSingleMigration(dupPool, '0064_email_identity.sql'))
        .rejects.toThrow();

      // The preflight RAISEs before any DDL, so nothing below it may persist.
      const defs = await readIdentityDefinitions(dupPool);
      expect(defs.phoneNullable).toBe('NO');
      expect(defs.check).toBeNull();
      expect(defs.index).toBeNull();

      const rowsAfter = await dupPool.query(`SELECT id, phone, email FROM users ORDER BY id`);
      expect(rowsAfter.rows).toEqual(rowsBefore.rows);
    });
  });

  // ── 4. Forward-Fix Policy ─────────────────────────────────────────

  describe('Forward-fix policy', () => {
    it('migration never restores NOT NULL on phone', async () => {
      // This is verified by the fresh DB tests above (phone is nullable).
      // Additionally, verify the migration SQL does not contain a blind
      // "SET NOT NULL" on phone.
      const migrationSql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '0064_email_identity.sql'), 'utf-8',
      );
      // Should have DROP NOT NULL but never SET NOT NULL on phone
      expect(migrationSql).toContain('DROP NOT NULL');
      // Ensure there's no SET NOT NULL on the phone column
      const setNotNull = /ALTER\s+TABLE\s+users\s+ALTER\s+COLUMN\s+phone\s+SET\s+NOT\s+NULL/i;
      expect(setNotNull.test(migrationSql)).toBe(false);
    });
  });

  // ── 5. Idempotency ────────────────────────────────────────────────

  describe('Idempotency', () => {
    let idemPool: Pool;
    let idemContainer: StartedPostgreSqlContainer;

    beforeAll(async () => {
      idemContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
      idemPool = new Pool({ connectionString: idemContainer.getConnectionUri() });
      await runMigrationsUpTo(idemPool);
    }, 120_000);

    afterAll(async () => {
      await idemPool?.end();
      await idemContainer?.stop();
    });

    it('running migration 0064 twice does not error', async () => {
      // Already applied in beforeAll; running again should be safe
      // The migration uses IF NOT EXISTS and ON CONFLICT DO NOTHING
      await expect(runSingleMigration(idemPool, '0064_email_identity.sql'))
        .resolves.not.toThrow();
    });

    it('a rerun changes no schema object', async () => {
      const before = await readIdentityDefinitions(idemPool);
      await runSingleMigration(idemPool, MIGRATION_0064);
      const after = await readIdentityDefinitions(idemPool);
      expect(after).toEqual(before);

      const dupeConstraint = await idemPool.query(
        `SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conname = 'users_at_least_one_identifier'`,
      );
      expect(dupeConstraint.rows[0].n).toBe(1);
      const dupeIndex = await idemPool.query(
        `SELECT COUNT(*)::int AS n FROM pg_indexes WHERE indexname = 'idx_users_email_lower'`,
      );
      expect(dupeIndex.rows[0].n).toBe(1);
    });

    it('a rerun preserves every existing row untouched', async () => {
      const before = await idemPool.query(`SELECT id, phone, email, status FROM users ORDER BY id`);
      await runSingleMigration(idemPool, MIGRATION_0064);
      const after = await idemPool.query(`SELECT id, phone, email, status FROM users ORDER BY id`);
      expect(after.rows).toEqual(before.rows);
    });

    it('a blind rerun through the real runner contract fails and rolls back', async () => {
      // Both runners record the filename in _migration_log inside the same
      // transaction, and that table keys on the filename. Re-applying an
      // already-recorded file therefore fails on the log insert, which is why
      // the runbook must describe the correct resume path rather than claiming
      // the file is safe to rerun blindly.
      await expect(runThroughRunnerContract(idemPool, MIGRATION_0064))
        .rejects.toThrow(/_migration_log|duplicate key/i);

      const defs = await readIdentityDefinitions(idemPool);
      expect(defs.phoneNullable).toBe('YES');
      expect(defs.check).toMatch(/btrim/);
      expect(defs.index).toMatch(/lower\(btrim\(/);
    });
  });
});
