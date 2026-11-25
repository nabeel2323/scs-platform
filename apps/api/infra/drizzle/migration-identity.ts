import type { PoolClient } from 'pg';

type QueryClient = Pick<PoolClient, 'query'>;

export interface MigrationDatabaseIdentity {
  session_user: string;
  current_user: string;
  database_name: string;
  session_role_superuser: boolean;
  session_role_bypassrls: boolean;
  session_role_createrole: boolean;
  session_role_createdb: boolean;
  effective_role_superuser: boolean;
  effective_role_bypassrls: boolean;
  effective_role_createrole: boolean;
  effective_role_createdb: boolean;
  ssl: boolean | null;
}

/** Read non-secret identity metadata from the exact session that applies migrations. */
export async function readMigrationDatabaseIdentity(
  client: QueryClient,
): Promise<MigrationDatabaseIdentity | null> {
  const result = await client.query<MigrationDatabaseIdentity>(`
    SELECT
      session_user::text AS session_user,
      current_user::text AS current_user,
      current_database()::text AS database_name,
      session_role.rolsuper AS session_role_superuser,
      session_role.rolbypassrls AS session_role_bypassrls,
      session_role.rolcreaterole AS session_role_createrole,
      session_role.rolcreatedb AS session_role_createdb,
      effective_role.rolsuper AS effective_role_superuser,
      effective_role.rolbypassrls AS effective_role_bypassrls,
      effective_role.rolcreaterole AS effective_role_createrole,
      effective_role.rolcreatedb AS effective_role_createdb,
      pg_stat_ssl.ssl AS ssl
    FROM pg_roles AS session_role
    JOIN pg_roles AS effective_role ON effective_role.rolname = current_user
    LEFT JOIN pg_stat_ssl ON pg_stat_ssl.pid = pg_backend_pid()
    WHERE session_role.rolname = session_user
  `);
  return result.rows[0] ?? null;
}
