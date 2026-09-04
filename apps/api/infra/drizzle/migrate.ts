/**
 * Database migration runner
 *
 * Reads SQL migration files from infra/drizzle/migrations/ (repo root)
 * and applies them in order via `docker exec psql`.
 * Tracks applied migrations in _migration_log.
 *
 * Usage: pnpm --filter @scs/api db:migrate
 * Requires: docker compose -f infra/docker-compose.dev.yml up -d
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const CONTAINER = 'scs-postgres';
const DB_USER = 'scs';
const DB_NAME = 'scs_platform';

// Migrations live at repo root: infra/drizzle/migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle/migrations');

function psql(query: string): string {
  return execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', query,
  ], { encoding: 'utf-8' }).trim();
}

function psqlFile(sqlContent: string): void {
  const tmpFile = '/tmp/_migrate.sql';
  // Pipe SQL content into a file inside the container
  execSync(
    `docker exec -i ${CONTAINER} bash -c "cat > ${tmpFile}"`,
    { input: sqlContent, encoding: 'utf-8' },
  );
  // Execute the SQL file
  execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-f', tmpFile,
  ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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
  psql(`CREATE TABLE IF NOT EXISTS _migration_log (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // Get already-applied migrations
  const appliedRaw = psql('SELECT name FROM _migration_log ORDER BY name');
  const applied = new Set(appliedRaw.split('\n').filter(Boolean));

  // Read migration files from disk
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('⚠️  No migration files found.');
    return;
  }

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`   ✓ ${file} (already applied)`);
      continue;
    }

    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`   ▶ ${file} ...`);

    try {
      psqlFile(content);
      psql(`INSERT INTO _migration_log (name) VALUES ('${file}')`);
      console.log(`   ✅ ${file} applied`);
      count++;
    } catch (err: any) {
      console.error(`\n❌ Migration ${file} FAILED:`);
      console.error(`   ${err.stderr || err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n🎉 Done — ${count} migration(s) applied, ${applied.size} already up-to-date.`);
  console.log(`   Total migrations: ${files.length}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
