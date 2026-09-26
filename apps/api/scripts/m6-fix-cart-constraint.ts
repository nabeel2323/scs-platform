import { Pool } from 'pg';
const p = new Pool({ connectionString: 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform' });
async function main() {
  // Check existing cart_items constraints
  const r = await p.query("SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'cart_items'::regclass");
  console.log('cart_items constraints:');
  for (const row of r.rows) console.log(`  ${row.conname} (${row.contype}): ${row.pg_get_constraintdef}`);

  // Check existing indexes
  const idx = await p.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'cart_items'");
  console.log('\ncart_items indexes:');
  for (const row of idx.rows) console.log(`  ${row.indexname}: ${row.indexdef}`);

  // Fix: drop old unique constraint on (cart_id, variant_id) and add new one with offer_id
  console.log('\n--- Fixing cart_items unique constraint ---');
  try {
    await p.query('ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_variant_id_key');
    console.log('  Dropped cart_items_cart_id_variant_id_key');
  } catch (e: any) {
    console.log('  Drop failed:', e.message);
  }

  // Add new unique constraint including offer_id (partial for non-null offer_id)
  // Two parts: (cart_id, variant_id, offer_id) for offer-scoped lines
  // and (cart_id, variant_id) WHERE offer_id IS NULL for legacy lines
  try {
    await p.query(`
      CREATE UNIQUE INDEX cart_items_cart_variant_offer_unique 
      ON cart_items (cart_id, variant_id, offer_id) 
      WHERE offer_id IS NOT NULL
    `);
    console.log('  Created partial unique index for offer-scoped lines');
  } catch (e: any) {
    console.log('  Index creation failed:', e.message);
  }

  try {
    await p.query(`
      CREATE UNIQUE INDEX cart_items_cart_variant_legacy_unique 
      ON cart_items (cart_id, variant_id) 
      WHERE offer_id IS NULL
    `);
    console.log('  Created partial unique index for legacy (no-offer) lines');
  } catch (e: any) {
    console.log('  Legacy index creation failed:', e.message);
  }

  // Verify
  const idx2 = await p.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'cart_items'");
  console.log('\nUpdated cart_items indexes:');
  for (const row of idx2.rows) console.log(`  ${row.indexname}: ${row.indexdef}`);

  await p.end();
}
main().catch(e => { console.error(e); process.exit(1); });
