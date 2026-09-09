/**
 * CI database migration runner (DATABASE_URL-based).
 *
 * The local `migrate.ts` shells out to `docker exec scs-postgres psql ...`,
 * which assumes a named dev container. CI has no such container, so this runner
 * connects directly via DATABASE_URL to whatever Postgres the pipeline provides
 * (e.g. a GitHub Actions service container) and applies the same ordered SQL
 * migrations. Each file runs in its own transaction; any failure rolls back and
 * exits non-zero, so the pipeline's "migration dry-run" gate proves the full
 * migration set applies cleanly to a fresh database.
 *
 * Usage:
 *   pnpm --filter @scs/api db:migrate:ci              # apply pending migrations
 *   pnpm --filter @scs/api db:migrate:ci -- --dry-run # report only, no writes
 *
 * Requires: DATABASE_URL
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';

// Migrations live at repo root: infra/drizzle/migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle/migrations');

function isDryRun(): boolean {
  return process.argv.includes('--dry-run');
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function main() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('❌ DATABASE_URL must be set for the CI migration runner.');
    process.exit(1);
  }

  const dryRun = isDryRun();
  const files = listMigrationFiles();

  console.log(`\n📦 Smart Commerce — CI Migration Runner${dryRun ? ' (dry-run)' : ''}`);
  console.log(`   Migrations dir: ${MIGRATIONS_DIR}`);
  console.log(`   Files found: ${files.length}\n`);

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 } as any);
  const client = await pool.connect();

  try {
    // Prove connectivity early with a clear error.
    await client.query('SELECT 1');

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
      // Validate every migration file is present and non-empty; apply nothing.
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
      if (invalid > 0) {
        console.error(`❌ ${invalid} empty/invalid migration file(s).`);
        process.exit(1);
      }
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
        await client.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n❌ Migration ${file} FAILED: ${message}`);
        process.exit(1);
      }
    }

    console.log(
      `\n🎉 Done — ${count} migration(s) applied, ${applied.size} already up-to-date ` +
        `(total ${files.length}).\n`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
