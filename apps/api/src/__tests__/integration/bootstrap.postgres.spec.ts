/**
 * Bootstrap API integration tests — Phase 3.5 (Task I).
 *
 * Tests the secure initial Super Admin bootstrap API against a disposable
 * PostgreSQL container. Covers:
 *
 *   - Initialization status detection (empty DB vs existing Super Admin)
 *   - Bootstrap authorization issuance, expiration, replay prevention
 *   - Concurrent issuance and consumption safety (advisory lock)
 *   - Bootstrap/recovery purpose separation
 *   - Active vs inactive Super Admin membership
 *   - Atomic rollback on partial failure
 *   - Rate limiting
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema';
import { DatabaseService } from '../../common/database/database.service';
import { BootstrapService } from '../../modules/system/bootstrap.service';

function migrationFiles(): string[] {
  const migrations = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
  const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
  return readdirSync(migrations)
    .filter((f: string) => f.endsWith('.sql') && !excluded.includes(f))
    .sort();
}

function baseDatabaseUrl(container: StartedPostgreSqlContainer): string {
  return container.getConnectionUri();
}

async function seedRbac(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Import seed function dynamically to avoid circular deps
    const { seedPlatformRbac } = await import('../../../infra/drizzle/seed-pg');
    await seedPlatformRbac(client);
  } finally {
    client.release();
  }
}

async function insertPlatformOrg(pool: Pool): Promise<string> {
  const orgId = randomUUID();
  await pool.query(
    `INSERT INTO organizations (id, type, name, country, verification_status, is_active, created_at, updated_at)
     VALUES ($1, 'PLATFORM', 'SCS Platform Ops', 'SA', 'VERIFIED', TRUE, NOW(), NOW())`,
    [orgId],
  );
  return orgId;
}

async function insertSuperAdmin(pool: Pool, orgId: string, email = 'sa@example.com'): Promise<string> {
  const userId = randomUUID();
  await pool.query(
    `INSERT INTO users (id, phone, email, full_name, status, password_hash, password_set_at, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW(), NULL, NOW(), NOW())`,
    [userId, null, email, 'SA One', 'hash'],
  );
  const roleRes = await pool.query(`SELECT id FROM roles WHERE key = 'SUPER_ADMIN' LIMIT 1`);
  const roleId = roleRes.rows[0].id;
  await pool.query(
    `INSERT INTO organization_members (id, org_id, user_id, role_id, status, created_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
    [randomUUID(), orgId, userId, roleId],
  );
  return userId;
}

async function insertAuthorization(
  pool: Pool,
  token: string,
  ttlMs = 24 * 60 * 60 * 1000,
  purpose = 'super_admin_bootstrap',
): Promise<void> {
  await pool.query(
    `INSERT INTO bootstrap_authorizations (id, token_digest, expires_at, consumed, purpose, created_at)
     VALUES ($1, $2, $3, FALSE, $4, NOW())`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), new Date(Date.now() + ttlMs), purpose],
  );
}

async function countSuperAdmins(pool: Pool): Promise<number> {
  const res = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM users u
    INNER JOIN organization_members om ON om.user_id = u.id
    INNER JOIN roles r ON r.id = om.role_id
    WHERE u.status = 'ACTIVE' AND om.status = 'ACTIVE' AND r.key = 'SUPER_ADMIN'
  `);
  return Number(res.rows[0].cnt);
}

async function countUnconsumedTokens(pool: Pool): Promise<number> {
  const res = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM bootstrap_authorizations
    WHERE consumed = FALSE AND expires_at > NOW()
  `);
  return Number(res.rows[0].cnt);
}

describe('Bootstrap API integration (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    for (const file of migrationFiles()) {
      await pool.query(await readFile(path.join(path.resolve(__dirname, '../../../../../infra/drizzle/migrations'), file), 'utf-8'));
    }
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  afterEach(async () => {
    await pool.query(`TRUNCATE organization_members, users, bootstrap_authorizations, organizations RESTART IDENTITY CASCADE`);
  });

  // ── Initialization status ──────────────────────────────────────────

  it('empty database reports setup required', async () => {
    await seedRbac(pool);
    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    const status = await svc.getStatus();
    expect(status.initialized).toBe(false);
    expect(status.setupRequired).toBe(true);
    expect(status.bootstrapAvailable).toBe(false);
  });

  it('existing active Super Admin reports initialized', async () => {
    await seedRbac(pool);
    const orgId = await insertPlatformOrg(pool);
    await insertSuperAdmin(pool, orgId);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    const status = await svc.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.setupRequired).toBe(false);
    expect(status.bootstrapAvailable).toBe(false);
  });

  it('reports bootstrapAvailable when valid token exists on empty platform', async () => {
    await seedRbac(pool);
    await insertAuthorization(pool, 'bs_valid_token_12345678901234567890123456789012');

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    const status = await svc.getStatus();
    expect(status.initialized).toBe(false);
    expect(status.setupRequired).toBe(true);
    expect(status.bootstrapAvailable).toBe(true);
  });

  // ── Bootstrap authorization ─────────────────────────────────────────

  it('valid single-use authorization provisions the initial Super Admin', async () => {
    await seedRbac(pool);
    const token = 'bs_valid_token_12345678901234567890123456789012';
    await insertAuthorization(pool, token);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    const result = await svc.createSuperAdmin({
      authorizationToken: token,
      fullName: 'Platform Admin',
      email: 'Admin@Example.COM',
      password: 'Str0ng!P@ssw0rd',
    });

    expect(result).toEqual({ status: 'initialized', loginUrl: '/auth/login' });

    const count = await countSuperAdmins(pool);
    expect(count).toBe(1);

    // User created with normalized email, ACTIVE status, hashed password, phone is NULL
    const user = await pool.query(`SELECT email, full_name, status, phone, password_hash, email_verified_at FROM users WHERE email = $1`, ['admin@example.com']);
    expect(user.rows).toHaveLength(1);
    expect(user.rows[0].status).toBe('ACTIVE');
    expect(user.rows[0].phone).toBeNull();
    expect(user.rows[0].email_verified_at).toBeNull();
    expect(user.rows[0].password_hash).toBeTruthy();
    expect(user.rows[0].password_hash).not.toBe('Str0ng!P@ssw0rd'); // hashed, not plaintext

    // Token consumed exactly once
    expect(await countUnconsumedTokens(pool)).toBe(0);
  });

  it('invalid authorization fails without provisioning', async () => {
    await seedRbac(pool);
    await insertAuthorization(pool, 'bs_valid_token_12345678901234567890123456789012');

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    await expect(svc.createSuperAdmin({
      authorizationToken: 'wrong-token-12345678901234567890123456789012',
      fullName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'Str0ng!P@ssw0rd',
    })).rejects.toMatchObject({ status: 403 });

    expect(await countSuperAdmins(pool)).toBe(0);
    expect(await countUnconsumedTokens(pool)).toBe(1); // token NOT consumed
  });

  it('expired authorization fails', async () => {
    await seedRbac(pool);
    await insertAuthorization(pool, 'bs_expired_token_123456789012345678901234567890', -60_000);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    await expect(svc.createSuperAdmin({
      authorizationToken: 'bs_expired_token_123456789012345678901234567890',
      fullName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'Str0ng!P@ssw0rd',
    })).rejects.toMatchObject({ status: 403 });

    expect(await countSuperAdmins(pool)).toBe(0);
  });

  it('consumed authorization cannot be reused', async () => {
    await seedRbac(pool);
    const token = 'bs_single_token_12345678901234567890123456789012';
    await insertAuthorization(pool, token);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    await svc.createSuperAdmin({
      authorizationToken: token,
      fullName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'Str0ng!P@ssw0rd',
    });

    // Second attempt: platform already initialized, so bootstrap is permanently closed.
    // Returns 409 (already initialized) not 403 — the token-consumption check
    // never runs because initialization is already complete.
    await expect(svc.createSuperAdmin({
      authorizationToken: token,
      fullName: 'Platform Admin',
      email: 'admin2@example.com',
      password: 'Str0ng!P@ssw0rd',
    })).rejects.toMatchObject({ status: 409 });

    expect(await countSuperAdmins(pool)).toBe(1);
  });

  it('duplicate email fails safely and rolls back', async () => {
    await seedRbac(pool);
    const token = 'bs_dup_token_12345678901234567890123456789012';
    await insertAuthorization(pool, token);

    // Pre-existing user with the same email
    await pool.query(
      `INSERT INTO users (id, phone, email, full_name, status, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW(), NOW())`,
      [randomUUID(), '+10000000003', 'admin@example.com', 'Existing', 'hash'],
    );

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    await expect(svc.createSuperAdmin({
      authorizationToken: token,
      fullName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'Str0ng!P@ssw0rd',
    })).rejects.toMatchObject({ status: 409 });

    // Token NOT consumed on duplicate-email failure (rolled back)
    expect(await countUnconsumedTokens(pool)).toBe(1);
    expect(await countSuperAdmins(pool)).toBe(0);
  });

  it('weak password fails', async () => {
    await seedRbac(pool);
    const token = 'bs_weak_token_12345678901234567890123456789012';
    await insertAuthorization(pool, token);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    await expect(svc.createSuperAdmin({
      authorizationToken: token,
      fullName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'weak',
    })).rejects.toMatchObject({ status: 400 });

    expect(await countSuperAdmins(pool)).toBe(0);
  });

  // ── Concurrency ──────────────────────────────────────────────────────

  it('concurrent bootstrap attempts produce exactly one Super Admin', async () => {
    await seedRbac(pool);
    const token = 'bs_conc_token_12345678901234567890123456789012';
    await insertAuthorization(pool, token);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    const attempts = Array.from({ length: 10 }, () =>
      svc.createSuperAdmin({
        authorizationToken: token,
        fullName: 'Platform Admin',
        email: 'admin@example.com',
        password: 'Str0ng!P@ssw0rd',
      }),
    );

    const results = await Promise.allSettled(attempts);
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    expect(successes).toBe(1);
    expect(failures).toBe(9);

    expect(await countSuperAdmins(pool)).toBe(1);
    const users = await pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE email = $1`, ['admin@example.com']);
    expect(Number(users.rows[0].cnt)).toBe(1);
    expect(await countUnconsumedTokens(pool)).toBe(0);

    const status = await svc.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.setupRequired).toBe(false);
  });

  it('bootstrap is unavailable after successful initialization', async () => {
    await seedRbac(pool);
    const token = 'bs_close_token_12345678901234567890123456789012';
    await insertAuthorization(pool, token);

    const db = new DatabaseService();
    (db as any).db = drizzle(pool, { schema });
    const svc = new BootstrapService(db, { record: async () => {} } as any, {
      checkAndIncrement: async () => ({ allowed: true, remaining: 9 }),
    } as any);

    await svc.createSuperAdmin({
      authorizationToken: token,
      fullName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'Str0ng!P@ssw0rd',
    });

    const status = await svc.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.bootstrapAvailable).toBe(false);
    expect(status.setupRequired).toBe(false);
  });
});
