import type { Client } from 'pg';
import { setOperatorActorContext } from '../infra/drizzle/operator-actor-context';

export interface StagingReadOnlyAuditIdentity {
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

/**
 * Purpose-specific fail-closed preflight for read-only staging diagnostics.
 * This deliberately uses a separate approval contract from mutating bootstrap tools.
 */
export async function assertStagingReadOnlyAuditTarget(
  client: Pick<Client, 'query'>,
  auditName: string,
): Promise<StagingReadOnlyAuditIdentity> {
  const normalizedName = auditName.trim();
  if (!normalizedName) throw new Error('Read-only audit name is required');

  if (process.env['SCS_ENVIRONMENT']?.trim().toLowerCase() !== 'staging') {
    throw new Error(normalizedName + ': SCS_ENVIRONMENT must explicitly be staging.');
  }

  const expectedDatabase = process.env['SCS_STAGING_READ_ONLY_AUDIT_DATABASE']?.trim();
  if (!expectedDatabase) {
    throw new Error(
      normalizedName + ': SCS_STAGING_READ_ONLY_AUDIT_DATABASE must name the exact target database.',
    );
  }
  if (
    process.env['SCS_STAGING_READ_ONLY_AUDIT_APPROVAL'] !==
    'I_APPROVE_STAGING_READ_ONLY_AUDIT:' + expectedDatabase
  ) {
    throw new Error(
      normalizedName +
        ': SCS_STAGING_READ_ONLY_AUDIT_APPROVAL must match the exact target database.',
    );
  }

  const result = await client.query<StagingReadOnlyAuditIdentity>(`
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
      normalizedName +
        ': connected database does not match SCS_STAGING_READ_ONLY_AUDIT_DATABASE; refusing audit.',
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
      normalizedName +
        ': read-only staging audit requires a non-privileged, non-owning role over verified TLS; ' +
        'unsafe connection: ' +
        unsafe.join(', ') +
        '. Refusing audit.',
    );
  }

  return identity;
}

/** Attribute the diagnostic to a transaction-local audit principal. */
export async function setStagingReadOnlyAuditActorContext(
  client: Pick<Client, 'query'>,
  auditName: string,
): Promise<void> {
  const normalizedName = auditName.trim();
  if (!normalizedName) throw new Error('Read-only audit name is required');
  await setOperatorActorContext(client, 'audit', 'audit-cli:' + normalizedName);
}
