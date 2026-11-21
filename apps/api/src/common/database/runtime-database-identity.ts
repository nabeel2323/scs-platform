export interface RuntimeDatabaseIdentity {
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

export const RUNTIME_DATABASE_IDENTITY_SQL = `SELECT
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
WHERE session_role.rolname = session_user`;

export interface RuntimeIdentityLogger {
  log(message: string): void;
  warn(message: string): void;
}

/**
 * Logs non-secret metadata for the actual API pool connection.
 * Diagnostic failures are intentionally non-fatal and never echo database errors.
 */
export async function logRuntimeDatabaseIdentity(
  query: () => Promise<{ rows: RuntimeDatabaseIdentity[] }>,
  logger: RuntimeIdentityLogger,
): Promise<void> {
  try {
    const result = await query();
    const identity = result.rows[0];
    if (identity) {
      logger.log(`Runtime database identity: ${JSON.stringify(identity)}`);
    } else {
      logger.warn(
        'Runtime database identity query returned no role metadata; identity remains unverified.',
      );
    }
  } catch {
    logger.warn(
      'Runtime database identity diagnostics failed; identity remains unverified.',
    );
  }
}
