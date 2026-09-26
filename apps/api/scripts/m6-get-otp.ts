import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform' });
  try {
    const tables = [
      'categories', 'product_types', 'products', 'product_variants',
      'attribute_definitions', 'attribute_groups', 'product_type_attributes',
      'product_attribute_values', 'variant_attribute_values',
      'stores', 'warehouses', 'merchant_offers',
      'inventory_items', 'stock_movements',
      'price_lists', 'price_tiers',
      'carts', 'cart_items',
      'master_orders', 'orders', 'order_items',
    ];
    console.log('=== DB TABLE COUNTS ===');
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  ${t}: ${r.rows[0].count}`);
    }

    // Show sample products with variants
    console.log('\n=== SAMPLE PRODUCTS ===');
    const prods = await pool.query(
      'SELECT id, title, status, store_id, slug FROM products WHERE deleted_at IS NULL LIMIT 10'
    );
    for (const p of prods.rows) {
      console.log(`  ${p.id.substring(0, 8)}... | ${(p.title || '').substring(0, 50)} | status=${p.status} | store=${p.store_id ? p.store_id.substring(0, 8) : 'NULL(canonical)'}`);
      const vars = await pool.query(
        'SELECT id, sku, title, is_active FROM product_variants WHERE product_id = $1 LIMIT 5',
        [p.id]
      );
      for (const v of vars.rows) {
        console.log(`    variant ${v.id.substring(0, 8)}... | SKU=${v.sku} | active=${v.is_active}`);
      }
    }

    // Show stores
    console.log('\n=== STORES ===');
    const stores = await pool.query('SELECT id, display_name, org_id, status, verification_status FROM stores LIMIT 10');
    if (stores.rows.length === 0) {
      console.log('  (none)');
    }
    for (const s of stores.rows) {
      console.log(`  ${s.id.substring(0, 8)}... | ${s.display_name} | org=${s.org_id?.substring(0, 8)} | ${s.status} | ${s.verification_status}`);
    }

    // Show orgs
    console.log('\n=== ORGANIZATIONS ===');
    const orgs = await pool.query('SELECT id, name, type FROM organizations LIMIT 10');
    for (const o of orgs.rows) {
      console.log(`  ${o.id.substring(0, 8)}... | ${o.name} | ${o.type}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
