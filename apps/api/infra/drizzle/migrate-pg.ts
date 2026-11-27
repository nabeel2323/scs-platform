/**
 * DATABASE_URL-based migration runner.
 * Each migration and its ledger insert run in one transaction. A session-level
 * advisory lock serializes the ledger check and complete migration sequence
 * across independent processes and service instances.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import {
  acquireMigrationLock,
  releaseMigrationLock,
} from '../../src/common/database/migration-lock';
import { readMigrationDatabaseIdentity } from './migration-identity';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle/migrations');

function isDryRun(): boolean {
  return process.argv.includes('--dry-run');
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set for the migration runner.');
  }

  const dryRun = isDryRun();
  const files = listMigrationFiles();
  console.log(`\n📦 Smart Commerce — Migration Runner${dryRun ? ' (dry-run)' : ''}`);
  console.log(`   Migrations dir: ${MIGRATIONS_DIR}`);
  console.log(`   Files found: ${files.length}\n`);

  const sslCaFile = process.env['PGSSLROOTCERT'];
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ...(sslCaFile && {
      ssl: { ca: fs.readFileSync(sslCaFile, 'utf8'), rejectUnauthorized: true },
    }),
  });

  let client: PoolClient | undefined;
  let lockAcquired = false;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');

    // Capture the migration credential's actual identity independently of the API pool.
    // Diagnostics are non-fatal and never print connection details or SQL.
    try {
      const identity = await readMigrationDatabaseIdentity(client);
      if (identity) {
        console.log(`   Migration database identity: ${JSON.stringify(identity)}`);
      } else {
        console.warn(
          '   Migration database identity returned no role metadata; identity remains unverified.',
        );
      }
    } catch {
      console.warn(
        '   Migration database identity diagnostics failed; identity remains unverified.',
      );
    }

    // Hold this session lock for the entire ledger-check/apply sequence.
    // PostgreSQL releases it automatically if this process or connection dies.
    await acquireMigrationLock(client);
    lockAcquired = true;
    console.log('   🔒 Migration lock acquired');

    if (!dryRun) {
      await client.query(`CREATE TABLE IF NOT EXISTS _migration_log (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    }

    const appliedRes = dryRun
      ? { rows: [] as { name: string }[] }
      : await client.query('SELECT name FROM _migration_log ORDER BY name');
    const applied = new Set(appliedRes.rows.map((r) => r.name));

    // 0018 depends on 0013; reject an impossible ledger state before applying anything.
    if (applied.has('0018_analytics_retention.sql') && !applied.has('0013_analytics.sql')) {
      throw new Error('Migration ledger lists 0018_analytics_retention.sql without 0013_analytics.sql.');
    }

    // A legacy non-atomic runner could log analytics migrations after only part
    // of the file applied. Never trust those ledger rows if pg_partman/config is absent.
    if (applied.has('0013_analytics.sql')) {
      const partmanState = await client.query<{
        extension_installed: boolean;
        config_relation_exists: boolean;
      }>(`
        SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') AS extension_installed,
               to_regclass('partman.part_config') IS NOT NULL AS config_relation_exists
      `);
      const state = partmanState.rows[0];
      if (!state?.extension_installed || !state.config_relation_exists) {
        throw new Error(
          'Migration ledger lists 0013_analytics.sql but pg_partman or partman.part_config is missing. ' +
            'Refusing to trust a possibly partial migration; reconcile this target through the approved database recovery procedure.',
        );
      }

      const config = await client.query<{
        retention: string | null;
        retention_keep_table: boolean;
        retention_keep_index: boolean;
      }>(`
        SELECT retention, retention_keep_table, retention_keep_index
        FROM partman.part_config
        WHERE parent_table = 'public.analytics_events'
      `);
      const retentionConfig = config.rows[0];
      if (config.rowCount !== 1 || !retentionConfig) {
        throw new Error(
          'Migration ledger lists 0013_analytics.sql but the public.analytics_events pg_partman configuration is missing.',
        );
      }
      if (
        applied.has('0018_analytics_retention.sql') &&
        (retentionConfig.retention !== '12 months' ||
          retentionConfig.retention_keep_table !== false ||
          retentionConfig.retention_keep_index !== false)
      ) {
        throw new Error(
          'Migration ledger lists 0018_analytics_retention.sql but the analytics_events retention configuration does not match the migration.',
        );
      }
    }

    const pending = files.filter((f) => !applied.has(f));

    if (dryRun) {
      let invalid = 0;
      for (const file of files) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        const ok = sql.trim().length > 0;
        if (!ok) invalid++;
        console.log(`   ${ok ? '✓' : '✗'} ${file} (${sql.length} bytes)`);
      }
      console.log(
        `\n🔎 Dry-run complete — ${files.length} migration(s) validated, ` +
          `${pending.length} would apply, ${applied.size} already logged.`,
      );
      if (invalid > 0) throw new Error(`${invalid} empty/invalid migration file(s).`);
      return;
    }

    if (pending.length === 0) {
      console.log(`✅ Database up-to-date — all ${files.length} migration(s) already applied.\n`);
      return;
    }

    let count = 0;
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`   ▶ ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`   ✅ ${file} applied`);
        count++;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original error if the connection has already failed.
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file} FAILED: ${message}`, { cause: err });
      }
    }

    console.log(
      `\n🎉 Done — ${count} migration(s) applied, ${applied.size} already up-to-date ` +
        `(total ${files.length}).\n`,
    );
  } finally {
    if (client) {
      if (lockAcquired) {
        try {
          await releaseMigrationLock(client);
          console.log('   🔓 Migration lock released');
        } catch (err) {
          console.error(
            '⚠️ Could not explicitly release migration lock; closing DB session:',
            err instanceof Error ? err.message : String(err),
          );
        }
      }
      client.release();
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal migration error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
