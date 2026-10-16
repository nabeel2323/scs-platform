/**
 * Database reset — drops all tables and custom types.
 *
 * Usage: pnpm --filter @scs/api db:reset
 * WARNING: This is destructive — all data is lost.
 * Requires: docker compose -f infra/docker-compose.dev.yml up -d
 */

import { execFileSync } from 'node:child_process';

const CONTAINER = 'scs-postgres';
const DB_USER = 'scs';
const DB_NAME = 'scs_platform';

function psql(query: string): string {
  return execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', query,
  ], { encoding: 'utf-8' }).trim();
}

async function main() {
  console.log(`\n🗑️  Smart Commerce — Database Reset`);
  console.log(`   Container: ${CONTAINER}`);
  console.log(`   Database: ${DB_NAME}`);
  console.log(`   ⚠️  ALL DATA WILL BE DROPPED\n`);

  // Drop all tables
  const tablesRaw = psql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const tables = tablesRaw.split('\n').filter(Boolean);

  if (tables.length > 0) {
    const dropStatements = tables
      .map((t) => `DROP TABLE IF EXISTS "${t}" CASCADE`)
      .join(';\n');
    psql(dropStatements);
    console.log(`   Dropped ${tables.length} table(s)`);
  } else {
    console.log('   No tables to drop');
  }

  // Drop custom types
  const typesRaw = psql(
    `SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e'`,
  );
  const types = typesRaw.split('\n').filter(Boolean);

  if (types.length > 0) {
    const dropTypes = types
      .map((t) => `DROP TYPE IF EXISTS "${t}" CASCADE`)
      .join(';\n');
    psql(dropTypes);
    console.log(`   Dropped ${types.length} custom type(s)`);
  }

  console.log(`\n✅ Database cleared. Run 'pnpm db:migrate && pnpm db:seed' to rebuild.\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
