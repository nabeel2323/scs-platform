import { Client } from 'pg';
import * as fs from 'node:fs';

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
  'scs-postgres',
]);

function readResetAuthorization(connectionString: string): {
  environment: 'development' | 'test' | 'staging';
  expectedDatabase: string;
} {
  const environment = process.env['SCS_ENVIRONMENT']?.trim().toLowerCase();
  if (
    environment !== 'development' &&
    environment !== 'test' &&
    environment !== 'staging'
  ) {
    throw new Error('SCS_ENVIRONMENT must explicitly be development, test or staging; production is never allowed.');
  }

  const expectedDatabase = process.env['SCS_DB_RESET_DATABASE']?.trim();
  if (!expectedDatabase) {
    throw new Error('SCS_DB_RESET_DATABASE must name the exact database to reset.');
  }

  const confirmation = process.env['SCS_DB_RESET_CONFIRM'];
  if (confirmation !== 'DROP:' + environment + ':' + expectedDatabase) {
    throw new Error('SCS_DB_RESET_CONFIRM must exactly match DROP:<environment>:<database>.');
  }

  const databaseUrl = new URL(connectionString);
  if (environment !== 'staging' && !LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)) {
    throw new Error('Development/test reset is restricted to a local PostgreSQL host.');
  }

  if (
    environment === 'staging' &&
    process.env['SCS_STAGING_RESET_APPROVAL'] !==
      'I_APPROVE_STAGING_RESET:' + expectedDatabase
  ) {
    throw new Error('Staging reset requires the separate SCS_STAGING_RESET_APPROVAL confirmation.');
  }

  return {
    environment,
    expectedDatabase,
  };
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  const sslCaFile = process.env['PGSSLROOTCERT'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  if (!sslCaFile) {
    throw new Error('PGSSLROOTCERT is required');
  }

  const authorization = readResetAuthorization(connectionString);
  const ca = fs.readFileSync(sslCaFile, 'utf8');
  const client = new Client({
    connectionString,
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
  });

  await client.connect();

  try {
    const identity = await client.query(`
      SELECT current_database() AS current_database,
             current_user AS current_user,
             version() AS version
    `);
    const actualDatabase = identity.rows[0]?.current_database;
    if (actualDatabase !== authorization.expectedDatabase) {
      throw new Error('Connected database does not match SCS_DB_RESET_DATABASE; refusing destructive reset.');
    }

    console.log('\n=== TAIF Database Reset — explicit authorization required ===');
    console.log('Environment: ' + authorization.environment);
    console.log('Database: ' + actualDatabase);
    console.log('User: ' + identity.rows[0].current_user);
    console.log('Version: ' + identity.rows[0].version);
    console.log('\nWARNING: ALL PUBLIC APPLICATION TABLES WILL BE DELETED.');
    console.log('Supabase-managed schemas and extensions will NOT be touched.\n');

    await client.query('BEGIN');

    const tables = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('Found ' + tables.rows.length + ' public application table(s).');

    const partmanResult = await client.query(`
      DELETE FROM partman.part_config
      WHERE parent_table = 'public.analytics_events'
      RETURNING parent_table
    `);

    console.log(
      partmanResult.rowCount
        ? 'Removed public.analytics_events from pg_partman configuration.'
        : 'No analytics pg_partman configuration found.',
    );

    for (const row of tables.rows) {
      const table = String(row.tablename).replace(/"/g, '""');
      console.log('  Dropping public.' + row.tablename);
      await client.query('DROP TABLE IF EXISTS public."' + table + '" CASCADE');
    }

    const remaining = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    if (remaining.rows.length > 0) {
      throw new Error('Reset incomplete: ' + remaining.rows.length + ' public table(s) remain.');
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('DATABASE RESET COMPLETED SUCCESSFULLY');
    console.log('========================================');
    console.log('Public application tables: 0');
    console.log('pg_partman extension: preserved');
    console.log('PostGIS extension: preserved');
    console.log('Supabase schemas: preserved');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('\nRESET FAILED:', message);
  process.exitCode = 1;
});
