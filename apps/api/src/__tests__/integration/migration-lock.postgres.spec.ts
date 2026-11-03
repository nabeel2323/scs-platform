import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import {
  acquireMigrationLock,
  MIGRATION_LOCK_KEY,
  MIGRATION_LOCK_NAMESPACE,
  releaseMigrationLock,
} from '../../infra/drizzle/migration-lock';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

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
    owner.release(true);

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
