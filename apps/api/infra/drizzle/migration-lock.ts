import type { PoolClient } from 'pg';

/**
 * Stable two-key PostgreSQL advisory-lock identity for this repository.
 * Session-scoped locking serializes the migration ledger check and apply phase.
 */
export const MIGRATION_LOCK_NAMESPACE = 0x534353; // ASCII "SCS"
export const MIGRATION_LOCK_KEY = 1;

type QueryClient = Pick<PoolClient, 'query'>;

export async function acquireMigrationLock(client: QueryClient): Promise<void> {
  await client.query('SELECT pg_advisory_lock($1, $2)', [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_KEY,
  ]);
}

export async function releaseMigrationLock(client: QueryClient): Promise<void> {
  const result = await client.query<{ pg_advisory_unlock: boolean }>(
    'SELECT pg_advisory_unlock($1, $2)',
    [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY],
  );
  if (result.rows[0]?.pg_advisory_unlock !== true) {
    throw new Error('Migration advisory lock was not held by this database session.');
  }
}
