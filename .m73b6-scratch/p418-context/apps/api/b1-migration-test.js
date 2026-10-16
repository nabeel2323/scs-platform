const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

async function runMigrations(pool) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  await pool.query('CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const appliedSet = new Set((await pool.query('SELECT name FROM _migration_log')).rows.map(r => r.name));
  let applied = 0, skipped = 0, failed = 0;
  for (const file of files) {
    if (appliedSet.has(file)) { skipped++; continue; }
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
      console.log('  FAILED:', file, e.message.substring(0, 120));
    }
  }
  return { applied, skipped, failed, total: files.length };
}

async function main() {
  const adminPool = new Pool({ host: 'localhost', port: 15432, user: 'scs', password: 'scs_dev_2026', database: 'scs_platform' });

  // ── Test 1: Fresh database ───────────────────────────────────────────
  console.log('\n=== Test 1: Fresh database migration ===');
  await adminPool.query('DROP DATABASE IF EXISTS mig_fresh');
  await adminPool.query('CREATE DATABASE mig_fresh');
  const freshPool = new Pool({ host: 'localhost', port: 15432, user: 'scs', password: 'scs_dev_2026', database: 'mig_fresh' });
  const r1 = await runMigrations(freshPool);
  console.log(`  Applied: ${r1.applied}/${r1.total}, Skipped: ${r1.skipped}, Failed: ${r1.failed}`);

  const col = await freshPool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'carrier_credentials' AND column_name = 'webhook_token'`);
  console.log('  webhook_token column:', col.rows.length === 1 ? `EXISTS (${col.rows[0].data_type}, nullable=${col.rows[0].is_nullable})` : 'MISSING');

  const idx = await freshPool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'carrier_credentials' AND indexname LIKE '%webhook_token%'`);
  console.log('  webhook_token index:', idx.rows.length > 0 ? idx.rows.map(r => r.indexname).join(', ') : 'MISSING');
  console.log('  Result:', r1.failed === 0 && col.rows.length === 1 && idx.rows.length > 0 ? 'PASS' : 'FAIL');

  // ── Test 2: Idempotency — run migrations again ───────────────────────
  console.log('\n=== Test 2: Idempotency (run migrations again) ===');
  const r2 = await runMigrations(freshPool);
  console.log(`  Applied: ${r2.applied}, Skipped: ${r2.skipped}, Failed: ${r2.failed}`);
  console.log('  Result:', r2.skipped === r1.total && r2.failed === 0 ? 'PASS' : 'FAIL');

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
    catch (e) { await existPool.query('ROLLBACK'); }
  }

  // Insert a carrier_credentials row WITHOUT webhook_token
  const credId = randomUUID();
  const orgId = randomUUID();
  await existPool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Test Org', 'SA')`, [orgId]);
  await existPool.query(`INSERT INTO carrier_credentials (id, org_id, provider_key, environment, label, credentials_encrypted, is_active, created_at, updated_at) VALUES ($1, $2, 'test-provider', 'sandbox', 'Test Cred', 'encrypted_data', true, NOW(), NOW())`, [credId, orgId]);
  console.log('  Inserted pre-0044 credential row');

  // Now run migration 0044
  const m44sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0044_webhook_token.sql'), 'utf-8');
  await existPool.query('BEGIN');
  try { await existPool.query(m44sql); await existPool.query('COMMIT'); console.log('  Migration 0044 applied: SUCCESS'); }
  catch (e) { await existPool.query('ROLLBACK'); console.log('  Migration 0044 applied: FAILED -', e.message); }

  const tokens = await existPool.query(`SELECT id, webhook_token FROM carrier_credentials WHERE id = $1`, [credId]);
  const token = tokens.rows[0]?.webhook_token;
  console.log(`  Existing row token: ${token ? token.substring(0, 24) + '...' : 'NULL'}`);
  console.log('  Token format valid:', token?.startsWith('whk_') && token.length === 36 ? 'YES' : 'NO');
  console.log('  Result:', token?.startsWith('whk_') ? 'PASS' : 'FAIL');

  // ── Test 4: Stability — running again doesn't replace tokens ─────────
  console.log('\n=== Test 4: Stability (re-run preserves tokens) ===');
  const beforeToken = token;
  await existPool.query('BEGIN');
  try { await existPool.query(m44sql); await existPool.query('COMMIT'); console.log('  Re-run 0044: SUCCESS'); }
  catch (e) { await existPool.query('ROLLBACK'); console.log('  Re-run 0044: FAILED -', e.message); }
  const afterToken = (await existPool.query(`SELECT webhook_token FROM carrier_credentials WHERE id = $1`, [credId])).rows[0]?.webhook_token;
  console.log('  Token preserved:', beforeToken === afterToken ? 'YES' : 'NO — TOKEN CHANGED!');
  console.log('  Result:', beforeToken === afterToken ? 'PASS' : 'FAIL');

  // ── Test 5: Uniqueness — duplicate token is rejected ─────────────────
  console.log('\n=== Test 5: Uniqueness constraint ===');
  const dupCredId = randomUUID();
  const dupOrgId = randomUUID();
  await existPool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'RETAILER', 'Dup Org', 'SA')`, [dupOrgId]);
  try {
    await existPool.query(`INSERT INTO carrier_credentials (id, org_id, provider_key, environment, label, credentials_encrypted, webhook_token, is_active, created_at, updated_at) VALUES ($1, $2, 'test-provider-2', 'sandbox', 'Dup Cred', 'enc2', $3, true, NOW(), NOW())`, [dupCredId, dupOrgId, beforeToken]);
    console.log('  Duplicate token insert: SUCCEEDED (BAD)');
    console.log('  Result: FAIL');
  } catch (e) {
    console.log('  Duplicate token insert: REJECTED (GOOD) —', e.code);
    console.log('  Result:', e.code === '23505' ? 'PASS' : 'FAIL');
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
