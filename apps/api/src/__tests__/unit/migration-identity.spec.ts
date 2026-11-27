import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { readMigrationDatabaseIdentity } from '../../../infra/drizzle/migration-identity';

// Identity evidence must come from the same client that the migration runner later uses.
describe('readMigrationDatabaseIdentity', () => {
  it('returns only non-secret role and database metadata from its client', async () => {
    const identity = {
      session_user: 'scs_migrator',
      current_user: 'scs_migrator',
      database_name: 'scs_staging',
      session_role_superuser: false,
      session_role_bypassrls: false,
      session_role_createrole: false,
      session_role_createdb: false,
      effective_role_superuser: false,
      effective_role_bypassrls: false,
      effective_role_createrole: false,
      effective_role_createdb: false,
      ssl: true,
    };
    const query = vi.fn().mockResolvedValue({ rows: [identity] });
    const client = { query } as unknown as Pick<PoolClient, 'query'>;

    await expect(readMigrationDatabaseIdentity(client)).resolves.toEqual(identity);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('session_user');
    expect(query.mock.calls[0]?.[0]).toContain('current_user');
    expect(query.mock.calls[0]?.[0]).not.toMatch(/DATABASE_URL|password|host|address/i);
  });

  it('returns null when PostgreSQL provides no role metadata', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as Pick<PoolClient, 'query'>;
    await expect(readMigrationDatabaseIdentity(client)).resolves.toBeNull();
  });

  it('propagates query failures for the runner to handle with a fixed warning', async () => {
    const query = vi.fn().mockRejectedValue(new Error('sensitive connection detail'));
    const client = { query } as unknown as Pick<PoolClient, 'query'>;
    await expect(readMigrationDatabaseIdentity(client)).rejects.toThrow(
      'sensitive connection detail',
    );
  });
});
