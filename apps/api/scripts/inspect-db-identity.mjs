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
        inet_server_addr()::text AS server_address,
        inet_server_port() AS server_port
    `);

    const roleNames = [...new Set([
      identity.rows[0].session_user,
      identity.rows[0].current_user,
    ])];

    const roleAttributes = await pool.query(
      `
        SELECT
          rolname AS role_name,
          rolcanlogin AS can_login,
          rolsuper AS is_superuser,
          rolcreatedb AS can_create_database,
          rolcreaterole AS can_create_role,
          rolreplication AS can_replicate,
          rolbypassrls AS bypasses_rls,
          rolinherit AS inherits_privileges
        FROM pg_roles
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname
      `,
      [roleNames],
    );

    const memberships = await pool.query(
      `
        SELECT
          granted.rolname AS granted_role,
          member.rolname AS member_role,
          membership.admin_option,
          membership.inherit_option,
          membership.set_option
        FROM pg_auth_members membership
        JOIN pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE member.rolname = ANY($1::text[])
           OR granted.rolname = ANY($1::text[])
        ORDER BY member.rolname, granted.rolname
      `,
      [roleNames],
    );

    const relationPrivileges = await pool.query(
      `
        SELECT
          role_name,
          count(*)::int AS public_relations_checked,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'SELECT'))::int AS select_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'INSERT'))::int AS insert_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'UPDATE'))::int AS update_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'DELETE'))::int AS delete_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'TRUNCATE'))::int AS truncate_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'REFERENCES'))::int AS references_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'TRIGGER'))::int AS trigger_count,
          count(*) FILTER (WHERE has_table_privilege(role_name, relation.oid, 'MAINTAIN'))::int AS maintain_count
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
          count(*) FILTER (WHERE has_sequence_privilege(role_name, sequence.oid, 'USAGE'))::int AS usage_count,
          count(*) FILTER (WHERE has_sequence_privilege(role_name, sequence.oid, 'SELECT'))::int AS select_count,
          count(*) FILTER (WHERE has_sequence_privilege(role_name, sequence.oid, 'UPDATE'))::int AS update_count
        FROM unnest($1::text[]) AS roles(role_name)
        CROSS JOIN pg_class sequence
        JOIN pg_namespace namespace ON namespace.oid = sequence.relnamespace
        WHERE namespace.nspname = 'public'
          AND sequence.relkind = 'S'
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
