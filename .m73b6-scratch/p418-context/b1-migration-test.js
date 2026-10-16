const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.resolve(__dirname, 'infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

async function runMigrations(pool) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  await pool.query('CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  let applied = 0, failed = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      applied++;
    } catch (e) {
      await pool.query('ROLLBACK');
      failed++;
      console.log('  FAILED:', file, e.message.substring(0, 100));
    }
  }
  return { applied, failed, total: files.length };
}

async function main() {
  const adminPool = new Pool({ host: 'localhost', port: 15432, user: 'scs', password: 'scs_dev_2026', database: 'scs_platform' });

  // ── Test 1: Fresh database ───────────────────────────────────────────
  console.log('\n=== Test 1: Fresh database migration ===');
  await adminPool.query('DROP DATABASE IF EXISTS mig_fresh');
  await adminPool.query('CREATE DATABASE mig_fresh');
  const freshPool = new Pool({ host: 'localhost', port: 15432, user: 'scs', password: 'scs_dev_2026', database: 'mig_fresh' });
  const r1 = await runMigrations(freshPool);
  console.log(`  Applied: ${r1.applied}/${r1.total}, Failed: ${r1.failed}`);

  // Verify webhook_token column exists
  const col = await freshPool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'carrier_credentials' AND column_name = 'webhook_token'`);
  console.log('  webhook_token column:', col.rows.length === 1 ? `EXISTS (${col.rows[0].data_type}, nullable=${col.rows[0].is_nullable})` : 'MISSING');

  // Verify unique index
  const idx = await freshPool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'carrier_credentials' AND indexname LIKE '%webhook_token%'`);
  console.log('  webhook_token index:', idx.rows.length > 0 ? idx.rows.map(r => r.indexname).join(', ') : 'MISSING');

  // ── Test 2: Idempotency — run migrations again ───────────────────────
  console.log('\n=== Test 2: Idempotency (run migrations again) ===');
  const r2 = await runMigrations(freshPool);
  console.log(`  Applied: ${r2.applied}/${r2.total}, Failed: ${r2.failed}`);
  console.log('  Result:', r2.failed === 0 ? 'PASS — all migrations re-ran without error' : 'FAIL');

  // ── Test 3: Existing database — tokens generated for existing rows ───
  console.log('\n=== Test 3: Existing rows receive valid tokens ===');
  await adminPool.query('DROP DATABASE IF EXISTS mig_existing');
  await adminPool.query('CREATE DATABASE mig_existing');
  const existPool = new Pool({ host: 'localhost', port: 15432, user: 'scs', password: 'scs_dev_2026', database: 'mig_existing' });

  // Run all migrations EXCEPT 0044
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f) && f !== '0044_webhook_token.sql')
    .sort();
  await existPool.query('CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    try { await existPool.query('BEGIN'); await existPool.query(sql); await existPool.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]); await existPool.query('COMMIT'); }
    catch { await existPool.query('ROLLBACK'); }
  }

  // Insert a carrier_credentials row WITHOUT webhook_token (before migration 0044)
  // First check if the column exists yet
  const preCheck = await existPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'carrier_credentials' AND column_name = 'webhook_token'`);
  if (preCheck.rows.length === 0) {
    // Column doesn't exist yet — insert a row without it
    await existPool.query(`INSERT INTO carrier_credentials (id, org_id, provider_key, environment, label, credentials_encrypted, is_active, created_at, updated_at) VALUES ('test-cred-1', 'org-1', 'test-provider', 'sandbox', 'Test Cred', 'encrypted_data', true, NOW(), NOW())`);
    console.log('  Inserted pre-0044 credential row');
  } else {
    console.log('  WARNING: webhook_token column already exists, cannot test pre-existing row scenario');
  }

  // Now run migration 0044
  const m44sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0044_webhook_token.sql'), 'utf-8');
  await existPool.query('BEGIN');
  try { await existPool.query(m44sql); await existPool.query('COMMIT'); console.log('  Migration 0044 applied: SUCCESS'); }
  catch (e) { await existPool.query('ROLLBACK'); console.log('  Migration 0044 applied: FAILED -', e.message); }

  // Verify the existing row received a token
  const tokens = await existPool.query(`SELECT id, webhook_token FROM carrier_credentials WHERE id = 'test-cred-1'`);
  if (tokens.rows.length > 0) {
    const token = tokens.rows[0].webhook_token;
    console.log(`  Existing row token: ${token ? token.substring(0, 20) + '...' : 'NULL'}`);
    console.log('  Token starts with whk_:', token?.startsWith('whk_') ? 'YES' : 'NO');
  }

  // ── Test 4: Stability — running again doesn't replace tokens ─────────
  console.log('\n=== Test 4: Stability (re-run preserves tokens) ===');
  const beforeToken = (await existPool.query(`SELECT webhook_token FROM carrier_credentials WHERE id = 'test-cred-1'`)).rows[0]?.webhook_token;
  // Re-run migration 0044
  await existPool.query('BEGIN');
  try { await existPool.query(m44sql); await existPool.query('COMMIT'); console.log('  Re-run 0044: SUCCESS'); }
  catch (e) { await existPool.query('ROLLBACK'); console.log('  Re-run 0044: FAILED -', e.message); }
  const afterToken = (await existPool.query(`SELECT webhook_token FROM carrier_credentials WHERE id = 'test-cred-1'`)).rows[0]?.webhook_token;
  console.log('  Token preserved:', beforeToken === afterToken ? 'YES' : 'NO — TOKEN CHANGED!');

  // ── Test 5: Uniqueness — duplicate token is rejected ─────────────────
  console.log('\n=== Test 5: Uniqueness constraint ===');
  if (beforeToken) {
    try {
      await existPool.query(`INSERT INTO carrier_credentials (id, org_id, provider_key, environment, label, credentials_encrypted, webhook_token, is_active, created_at, updated_at) VALUES ('test-cred-dup', 'org-2', 'test-provider-2', 'sandbox', 'Dup Cred', 'enc2', $1, true, NOW(), NOW())`, [beforeToken]);
      console.log('  Duplicate token insert: SUCCEEDED (BAD — should have been rejected!)');
    } catch (e) {
      console.log('  Duplicate token insert: REJECTED (GOOD) —', e.code || e.message.substring(0, 80));
    }
  }

  // Cleanup
  await freshPool.end();
  await existPool.end();
  await adminPool.query('DROP DATABASE IF EXISTS mig_fresh');
  await adminPool.query('DROP DATABASE IF EXISTS mig_existing');
  await adminPool.end();
  console.log('\n=== Migration 0044 verification complete ===');
}

main().catch(e => { console.error(e); process.exit(1); });
