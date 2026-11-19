/**
 * Read-only database access audit.
 *
 * Runs through the same DATABASE_URL supplied to the API/migration runner and
 * reports the effective/login roles, role attributes, schema/table/sequence
 * privileges, default ACLs, RLS coverage and active connection identities.
 *
 * It never reads application rows, prints connection strings, or mutates schema.
 */
import * as fs from 'node:fs';
import { Pool } from 'pg';

type QueryResultRow = Record<string, unknown>;

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set. The value is never printed.');
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: 'scs-db-access-audit',
    ...(process.env['PGSSLROOTCERT'] && {
      ssl: {
        ca: fs.readFileSync(process.env['PGSSLROOTCERT'], 'utf8'),
        rejectUnauthorized: true,
      },
    }),
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const identity = await client.query<QueryResultRow>(`
      SELECT current_user AS effective_role,
             session_user AS login_role,
             current_database() AS database_name,
             current_setting('server_version') AS server_version,
             current_setting('application_name') AS application_name,
             current_setting('search_path') AS search_path,
             r.rolsuper AS is_superuser,
             r.rolbypassrls AS bypasses_rls,
             r.rolcreaterole AS can_create_roles,
             r.rolcreatedb AS can_create_databases,
             r.rolcanlogin AS can_login
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);

    const roleAttributes = await client.query<QueryResultRow>(`
      SELECT rolname AS role_name,
             rolsuper AS is_superuser,
             rolbypassrls AS bypasses_rls,
             rolcreaterole AS can_create_roles,
             rolcreatedb AS can_create_databases,
             rolcanlogin AS can_login,
             rolinherit AS inherits_role_privileges
      FROM pg_roles
      WHERE rolname IN (
        current_user,
        'authenticator',
        'anon',
        'authenticated',
        'service_role'
      )
      ORDER BY rolname
    `);

    const clientRoles = await client.query<QueryResultRow>(`
      WITH role_names AS (
        SELECT rolname AS role_name
        FROM pg_roles
        WHERE rolname IN ('authenticator', 'anon', 'authenticated', 'service_role')
        UNION
        SELECT current_user
      ), tables AS (
        SELECT c.oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      )
      SELECT r.role_name,
             count(t.oid)::int AS public_tables,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'SELECT'))::int AS select_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'INSERT'))::int AS insert_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'UPDATE'))::int AS update_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'DELETE'))::int AS delete_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'TRUNCATE'))::int AS truncate_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'REFERENCES'))::int AS references_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'TRIGGER'))::int AS trigger_count,
             count(*) FILTER (WHERE has_table_privilege(r.role_name, t.oid, 'MAINTAIN'))::int AS maintain_count
      FROM role_names r CROSS JOIN tables t
      GROUP BY r.role_name
      ORDER BY r.role_name
    `);

    const publicTableGrants = await client.query<QueryResultRow>(`
      SELECT x.privilege_type,
             count(DISTINCT c.oid)::int AS table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND x.grantee = 0
      GROUP BY x.privilege_type
      ORDER BY x.privilege_type
    `);

    const publicTableGrantsToApiRoles = await client.query<QueryResultRow>(`
      SELECT grantee.rolname AS grantee,
             x.privilege_type,
             count(DISTINCT c.oid)::int AS table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
      JOIN pg_roles grantee ON grantee.oid = x.grantee
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND grantee.rolname IN ('authenticator', 'anon', 'authenticated', 'service_role')
      GROUP BY grantee.rolname, x.privilege_type
      ORDER BY grantee.rolname, x.privilege_type
    `);

    const publicSequenceGrants = await client.query<QueryResultRow>(`
      SELECT x.privilege_type,
             count(DISTINCT c.oid)::int AS sequence_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) x
      WHERE n.nspname = 'public'
        AND c.relkind = 'S'
        AND x.grantee = 0
      GROUP BY x.privilege_type
      ORDER BY x.privilege_type
    `);

    const publicSequenceGrantsToApiRoles = await client.query<QueryResultRow>(`
      SELECT grantee.rolname AS grantee,
             x.privilege_type,
             count(DISTINCT c.oid)::int AS sequence_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) x
      JOIN pg_roles grantee ON grantee.oid = x.grantee
      WHERE n.nspname = 'public'
        AND c.relkind = 'S'
        AND grantee.rolname IN ('authenticator', 'anon', 'authenticated', 'service_role')
      GROUP BY grantee.rolname, x.privilege_type
      ORDER BY grantee.rolname, x.privilege_type
    `);

    const publicDefaultAclGrants = await client.query<QueryResultRow>(`
      SELECT d.defaclrole::regrole::text AS owner_role,
             COALESCE(n.nspname, '*') AS schema_name,
             d.defaclobjtype AS object_type,
             x.privilege_type,
             count(*)::int AS grant_count
      FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) x
      WHERE (n.nspname = 'public' OR d.defaclnamespace = 0)
        AND x.grantee = 0
      GROUP BY 1, 2, 3, 4
      ORDER BY 1, 2, 3, 4
    `);

    const extensionInventory = await client.query<QueryResultRow>(`
      SELECT e.extname,
             n.nspname AS extension_schema,
             owner.rolname AS extension_owner,
             e.extrelocatable,
             count(d.objid)::int AS extension_owned_objects
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      JOIN pg_roles owner ON owner.oid = e.extowner
      LEFT JOIN pg_depend d
        ON d.refclassid = 'pg_extension'::regclass
       AND d.refobjid = e.oid
       AND d.deptype = 'e'
      WHERE e.extname IN ('pg_trgm')
      GROUP BY e.extname, n.nspname, owner.rolname, e.extrelocatable
      ORDER BY e.extname
    `);

    const schemaPrivileges = await client.query<QueryResultRow>(`
      WITH role_names AS (
        SELECT rolname AS role_name FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
        UNION SELECT current_user
      )
      SELECT role_name,
             has_schema_privilege(role_name, 'public', 'USAGE') AS public_usage,
             has_schema_privilege(role_name, 'public', 'CREATE') AS public_create
      FROM role_names ORDER BY role_name
    `);

    const sequencePrivileges = await client.query<QueryResultRow>(`
      WITH role_names AS (
        SELECT rolname AS role_name FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
        UNION SELECT current_user
      ), sequences AS (
        SELECT c.oid FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'
      )
      SELECT r.role_name, count(s.oid)::int AS public_sequences,
             count(*) FILTER (WHERE has_sequence_privilege(r.role_name, s.oid, 'USAGE'))::int AS usage_count,
             count(*) FILTER (WHERE has_sequence_privilege(r.role_name, s.oid, 'SELECT'))::int AS select_count,
             count(*) FILTER (WHERE has_sequence_privilege(r.role_name, s.oid, 'UPDATE'))::int AS update_count
      FROM role_names r CROSS JOIN sequences s
      GROUP BY r.role_name ORDER BY r.role_name
    `);

    const rls = await client.query<QueryResultRow>(`
      SELECT count(*)::int AS public_tables,
             count(*) FILTER (WHERE c.relrowsecurity)::int AS rls_enabled,
             count(*) FILTER (WHERE c.relforcerowsecurity)::int AS rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    `);

    const defaultAcls = await client.query<QueryResultRow>(`
      SELECT d.defaclrole::regrole::text AS owner_role,
             n.nspname AS schema_name,
             d.defaclobjtype AS object_type,
             x.grantee::regrole::text AS grantee,
             x.privilege_type,
             count(*)::int AS grant_count
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) x
      WHERE n.nspname = 'public'
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY 1, 3, 4, 5
    `);

    const functions = await client.query<QueryResultRow>(`
      SELECT count(*)::int AS public_functions,
             count(*) FILTER (WHERE p.prosecdef)::int AS security_definer_count,
             count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))::int AS anon_executable,
             count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE'))::int AS authenticated_executable,
             count(*) FILTER (WHERE p.proconfig IS NULL)::int AS without_function_config,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1
               FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
               WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
             ))::int AS public_executable
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    `);

    const otherConnections = await client.query<QueryResultRow>(`
      SELECT usename AS login_role,
             application_name,
             state,
             count(*)::int AS connections
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
      GROUP BY usename, application_name, state
      ORDER BY usename, application_name, state
    `);

    const memberships = await client.query<QueryResultRow>(`
      WITH RECURSIVE membership_paths(
        root_role,
        granted_role_oid,
        depth,
        visited,
        admin_option,
        inherit_option,
        set_option
      ) AS (
        SELECT r.rolname,
               m.roleid,
               1,
               ARRAY[r.oid, m.roleid],
               m.admin_option,
               m.inherit_option,
               m.set_option
        FROM pg_roles r
        JOIN pg_auth_members m ON m.member = r.oid
        WHERE r.rolname IN (
          current_user,
          session_user,
          'authenticator',
          'anon',
          'authenticated',
          'service_role'
        )
        UNION ALL
        SELECT mp.root_role,
               m.roleid,
               mp.depth + 1,
               mp.visited || m.roleid,
               m.admin_option,
               m.inherit_option,
               m.set_option
        FROM membership_paths mp
        JOIN pg_auth_members m ON m.member = mp.granted_role_oid
        WHERE NOT m.roleid = ANY(mp.visited)
      )
      SELECT mp.root_role AS member_role,
             granted.rolname AS inherited_role,
             mp.depth AS membership_depth,
             mp.admin_option,
             mp.inherit_option,
             mp.set_option
      FROM membership_paths mp
      JOIN pg_roles granted ON granted.oid = mp.granted_role_oid
      ORDER BY member_role, membership_depth, inherited_role
    `);

    const report = {
      audit: 'SCS read-only database access audit',
      generatedAt: new Date().toISOString(),
      mutationPerformed: false,
      connectionStringPrinted: false,
      identity: identity.rows[0] ?? null,
      relevantRoleAttributes: roleAttributes.rows,
      effectivePrivileges: clientRoles.rows,
      publicSchemaPrivileges: schemaPrivileges.rows,
      publicTableGrantsToPublic: publicTableGrants.rows,
      publicTableGrantsToApiRoles: publicTableGrantsToApiRoles.rows,
      publicSequenceGrantsToPublic: publicSequenceGrants.rows,
      publicSequenceGrantsToApiRoles: publicSequenceGrantsToApiRoles.rows,
      publicDefaultAclGrants: publicDefaultAclGrants.rows,
      publicSequencePrivileges: sequencePrivileges.rows,
      rowLevelSecurity: rls.rows[0] ?? null,
      defaultPrivileges: defaultAcls.rows,
      publicFunctions: functions.rows[0] ?? null,
      extensionInventory: extensionInventory.rows,
      inheritedRoleMemberships: memberships.rows,
      otherDatabaseConnections: otherConnections.rows,
    };

    console.log(JSON.stringify(report, null, 2));
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original diagnostic error.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown database audit failure';
  console.error(`Read-only database access audit failed: ${message}`);
  process.exitCode = 1;
});
