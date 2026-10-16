import { Client } from 'pg';
import * as fs from 'node:fs';

async function main() {
  const connectionString = process.env['DATABASE_URL'];
  const sslCaFile = process.env['PGSSLROOTCERT'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  if (!sslCaFile) {
    throw new Error('PGSSLROOTCERT is required');
  }

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
      SELECT current_database(), current_user, version()
    `);

    console.log('\n=== TAIF Supabase Staging Reset ===');
    console.log(`Database: ${identity.rows[0].current_database}`);
    console.log(`User:     ${identity.rows[0].current_user}`);
    console.log(`Version:  ${identity.rows[0].version}`);

    console.log('\nWARNING: ALL TAIF APPLICATION DATA WILL BE DELETED.');
    console.log('Supabase-managed schemas and extensions will NOT be touched.\n');

    await client.query('BEGIN');

    // The application owns the public schema tables.
    // Supabase-managed objects are in separate schemas:
    // auth, storage, realtime, vault, extensions, partman, etc.
    const tables = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`Found ${tables.rows.length} public application table(s).`);

    // Remove TAIF's pg_partman configuration before dropping analytics tables.
    const partmanResult = await client.query(`
      DELETE FROM partman.part_config
      WHERE parent_table = 'public.analytics_events'
      RETURNING parent_table
    `);

    console.log(
      partmanResult.rowCount
        ? 'Removed public.analytics_events from pg_partman configuration.'
        : 'No analytics pg_partman configuration found.'
    );

    // Drop all application tables in public.
    // CASCADE handles foreign keys and analytics partitions.
    for (const row of tables.rows) {
      const table = row.tablename.replace(/"/g, '""');

      console.log(`  Dropping public.${row.tablename}`);

      await client.query(
        `DROP TABLE IF EXISTS public."${table}" CASCADE`
      );
    }

    // Sanity check: public schema must now contain no tables.
    const remaining = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    if (remaining.rows.length > 0) {
      throw new Error(
        `Reset incomplete: ${remaining.rows.length} public table(s) remain.`
      );
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('STAGING RESET COMPLETED SUCCESSFULLY');
    console.log('========================================');
    console.log('Public application tables: 0');
    console.log('pg_partman extension: preserved');
    console.log('PostGIS extension: preserved');
    console.log('Supabase schemas: preserved');
    console.log('\nNext step: run migrations 0001 -> 0020.\n');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure.
    }

    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nRESET FAILED:', err);
  process.exit(1);
});
