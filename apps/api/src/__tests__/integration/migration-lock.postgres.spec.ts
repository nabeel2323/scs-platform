import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import {
  acquireMigrationLock,
  MIGRATION_LOCK_KEY,
  MIGRATION_LOCK_NAMESPACE,
  releaseMigrationLock,
} from '../../../infra/drizzle/migration-lock';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readMigrationDatabaseIdentity } from '../../../infra/drizzle/migration-identity';

let container: StartedPostgreSqlContainer;
let pool: Pool;
let first: PoolClient;
let second: PoolClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri(), max: 3 });
  first = await pool.connect();
  second = await pool.connect();
}, 180_000);

afterAll(async () => {
  first?.release();
  second?.release();
  await pool?.end();
  await container?.stop();
});

describe('migration advisory lock', () => {
  it('reads the actual migration session identity without exposing connection details', async () => {
    const identity = await readMigrationDatabaseIdentity(first);
    expect(identity).not.toBeNull();
    expect(typeof identity?.session_user).toBe('string');
    expect(identity?.session_user.length).toBeGreaterThan(0);
    expect(identity?.current_user).toBe(identity?.session_user);
    expect(identity?.database_name.length).toBeGreaterThan(0);
    expect(typeof identity?.session_role_superuser).toBe('boolean');
    expect(typeof identity?.session_role_bypassrls).toBe('boolean');
    expect(typeof identity?.session_role_createrole).toBe('boolean');
    expect(typeof identity?.session_role_createdb).toBe('boolean');
    expect(typeof identity?.effective_role_superuser).toBe('boolean');
    expect(typeof identity?.effective_role_bypassrls).toBe('boolean');
    expect(typeof identity?.effective_role_createrole).toBe('boolean');
    expect(typeof identity?.effective_role_createdb).toBe('boolean');
    expect(identity?.ssl === null || typeof identity?.ssl === 'boolean').toBe(true);
    expect(JSON.stringify(identity)).not.toMatch(/postgresql:\/\/|password|host|address/i);
  });

  it('prevents independent runner sessions from entering concurrently', async () => {
    await acquireMigrationLock(first);

    const blocked = await second.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY],
    );
    expect(blocked.rows[0]?.acquired).toBe(false);

    await releaseMigrationLock(first);

    const available = await second.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY],
    );
    expect(available.rows[0]?.acquired).toBe(true);
    await second.query('SELECT pg_advisory_unlock($1, $2)', [
      MIGRATION_LOCK_NAMESPACE,
      MIGRATION_LOCK_KEY,
    ]);
  });

  it('releases the lock when the owning database session disconnects', async () => {
    const owner = await pool.connect();
    await acquireMigrationLock(owner);
    const backend = await owner.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    owner.release(true);

    // Wait until PostgreSQL has observed the disconnected backend before
    // asserting that its session-scoped advisory lock has been released.
    const firstRow = backend.rows[0];
    if (!firstRow) {
      throw new Error('Failed to retrieve backend PID');
    }
    const ownerPid = firstRow.pid;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const stillConnected = await second.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [
        ownerPid,
      ]);
      if (stillConnected.rowCount === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const stillConnected = await second.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [
      ownerPid,
    ]);
    expect(stillConnected.rowCount).toBe(0);

    const result = await second.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY],
    );
    expect(result.rows[0]?.acquired).toBe(true);
    await second.query('SELECT pg_advisory_unlock($1, $2)', [
      MIGRATION_LOCK_NAMESPACE,
      MIGRATION_LOCK_KEY,
    ]);
  });
});
