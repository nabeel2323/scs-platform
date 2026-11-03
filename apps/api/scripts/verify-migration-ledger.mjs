#!/usr/bin/env node
/**
 * Migration Ledger Verification Script
 *
 * Verifies that every migration file in the migrations directory has been
 * recorded in the _migration_log table. This ensures consistency between
 * the file system and the database state.
 *
 * Usage:
 *   node apps/api/scripts/verify-migration-ledger.mjs
 *
 * Environment:
 *   DATABASE_URL          — required, PostgreSQL connection string
 *   PGSSLROOTCERT         — optional, path to SSL CA certificate file
 *
 * Exit codes:
 *   0 — all migration files are recorded in _migration_log
 *   1 — one or more migration files are missing from _migration_log
 *   2 — configuration error (missing env vars, connection failure)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const migrationsDir = path.resolve(apiRoot, 'infra', 'drizzle', 'migrations');

async function main() {
  console.log('Migration Ledger Verification');
  console.log('==============================\n');

  // Validate environment
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('✗ DATABASE_URL environment variable is required');
    process.exit(2);
  }

  const sslCaFile = process.env['PGSSLROOTCERT'];

  // Create connection pool
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    ...(sslCaFile && {
      ssl: {
        ca: fs.readFileSync(sslCaFile, 'utf8'),
        rejectUnauthorized: true,
      },
    }),
  });

  try {
    // Verify connectivity
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('✓ Database connection established\n');
    } finally {
      client.release();
    }

    // Check _migration_log table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '_migration_log'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('✗ _migration_log table does not exist');
      console.error('  Run migrations first to create the ledger table.');
      process.exit(2);
    }

    console.log('✓ _migration_log table exists\n');

    // List migration files
    if (!fs.existsSync(migrationsDir)) {
      console.error(`✗ Migrations directory not found: ${migrationsDir}`);
      process.exit(2);
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration file(s):`);
    for (const file of migrationFiles) {
      console.log(`  - ${file}`);
    }
    console.log();

    // Query _migration_log
    const logResult = await pool.query(
      'SELECT name FROM _migration_log ORDER BY name',
    );

    const loggedMigrations = new Set(logResult.rows.map((r) => r.name));

    console.log(`Found ${loggedMigrations.size} migration(s) in _migration_log:`);
    for (const name of loggedMigrations) {
      console.log(`  - ${name}`);
    }
    console.log();

    // Compare file list vs log
    const missing = migrationFiles.filter((f) => !loggedMigrations.has(f));
    const extra = [...loggedMigrations].filter((f) => !migrationFiles.includes(f));

    if (missing.length > 0) {
      console.error('✗ VERIFICATION FAILED');
      console.error(`\n${missing.length} migration file(s) not recorded in _migration_log:`);
      for (const file of missing) {
        console.error(`  - ${file}`);
      }
      console.error('\nThis indicates an inconsistent state:');
      console.error('  - Migration files exist on disk but were not applied to the database');
      console.error('  - Possible causes:');
      console.error('    1. Migration runner failed mid-execution');
      console.error('    2. Migration files were added after the last release');
      console.error('    3. _migration_log table was manually modified');
      process.exit(1);
    }

    if (extra.length > 0) {
      console.warn('⚠ WARNING: Orphaned _migration_log entries detected');
      console.warn(`\n${extra.length} migration(s) in _migration_log have no corresponding file:`);
      for (const name of extra) {
        console.warn(`  - ${name}`);
      }
      console.warn('\nThis is usually harmless (deleted migration files), but indicates:');
      console.warn('  - Migration files were removed after being applied');
      console.warn('  - Consider cleaning up _migration_log entries for deleted files');
      console.warn();
    }

    console.log('✓ VERIFICATION PASSED');
    console.log(`\nAll ${migrationFiles.length} migration file(s) are recorded in _migration_log.`);
    console.log('Database schema is consistent with migration files.');
  } catch (err) {
    console.error('✗ Verification failed with error:', err.message);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

main();
