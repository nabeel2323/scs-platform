/**
 * DATABASE_URL-based migration runner.
 * Each migration and its ledger insert run in one transaction. A session-level
 * advisory lock serializes the ledger check and complete migration sequence
 * across independent processes and service instances.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { acquireMigrationLock, releaseMigrationLock } from './migration-lock';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle/migrations');

function isDryRun(): boolean {
  return process.argv.includes('--dry-run');
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
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
