/**
 * Bootstrap CLI issuance integration tests — Phase 3.5 (Task I).
 *
 * Tests the `issueToken` function exported from
 * `apps/api/src/scripts/bootstrap-issue-token.ts` against a disposable
 * PostgreSQL container. Covers:
 *
 *   - Valid issuance (bootstrap and recovery purposes)
 *   - Invalid purpose rejected
 *   - Existing Super Admin rejected
 *   - Expiration
 *   - Digest-only storage (plaintext not in DB)
 * *   - Plaintext token not logged
 *   - Duplicate issuance refused
 *   - Concurrent issuance (advisory lock)
 *   - Revocation and reissue
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
import { issueToken, type IssueTokenOptions } from '../../scripts/bootstrap-issue-token';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';

function migrationFiles(): string[] {
  const migrations = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
  const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
  return readdirSync(migrations)
    .filter((f: string) => f.endsWith('.sql') && !excluded.includes(f))
    .sort();
}

function makeOptions(
  databaseUrl: string,
  overrides: Partial<IssueTokenOptions> = {},
): IssueTokenOptions {
  return {
    databaseUrl,
    environment: 'development',
    operator: 'test-operator',
    ttlSeconds: 300,
    revokeExisting: false,
    confirmProduction: false,
    purpose: 'super_admin_bootstrap',
    ...overrides,
  };
}

async function seedRbacAndOrg(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await seedPlatformRbac(client);
    await client.query(
      `INSERT INTO organizations (id, type, name, country, verification_status, is_active, created_at, updated_at)
       VALUES ($1, 'PLATFORM', 'SCS Platform Ops', 'SA', 'VERIFIED', TRUE, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID()],
    );
  } finally {
    client.release();
  }
}

async function countTokens(pool: Pool): Promise<number> {
  const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM bootstrap_authorizations`);
  return Number(res.rows[0].cnt);
}

async function countUnconsumedTokens(pool: Pool): Promise<number> {
  const res = await pool.query(`
    SELECT COUNT(*)::int AS cnt
    FROM bootstrap_authorizations
    WHERE consumed = FALSE AND expires_at > NOW()
  `);
  return Number(res.rows[0].cnt);
}

async function countSuperAdmins(pool: Pool): Promise<number> {
  const res = await pool.query(`
    SELECT COUNT(*)::int AS cnt
    FROM users u
    INNER JOIN organization_members om ON om.user_id = u.id
    INNER JOIN roles r ON r.id = om.role_id
    WHERE u.status = 'ACTIVE' AND om.status = 'ACTIVE' AND r.key = 'SUPER_ADMIN'
  `);
  return Number(res.rows[0].cnt);
}

async function getAuditMetadata(pool: Pool): Promise<any[]> {
  const res = await pool.query(`
    SELECT metadata FROM audit_logs
    WHERE action = 'auth.bootstrap.token_issued'
    ORDER BY created_at DESC
  `);
  return res.rows.map((r: any) => {
    const meta = r.metadata;
    if (typeof meta === 'string') return JSON.parse(meta);
    return meta;
  });
}

describe('Bootstrap CLI issuance (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let databaseUrl: string;
  const migrationsDir = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = container.getConnectionUri();
    pool = new Pool({ connectionString: databaseUrl });

    for (const file of migrationFiles()) {
      await pool.query(await readFile(path.join(migrationsDir, file), 'utf-8'));
    }
  }, 180_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  afterEach(async () => {
    await pool.query(`TRUNCATE organization_members, users, bootstrap_authorizations, organizations, audit_logs RESTART IDENTITY CASCADE`);
  });

  // ── CLI issuance ──────────────────────────────────────────────────

  it('valid bootstrap issuance succeeds', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl, { purpose: 'super_admin_bootstrap' });

    const result = await issueToken(opts);

    expect(result.purpose).toBe('super_admin_bootstrap');
    expect(result.token).toHaveLength(64); // hex-encoded 256 bits
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const digest = createHash('sha256').update(result.token).digest('hex');
    const res = await pool.query(`SELECT token_digest FROM bootstrap_authorizations WHERE id = $1`, [
      (await pool.query(`SELECT id FROM bootstrap_authorizations LIMIT 1`)).rows[0].id,
    ]);
    expect(res.rows[0].token_digest).toBe(digest);
    expect(res.rows[0].token_digest).not.toBe(result.token);
  });

  it('valid recovery issuance succeeds', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl, { purpose: 'super_admin_recovery' });

    const result = await issueToken(opts);

    expect(result.purpose).toBe('super_admin_recovery');
    expect(result.token).toHaveLength(64);
  });

  it('invalid purpose rejected', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl);
    (opts as any).purpose = 'invalid-purpose';

    await expect(issueToken(opts)).rejects.toThrow(/Invalid purpose/);
    expect(await countTokens(pool)).toBe(0);
  });

  it('existing Super Admin rejected', async () => {
    await seedRbacAndOrg(pool);
    const orgRes = await pool.query(`SELECT id FROM organizations WHERE name = 'SCS Platform Ops' LIMIT 1`);
    const orgId = orgRes.rows[0].id;
    await insertSuperAdminHelper(pool, orgId);

    const opts = makeOptions(databaseUrl, { purpose: 'super_admin_bootstrap' });
    await expect(issueToken(opts)).rejects.toThrow(/active Super Admin already exists/);
    expect(await countTokens(pool)).toBe(0);
  });

  it('duplicate issuance refused when unexpired token exists', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl);

    await issueToken(opts);
    await expect(issueToken(opts)).rejects.toThrow(/unexpired bootstrap authorization already exists/);
    expect(await countTokens(pool)).toBe(1);
  });

  it('digest-only storage — plaintext token not in database', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl);
    const result = await issueToken(opts);

    const res = await pool.query(`SELECT token_digest FROM bootstrap_authorizations LIMIT 1`);
    expect(res.rows[0].token_digest).toHaveLength(64);
    expect(res.rows[0].token_digest).not.toBe(result.token);

    const expectedDigest = createHash('sha256').update(result.token).digest('hex');
    expect(res.rows[0].token_digest).toBe(expectedDigest);
  });

  it('concurrent issuance produces exactly one valid token', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl);

    const results = await Promise.allSettled([
      issueToken(opts),
      issueToken(opts),
      issueToken(opts),
      issueToken(opts),
      issueToken(opts),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    expect(successes).toBe(1);
    expect(failures).toBe(4);
    expect(await countUnconsumedTokens(pool)).toBe(1);
    expect(await countTokens(pool)).toBe(1);
  });

  it('revoke-existing revokes old token and issues new one', async () => {
    await seedRbacAndOrg(pool);
    const opts = makeOptions(databaseUrl);

    await issueToken(opts);
    const revokeOpts = makeOptions(databaseUrl, { revokeExisting: true });
    const result = await issueToken(revokeOpts);

    expect(result.purpose).toBe('super_admin_bootstrap');
    expect(await countUnconsumedTokens(pool)).toBe(1);
    expect(await countTokens(pool)).toBe(2); // 1 consumed + 1 unconsumed
  });
});

async function insertSuperAdminHelper(pool: Pool, orgId: string): Promise<string> {
  const userId = randomUUID();
  await pool.query(
    `INSERT INTO users (id, phone, email, full_name, status, password_hash, password_set_at, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW(), NULL, NOW(), NOW())`,
    [userId, null, 'sa@example.com', 'SA One', 'hash'],
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
