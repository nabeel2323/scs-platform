import type { Client } from 'pg';
import { setOperatorActorContext } from '../infra/drizzle/operator-actor-context';

export interface StagingBootstrapIdentity {
  session_user: string;
  current_user: string;
  current_database: string;
  session_role_superuser: boolean;
  session_role_bypassrls: boolean;
  session_role_createrole: boolean;
  session_role_createdb: boolean;
  effective_role_superuser: boolean;
  effective_role_bypassrls: boolean;
  effective_role_createrole: boolean;
  effective_role_createdb: boolean;
  owns_public_tables: boolean;
  owns_public_schema: boolean;
  ssl: boolean | null;
}

/** Fail-closed target and connection-identity check for manual staging bootstrap scripts. */
export async function assertStagingBootstrapTarget(
  client: Pick<Client, 'query'>,
  scriptName: string,
): Promise<StagingBootstrapIdentity> {
  if (process.env['SCS_ENVIRONMENT']?.trim().toLowerCase() !== 'staging') {
    throw new Error(scriptName + ': SCS_ENVIRONMENT must explicitly be staging.');
  }
  if (process.env['SCS_STAGING_BOOTSTRAP_CONFIRM'] !== 'true') {
    throw new Error(
      scriptName + ': set SCS_STAGING_BOOTSTRAP_CONFIRM=true to confirm staging bootstrap.',
    );
  }

  const expectedDatabase = process.env['SCS_STAGING_BOOTSTRAP_DATABASE']?.trim();
  if (!expectedDatabase) {
    throw new Error(
      scriptName + ': SCS_STAGING_BOOTSTRAP_DATABASE must name the exact target database.',
    );
  }
  if (
    process.env['SCS_STAGING_BOOTSTRAP_APPROVAL'] !==
    'I_APPROVE_STAGING_BOOTSTRAP:' + expectedDatabase
  ) {
    throw new Error(
      scriptName + ': SCS_STAGING_BOOTSTRAP_APPROVAL must match the exact target database.',
    );
  }

  const result = await client.query<StagingBootstrapIdentity>(`
    SELECT
      session_user::text AS session_user,
      current_user::text AS current_user,
      current_database()::text AS current_database,
      session_role.rolsuper AS session_role_superuser,
      session_role.rolbypassrls AS session_role_bypassrls,
      session_role.rolcreaterole AS session_role_createrole,
      session_role.rolcreatedb AS session_role_createdb,
      effective_role.rolsuper AS effective_role_superuser,
      effective_role.rolbypassrls AS effective_role_bypassrls,
      effective_role.rolcreaterole AS effective_role_createrole,
      effective_role.rolcreatedb AS effective_role_createdb,
      EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND relation.relowner = effective_role.oid
      ) AS owns_public_tables,
      EXISTS (
        SELECT 1
        FROM pg_namespace AS namespace
        WHERE namespace.nspname = 'public'
          AND namespace.nspowner = effective_role.oid
      ) AS owns_public_schema,
      pg_stat_ssl.ssl AS ssl
    FROM pg_roles AS session_role
    JOIN pg_roles AS effective_role ON effective_role.rolname = current_user
    LEFT JOIN pg_stat_ssl ON pg_stat_ssl.pid = pg_backend_pid()
    WHERE session_role.rolname = session_user
  `);
  const identity = result.rows[0];
  if (!identity || identity.current_database !== expectedDatabase) {
    throw new Error(
      scriptName +
        ': connected database does not match SCS_STAGING_BOOTSTRAP_DATABASE; refusing writes.',
    );
  }

  const unsafe: string[] = [];
  if (identity.session_user !== identity.current_user) unsafe.push('session/effective role mismatch');
  if (identity.session_role_superuser || identity.effective_role_superuser) unsafe.push('superuser');
  if (identity.session_role_bypassrls || identity.effective_role_bypassrls) unsafe.push('BYPASSRLS');
  if (identity.session_role_createrole || identity.effective_role_createrole) unsafe.push('CREATEROLE');
  if (identity.session_role_createdb || identity.effective_role_createdb) unsafe.push('CREATEDB');
  if (identity.owns_public_tables || identity.owns_public_schema) unsafe.push('owns public tables/schema');
  if (identity.ssl !== true) unsafe.push('TLS disabled or unverified');

  if (unsafe.length > 0) {
    throw new Error(
      scriptName +
        ': staging bootstrap requires a non-privileged, non-owning role over verified TLS; ' +
        'unsafe connection: ' +
        unsafe.join(', ') +
        '. Refusing writes.',
    );
  }

  return identity;
}

/** Establish the dedicated bootstrap principal inside an already-open transaction. */
export async function setStagingBootstrapActorContext(
  client: Pick<Client, 'query'>,
  scriptName: string,
): Promise<void> {
  const normalizedScriptName = scriptName.trim();
  if (!normalizedScriptName) throw new Error('Staging bootstrap script name is required');
  await setOperatorActorContext(client, 'bootstrap', 'bootstrap-cli:' + normalizedScriptName);
}
