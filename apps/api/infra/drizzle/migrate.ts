/**
 * Database migration runner
 *
 * Reads SQL migration files from infra/drizzle/migrations/ (repo root)
 * and applies them in order via `docker exec psql`.
 * Tracks applied migrations in _migration_log.
 *
 * Usage: pnpm --filter @scs/api db:migrate
 * Requires: docker compose -f infra/docker-compose.dev.yml up -d
 *
 * ── P13 Phase 4.1 correctness fix ───────────────────────────────────────────
 * This runner used to execute each file with `psql -f` and no `ON_ERROR_STOP`, and did
 * not wrap the file in a transaction. psql's default is to keep going after an error and
 * still exit 0 — so `execFileSync` reported success, and the file was written to
 * `_migration_log` as applied even when statements inside it had failed. The dev
 * database demonstrates it: `_migration_log` contains 0013_analytics.sql and
 * 0018_analytics_retention.sql, but `pg_partman` is not installed and `partman.part_config`
 * does not exist, while the `partman` schema and `analytics_events` table (created before
 * the failing statement) do. A release gate cannot trust that record.
 *
 * Now every migration runs as one transaction that also inserts its own `_migration_log`
 * row, with `ON_ERROR_STOP=1`. Either the file applies completely and is logged, or it is
 * rolled back and the runner exits non-zero. A transaction-level advisory lock and
 * in-transaction ledger recheck prevent duplicate application when this local runner
 * overlaps the API's development bootstrap or another migration process.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { DEV_MIGRATION_EXCLUSIONS } from './migration-config';

const CONTAINER = 'scs-postgres';
const DB_USER = 'scs';
const DB_NAME = 'scs_platform';

// Migrations live at repo root: infra/drizzle/migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle/migrations');

/**
 * The local Docker image does not include pg_partman. Keep these migrations pending
 * and report the omission loudly; do not write them to _migration_log. The DATABASE_URL
 * migration runner is the complete-target path and intentionally attempts all migrations,
 * so its database must provide pg_partman before it is used for a full release schema.
 */

function psql(query: string): string {
  return execFileSync(
    'docker',
    [
      'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME,
      // -v ON_ERROR_STOP=1 makes a failed statement exit non-zero, which is the only
      // way the caller can tell success from a partially applied script.
      '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query,
    ],
    { encoding: 'utf-8' },
  ).trim();
}

/**
 * Apply one migration file atomically.
 *
 * The `_migration_log` INSERT is inside the same transaction as the DDL, so it is
 * structurally impossible to record a migration that did not fully apply — the property
 * the old `psql -f` + separate INSERT could not guarantee.
 */
function psqlFile(sqlContent: string, file: string): boolean {
  const tmpFile = '/tmp/_migrate.sql';
  const script = `BEGIN;
SELECT pg_advisory_xact_lock(5456723, 1);
SELECT EXISTS (SELECT 1 FROM _migration_log WHERE name = '${file}') AS migration_already_applied \\gset
\\if :migration_already_applied
\\echo SCS_MIGRATION_ALREADY_APPLIED
COMMIT;
\\else
${sqlContent}
INSERT INTO _migration_log (name) VALUES ('${file}');
COMMIT;
\\endif
`;
  // Pipe SQL content into a file inside the container.
  execSync(
    `docker exec -i ${CONTAINER} bash -c "cat > ${tmpFile}"`,
    { input: script, encoding: 'utf-8' },
  );
  // ON_ERROR_STOP aborts and rolls back the transaction on the first error.
  const output = execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME,
    '-v', 'ON_ERROR_STOP=1', '-f', tmpFile,
  ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  return !output.includes('SCS_MIGRATION_ALREADY_APPLIED');
}

async function main() {
  console.log(`\n📦 Smart Commerce — Database Migration Runner`);
  console.log(`   Container: ${CONTAINER}`);
  console.log(`   Database: ${DB_NAME}`);
  console.log(`   Migrations dir: ${MIGRATIONS_DIR}\n`);

  // Verify container is running
  try {
    execFileSync('docker', [
      'exec', CONTAINER, 'pg_isready', '-U', DB_USER, '-d', DB_NAME,
    ], { stdio: 'pipe' });
  } catch {
    console.error(`❌ Container ${CONTAINER} is not running or Postgres is not ready.`);
    console.error(`   Run: docker compose -f infra/docker-compose.dev.yml up -d`);
    process.exit(1);
  }

  // Ensure migration tracking table exists
  psql(`BEGIN;
    SELECT pg_advisory_xact_lock(5456723, 1);
    CREATE TABLE IF NOT EXISTS _migration_log (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    COMMIT;
  `);

  // Get already-applied migrations
  const appliedRaw = psql('SELECT name FROM _migration_log ORDER BY name');
  const applied = new Set(appliedRaw.split('\n').filter(Boolean));
  const staleExcluded = [...DEV_MIGRATION_EXCLUSIONS.keys()].filter((file) => applied.has(file));
  if (staleExcluded.length > 0) {
    console.error(
      '❌ Local migration ledger contains pg_partman-dependent migrations that this image skips: ' +
        staleExcluded.join(', ') +
        '. The database may contain partial migration state; recreate the local database explicitly.',
    );
    process.exit(1);
  }

  // Read migration files from disk
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  const skipped = files.filter((f) => DEV_MIGRATION_EXCLUSIONS.has(f));
  for (const file of skipped) {
    // Loud, not silent: an unapplied migration is a real gap in the local schema.
    console.warn('   ⚠ SKIPPED ' + file + ' — ' + DEV_MIGRATION_EXCLUSIONS.get(file));
  }

  if (files.length === 0) {
    console.log('⚠️  No migration files found.');
    return;
  }

  let count = 0;
  let alreadyApplied = applied.size;
  for (const file of files) {
    if (DEV_MIGRATION_EXCLUSIONS.has(file)) continue;
    if (applied.has(file)) {
      console.log(`   ✓ ${file} (already applied)`);
      continue;
    }

    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`   ▶ ${file} ...`);

    try {
      // The log INSERT happens inside psqlFile's transaction, so a failure here means
      // nothing was committed and nothing was recorded.
      const appliedNow = psqlFile(content, file);
      if (appliedNow) {
        console.log(`   ✅ ${file} applied`);
        count++;
      } else {
        console.log(`   ✓ ${file} (applied by another migration runner)`);
        alreadyApplied++;
      }
    } catch (err: any) {
      console.error(`\n❌ Migration ${file} FAILED (rolled back, not logged):`);
      console.error(`   ${err.stderr || err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n🎉 Done — ${count} migration(s) applied, ${alreadyApplied} already up-to-date.`);
  console.log(`   Total migration files: ${files.length} (${skipped.length} skipped)`);
  if (skipped.length > 0) {
    const skipDetails = skipped
      .map((file) => file + ': ' + DEV_MIGRATION_EXCLUSIONS.get(file))
      .join('; ');
    console.warn(
      `   ⚠ ${skipped.length} migration(s) were NOT applied. The local schema is incomplete for\n` +
        `     analytics partitioning/retention: ${skipDetails}. Install pg_partman and use the\n` +
        `     DATABASE_URL migration runner against the intended target before relying on it.`,
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
