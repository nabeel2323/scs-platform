/**
 * Clean round-trip test: export → re-import → verify idempotency
 */
import { Pool } from 'pg';

const API = 'http://localhost:3000/v1';

async function main() {
  const loginData = await (await fetch(`${API}/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@scsp.dev', password: 'Admin@2026!',
      deviceId: 'uat-device-001', deviceInfo: { platform: 'Windows', userAgent: 'UAT/1.0' },
    }),
  })).json();
  const T = loginData.accessToken;
  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${T}` };

  console.log('Auth OK');

  // Pre-export counts
  const pool = new Pool({ connectionString: 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform' });
  const before = await pool.query(`
    SELECT 'categories' AS tbl, COUNT(*) FROM categories WHERE store_id IS NULL
    UNION ALL SELECT 'product_types', COUNT(*) FROM product_types
    UNION ALL SELECT 'attribute_definitions', COUNT(*) FROM attribute_definitions
    UNION ALL SELECT 'attribute_options', COUNT(*) FROM attribute_options
    UNION ALL SELECT 'products', COUNT(*) FROM products WHERE store_id IS NULL
    UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
    UNION ALL SELECT 'brands', COUNT(*) FROM brands
    UNION ALL SELECT 'product_type_attributes', COUNT(*) FROM product_type_attributes
    UNION ALL SELECT 'product_sources', COUNT(*) FROM product_sources
    UNION ALL SELECT 'product_attribute_values', COUNT(*) FROM product_attribute_values
    UNION ALL SELECT 'variant_attribute_values', COUNT(*) FROM variant_attribute_values
    ORDER BY tbl
  `);
  console.log('\nPre-export counts:');
  for (const r of before.rows) console.log(`  ${r.tbl}: ${r.count}`);

  // Export
  const expRes = await fetch(`${API}/admin/catalog-imports/export`, {
    method: 'POST', headers: jsonHeaders,
  });
  const buf = Buffer.from(await expRes.arrayBuffer());
  console.log(`\nExport: ${buf.length} bytes, isXlsx: ${buf[0] === 0x50}`);

  // Re-import upload
  const bnd = '----B' + Date.now();
  const parts = [
    Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="file"; filename="re.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${bnd}--\r\n`),
  ];
  const body = Buffer.concat(parts);

  const upRes = await (await fetch(`${API}/admin/catalog-imports/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${bnd}`, 'Authorization': `Bearer ${T}` },
    body,
  })).json();
  console.log(`Re-import upload: ${upRes.id}`);

  // Preview
  const preview = await (await fetch(`${API}/admin/catalog-imports/${upRes.id}/preview`, {
    headers: jsonHeaders,
  })).json();
  console.log(`Preview: ${JSON.stringify(preview.plan?.summary ?? preview).slice(0, 500)}`);

  // Execute
  const execRes = await (await fetch(`${API}/admin/catalog-imports/${upRes.id}/execute`, {
    method: 'POST', headers: jsonHeaders, body: '{}',
  })).json();
  console.log(`\nRe-import exec:`, JSON.stringify(execRes));

  // Post-reimport counts
  const after = await pool.query(`
    SELECT 'categories' AS tbl, COUNT(*) FROM categories WHERE store_id IS NULL
    UNION ALL SELECT 'product_types', COUNT(*) FROM product_types
    UNION ALL SELECT 'attribute_definitions', COUNT(*) FROM attribute_definitions
    UNION ALL SELECT 'attribute_options', COUNT(*) FROM attribute_options
    UNION ALL SELECT 'products', COUNT(*) FROM products WHERE store_id IS NULL
    UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
    UNION ALL SELECT 'brands', COUNT(*) FROM brands
    UNION ALL SELECT 'product_type_attributes', COUNT(*) FROM product_type_attributes
    UNION ALL SELECT 'product_sources', COUNT(*) FROM product_sources
    UNION ALL SELECT 'product_attribute_values', COUNT(*) FROM product_attribute_values
    UNION ALL SELECT 'variant_attribute_values', COUNT(*) FROM variant_attribute_values
    ORDER BY tbl
  `);
  console.log('\nPost-reimport counts:');
  for (const r of after.rows) console.log(`  ${r.tbl}: ${r.count}`);

  // Compare
  console.log('\nComparison:');
  let allMatch = true;
  for (let i = 0; i < before.rows.length; i++) {
    const b = before.rows[i];
    const a = after.rows[i];
    const match = b.count === a.count;
    if (!match) allMatch = false;
    console.log(`  ${b.tbl}: before=${b.count} after=${a.count} ${match ? 'OK' : 'DIFF'}`);
  }

  // Third import for idempotency
  const upRes2 = await (await fetch(`${API}/admin/catalog-imports/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${bnd}`, 'Authorization': `Bearer ${T}` },
    body,
  })).json();
  const execRes2 = await (await fetch(`${API}/admin/catalog-imports/${upRes2.id}/execute`, {
    method: 'POST', headers: jsonHeaders, body: '{}',
  })).json();
  console.log(`\nThird import:`, JSON.stringify(execRes2));

  console.log(`\nRound-trip verdict: created=${execRes.created} (expected 0 for true idempotency)`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
