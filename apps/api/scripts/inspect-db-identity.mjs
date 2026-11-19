#!/usr/bin/env node
/**
 * Read-only database identity and effective-privilege diagnostic.
 *
 * Prints role/catalog metadata only. Never prints DATABASE_URL, passwords,
 * SSL material, or arbitrary environment values.
 *
 * Usage:
 *   DATABASE_URL=... PGSSLROOTCERT=/path/to/ca.pem node scripts/inspect-db-identity.mjs
 *
 * This script performs SELECT-only catalog inspection. It does not create,
 * alter, grant, revoke, truncate, or write application data.
 */
import * as fs from 'node:fs';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env['DATABASE_URL'];

if (!connectionString?.trim()) {
  console.error('DATABASE_URL is required; the value will not be displayed.');
  process.exit(2);
}

const sslCaFile = process.env['PGSSLROOTCERT'];
const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 5_000,
  ...(sslCaFile
    ? {
        ssl: {
          ca: fs.readFileSync(sslCaFile, 'utf8'),
          rejectUnauthorized: true,
        },
      }
    : {}),
});

async function main() {
  try {
    const identity = await pool.query(`
      SELECT
        session_user::text AS session_user,
        current_user::text AS current_user,
        current_database() AS database_name,
        current_setting('application_name', true) AS application_name,
        current_setting('server_version', true) AS server_version,
        current_setting('server_version_num', true)::int AS server_version_num,
        inet_server_addr()::text AS server_address,
        inet_server_port() AS server_port
    `);

    const roleNames = [...new Set([
      identity.rows[0].session_user,
      identity.rows[0].current_user,
    ])];

    const roleAttributes = await pool.query(
      `
        WITH RECURSIVE role_tree(role_oid) AS (
          SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[])
          UNION
          SELECT membership.roleid
          FROM pg_auth_members membership
          JOIN role_tree tree ON tree.role_oid = membership.member
        )
        SELECT
          role.rolname AS role_name,
          role.rolcanlogin AS can_login,
          role.rolsuper AS is_superuser,
          role.rolcreatedb AS can_create_database,
          role.rolcreaterole AS can_create_role,
          role.rolreplication AS can_replicate,
          role.rolbypassrls AS bypasses_rls,
          role.rolinherit AS inherits_privileges
        FROM pg_roles role
        WHERE role.oid IN (SELECT role_oid FROM role_tree)
        ORDER BY role.rolname
      `,
      [roleNames],
    );

    const memberships = await pool.query(
      `
        WITH RECURSIVE role_tree(role_oid) AS (
          SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[])
          UNION
          SELECT membership.roleid
          FROM pg_auth_members membership
          JOIN role_tree tree ON tree.role_oid = membership.member
        )
        SELECT
          granted.rolname AS granted_role,
          member.rolname AS member_role,
          membership.admin_option,
          membership.inherit_option,
          membership.set_option
        FROM pg_auth_members membership
        JOIN pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE member.oid IN (SELECT role_oid FROM role_tree)
           OR granted.oid IN (SELECT role_oid FROM role_tree)
        ORDER BY member.rolname, granted.rolname
      `,
      [roleNames],
    );

    const tablePrivileges = [
      ['SELECT', 'select_count'],
      ['INSERT', 'insert_count'],
      ['UPDATE', 'update_count'],
      ['DELETE', 'delete_count'],
      ['TRUNCATE', 'truncate_count'],
      ['REFERENCES', 'references_count'],
      ['TRIGGER', 'trigger_count'],
    ];
    // PostgreSQL 17 introduced the MAINTAIN table privilege.
    if (identity.rows[0].server_version_num >= 170000) {
      tablePrivileges.push(['MAINTAIN', 'maintain_count']);
    }
    const privilegeColumns = tablePrivileges
      .map(([privilege, alias]) =>
        `count(*) FILTER (WHERE has_table_privilege(role_name::name, relation.oid, '${privilege}'))::int AS ${alias}`,
      )
      .join(',\n          ');

    const relationPrivileges = await pool.query(
      `
        SELECT
          role_name,
          count(*)::int AS public_relations_checked,
          ${privilegeColumns}
        FROM unnest($1::text[]) AS roles(role_name)
        CROSS JOIN pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
        GROUP BY role_name
        ORDER BY role_name
      `,
      [roleNames],
    );

    const sequencePrivileges = await pool.query(
      `
        SELECT
          role_name,
          count(*)::int AS public_sequences_checked,
          count(*) FILTER (WHERE has_sequence_privilege(role_name::name, seq.oid, 'USAGE'))::int AS usage_count,
          count(*) FILTER (WHERE has_sequence_privilege(role_name::name, seq.oid, 'SELECT'))::int AS select_count,
          count(*) FILTER (WHERE has_sequence_privilege(role_name::name, seq.oid, 'UPDATE'))::int AS update_count
        FROM unnest($1::text[]) AS roles(role_name)
        CROSS JOIN pg_class seq
        JOIN pg_namespace namespace ON namespace.oid = seq.relnamespace
        WHERE namespace.nspname = 'public'
          AND seq.relkind = 'S'
        GROUP BY role_name
        ORDER BY role_name
      `,
      [roleNames],
    );

    console.log(JSON.stringify({
      diagnostic: 'read-only database identity and privilege report',
      identity: identity.rows[0],
      role_attributes: roleAttributes.rows,
      role_memberships: memberships.rows,
      public_relation_privileges: relationPrivileges.rows,
      public_sequence_privileges: sequencePrivileges.rows,
      note: 'No connection string, password, SSL material, or application data is emitted.',
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // Deliberately omit error properties that could contain connection details.
  console.error('Database identity diagnostic failed. Inspect database connectivity and permissions.');
  process.exitCode = 1;
});
