import { Pool } from 'pg';
const p = new Pool({ connectionString: 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform' });
async function main() {
  console.log('Cleaning M6 test data...');
  // Clean in dependency order
  const tables = [
    'outbox_events', 'order_status_history', 'order_financial_breakdown',
    'order_items', 'orders', 'master_orders',
    'cart_items', 'carts',
    'stock_movements', 'inventory_items',
    'price_tiers', 'price_lists',
    'merchant_offers',
    'warehouses', 'stores',
  ];
  for (const t of tables) {
    const r = await p.query(`DELETE FROM ${t} WHERE TRUE`);
    if (r.rowCount) console.log(`  ${t}: deleted ${r.rowCount} rows`);
  }
  // Delete test org memberships but preserve admin's platform membership
  const adminUser = await p.query("SELECT id FROM users WHERE email = 'admin@scsp.dev'");
  const adminId = adminUser.rows[0]?.id;
  if (adminId) {
    const r = await p.query('DELETE FROM organization_members WHERE user_id != $1', [adminId]);
    if (r.rowCount) console.log(`  organization_members: deleted ${r.rowCount} rows (preserved admin)`);
  }
  // Delete test orgs (not the platform org)
  const orgs = await p.query("DELETE FROM organizations WHERE type != 'PLATFORM' RETURNING id, name");
  for (const o of orgs.rows) console.log(`  org: deleted ${o.id.substring(0,8)} ${o.name}`);
  // Delete test users (not admin)
  const users = await p.query("DELETE FROM users WHERE email LIKE '%@scsp.dev' AND email != 'admin@scsp.dev' RETURNING id, email");
  for (const u of users.rows) console.log(`  user: deleted ${u.id.substring(0,8)} ${u.email}`);
  // Reset products to DRAFT for clean re-publish
  await p.query("UPDATE products SET status = 'DRAFT', updated_at = NOW() WHERE status = 'ACTIVE'");
  console.log('  Products reset to DRAFT');
  console.log('Done.');
  await p.end();
}
main().catch(e => { console.error(e); process.exit(1); });
