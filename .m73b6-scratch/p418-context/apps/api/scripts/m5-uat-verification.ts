/**
 * M5 Final Human UAT — Runtime Verification Script
 *
 * Exercises all M5 scenarios against the real API + PostgreSQL.
 * Usage: DATABASE_URL=... pnpm tsx scripts/m5-uat-verification.ts
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import bcrypt from 'bcrypt';

const API = 'http://localhost:3000/v1';
let TOKEN = '';
let USER_ID = '';
let ORG_ID = '';

// ── Helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> ?? {}),
  };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function pass(id: string, scenario: string, evidence: string) {
  console.log(`  ✓ ${id} | ${scenario} | PASS | ${evidence}`);
}
function fail(id: string, scenario: string, evidence: string) {
  console.log(`  ✗ ${id} | ${scenario} | FAIL | ${evidence}`);
}

// ── Workbook Builder ─────────────────────────────────────────────────────

async function buildAcceptanceWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const catWs = wb.addWorksheet('Categories');
  catWs.addRow(['slug', 'name', 'name_ar', 'description', 'parent_slug', 'sort_order']);
  catWs.addRow(['electronics', 'Electronics', 'إلكترونيات', 'All electronics', '', 0]);
  catWs.addRow(['computers', 'Computers', 'حواسيب', 'Desktop & laptop computers', 'electronics', 1]);
  catWs.addRow(['laptops', 'Laptops', 'حواسيب محمولة', 'Portable computers', 'computers', 2]);
  catWs.addRow(['gaming-laptops', 'Gaming Laptops', 'حواسيب ألعاب', 'High-performance laptops', 'laptops', 3]);
  catWs.addRow(['phones', 'Phones', 'هواتف', 'Mobile phones', 'electronics', 4]);

  const brandWs = wb.addWorksheet('Brands');
  brandWs.addRow(['slug', 'name', 'name_ar', 'description']);
  brandWs.addRow(['dell', 'Dell', 'ديل', 'Dell Technologies']);
  brandWs.addRow(['lenovo', 'Lenovo', 'لينوفو', 'Lenovo Group']);
  brandWs.addRow(['hp', 'HP', 'إتش بي', 'HP Inc.']);

  const agWs = wb.addWorksheet('Attribute Groups');
  agWs.addRow(['name', 'name_ar', 'kind']);
  agWs.addRow(['Specifications', 'المواصفات', 'TECHNICAL']);
  agWs.addRow(['Physical', 'الخصائص الفيزيائية', 'PHYSICAL']);

  const attrWs = wb.addWorksheet('Attributes');
  attrWs.addRow(['code', 'name', 'name_ar', 'description', 'type', 'scope', 'unit', 'validation']);
  const attrDefs = [
    ['cpu-model', 'CPU Model', 'موديل المعالج', 'Processor model', 'SELECT', 'PRODUCT', '', '{}'],
    ['ram-gb', 'RAM (GB)', 'الذاكرة (جيجابايت)', 'RAM in gigabytes', 'INTEGER', 'VARIANT', 'GB', '{}'],
    ['storage-gb', 'Storage (GB)', 'التخزين (جيجابايت)', 'Storage capacity', 'INTEGER', 'VARIANT', 'GB', '{}'],
    ['screen-size', 'Screen Size', 'حجم الشاشة', 'Diagonal screen size', 'DECIMAL', 'PRODUCT', 'inches', '{}'],
    ['resolution', 'Resolution', 'الدقة', 'Display resolution', 'SELECT', 'PRODUCT', '', '{}'],
    ['color', 'Color', 'اللون', 'Product color', 'SELECT', 'VARIANT', '', '{}'],
    ['os', 'Operating System', 'نظام التشغيل', 'OS type', 'SELECT', 'VARIANT', '', '{}'],
  ];
  for (const a of attrDefs) attrWs.addRow(a);

  const optWs = wb.addWorksheet('Attribute Options');
  optWs.addRow(['attribute_code', 'value', 'value_ar', 'label', 'sort_order']);
  const optData = [
    ['cpu-model', 'Intel Core i5-1335U', '', 'Core i5', 0],
    ['cpu-model', 'Intel Core i7-1355U', '', 'Core i7', 1],
    ['cpu-model', 'AMD Ryzen 7 7730U', '', 'Ryzen 7', 2],
    ['resolution', '1920x1080', '', 'FHD', 0],
    ['resolution', '2560x1440', '', 'QHD', 1],
    ['resolution', '3840x2160', '', '4K UHD', 2],
    ['color', 'black', 'أسود', 'Black', 0],
    ['color', 'silver', 'فضي', 'Silver', 1],
    ['os', 'windows-11', '', 'Windows 11', 0],
    ['os', 'ubuntu-22', '', 'Ubuntu 22.04', 1],
  ];
  for (const o of optData) optWs.addRow(o);

  const ptWs = wb.addWorksheet('Product Types');
  ptWs.addRow(['code', 'name', 'name_ar', 'description', 'category_slug', 'variant_dimensions']);
  ptWs.addRow(['business-laptop', 'Business Laptop', 'لابتوب أعمال', 'Standard business laptop', 'laptops', 'ram-gb,storage-gb,color,os']);
  ptWs.addRow(['gaming-laptop', 'Gaming Laptop', 'لابتوب ألعاب', 'High-performance gaming laptop', 'gaming-laptops', 'ram-gb,storage-gb,color,os']);

  const ptaWs = wb.addWorksheet('Product Type Attributes');
  ptaWs.addRow(['product_type_code', 'attribute_code', 'group_name', 'required', 'scope', 'display_order', 'filterable', 'searchable', 'visible_in_listing', 'visible_in_detail']);
  const ptaData = [
    ['business-laptop', 'cpu-model', 'Specifications', true, 'PRODUCT', 0, true, true, true, true],
    ['business-laptop', 'ram-gb', 'Specifications', true, 'VARIANT', 1, true, false, true, true],
    ['business-laptop', 'storage-gb', 'Specifications', true, 'VARIANT', 2, true, false, true, true],
    ['business-laptop', 'screen-size', 'Specifications', false, 'PRODUCT', 3, false, true, true, true],
    ['business-laptop', 'resolution', 'Specifications', false, 'PRODUCT', 4, true, true, true, true],
    ['business-laptop', 'color', 'Physical', false, 'VARIANT', 5, true, false, true, true],
    ['business-laptop', 'os', 'Specifications', false, 'VARIANT', 6, true, false, true, true],
    ['gaming-laptop', 'cpu-model', 'Specifications', true, 'PRODUCT', 0, true, true, true, true],
    ['gaming-laptop', 'ram-gb', 'Specifications', true, 'VARIANT', 1, true, false, true, true],
    ['gaming-laptop', 'storage-gb', 'Specifications', true, 'VARIANT', 2, true, false, true, true],
    ['gaming-laptop', 'screen-size', 'Specifications', false, 'PRODUCT', 3, false, true, true, true],
    ['gaming-laptop', 'resolution', 'Specifications', true, 'PRODUCT', 4, true, true, true, true],
    ['gaming-laptop', 'color', 'Physical', false, 'VARIANT', 5, true, false, true, true],
    ['gaming-laptop', 'os', 'Specifications', true, 'VARIANT', 6, true, true, true, true],
  ];
  for (const p of ptaData) ptaWs.addRow(p);

  const prodWs = wb.addWorksheet('Products');
  prodWs.addRow(['slug', 'title', 'title_ar', 'description', 'description_ar', 'brand_slug', 'product_type_code', 'category_slug', 'mpn', 'gtin', 'ean', 'condition', 'status']);
  prodWs.addRow(['latitude-5550', 'Latitude 5550', 'لاتيتيود 5550', 'Dell business laptop', '', 'dell', 'business-laptop', 'laptops', 'LAT-5550', '', '', 'NEW', 'DRAFT']);
  prodWs.addRow(['thinkpad-t14', 'ThinkPad T14', 'ثينكباد T14', 'Lenovo business laptop', '', 'lenovo', 'business-laptop', 'laptops', 'TP-T14', '', '', 'NEW', 'DRAFT']);
  prodWs.addRow(['rog-strix-g15', 'ROG Strix G15', 'ROG ستريكس G15', 'ASUS gaming laptop', '', 'hp', 'gaming-laptop', 'gaming-laptops', 'ROG-G15', '', '', 'NEW', 'DRAFT']);

  const paWs = wb.addWorksheet('Product Attributes');
  paWs.addRow(['product_slug', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key']);
  paWs.addRow(['latitude-5550', 'cpu-model', '', '', '', 'Intel Core i5-1335U']);
  paWs.addRow(['latitude-5550', 'screen-size', '', '14.0', '', '']);
  paWs.addRow(['latitude-5550', 'resolution', '', '', '', '1920x1080']);
  paWs.addRow(['thinkpad-t14', 'cpu-model', '', '', '', 'Intel Core i7-1355U']);
  paWs.addRow(['thinkpad-t14', 'screen-size', '', '14.0', '', '']);
  paWs.addRow(['thinkpad-t14', 'resolution', '', '', '', '2560x1440']);
  paWs.addRow(['rog-strix-g15', 'cpu-model', '', '', '', 'AMD Ryzen 7 7730U']);
  paWs.addRow(['rog-strix-g15', 'screen-size', '', '15.6', '', '']);
  paWs.addRow(['rog-strix-g15', 'resolution', '', '', '', '3840x2160']);

  const varWs = wb.addWorksheet('Variants');
  varWs.addRow(['product_slug', 'sku', 'title', 'title_ar', 'barcode', 'unit', 'weight_grams']);
  varWs.addRow(['latitude-5550', 'LAT-5550-I5-16-512', '16GB/512GB', '', '', 'PCS', 1800]);
  varWs.addRow(['latitude-5550', 'LAT-5550-I7-32-1TB', '32GB/1TB', '', '', 'PCS', 1850]);
  varWs.addRow(['thinkpad-t14', 'TP-T14-I7-16-512', '16GB/512GB', '', '', 'PCS', 1600]);
  varWs.addRow(['rog-strix-g15', 'ROG-G15-R7-32-1TB', '32GB/1TB Black', '', '', 'PCS', 2300]);

  const vaWs = wb.addWorksheet('Variant Attributes');
  vaWs.addRow(['variant_sku', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'ram-gb', '', '16', '', '']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'storage-gb', '', '512', '', '']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'color', '', '', '', 'silver']);
  vaWs.addRow(['LAT-5550-I5-16-512', 'os', '', '', '', 'windows-11']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'ram-gb', '', '32', '', '']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'storage-gb', '', '1024', '', '']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'color', '', '', '', 'silver']);
  vaWs.addRow(['LAT-5550-I7-32-1TB', 'os', '', '', '', 'windows-11']);
  vaWs.addRow(['TP-T14-I7-16-512', 'ram-gb', '', '16', '', '']);
  vaWs.addRow(['TP-T14-I7-16-512', 'storage-gb', '', '512', '', '']);
  vaWs.addRow(['TP-T14-I7-16-512', 'color', '', '', '', 'black']);
  vaWs.addRow(['TP-T14-I7-16-512', 'os', '', '', '', 'ubuntu-22']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'ram-gb', '', '32', '', '']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'storage-gb', '', '1024', '', '']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'color', '', '', '', 'black']);
  vaWs.addRow(['ROG-G15-R7-32-1TB', 'os', '', '', '', 'windows-11']);

  const srcWs = wb.addWorksheet('Sources');
  srcWs.addRow(['product_slug', 'source_type', 'source_url', 'verified_at']);
  srcWs.addRow(['latitude-5550', 'MANUFACTURER', 'https://dell.com/latitude5550', '2026-01-15T00:00:00Z']);
  srcWs.addRow(['latitude-5550', 'DISTRIBUTOR', 'https://dist.example.com/lat5550', '']);
  srcWs.addRow(['thinkpad-t14', 'MANUFACTURER', 'https://lenovo.com/thinkpad-t14', '2026-02-01T00:00:00Z']);
  srcWs.addRow(['rog-strix-g15', 'MANUFACTURER', 'https://hp.com/rog-strix-g15', '']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Main UAT Flow ────────────────────────────────────────────────────────

async function main() {
  const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform';
  const pool = new Pool({ connectionString });
  const results: Array<{ id: string; scenario: string; status: string; evidence: string }> = [];

  function record(id: string, scenario: string, status: string, evidence: string) {
    results.push({ id, scenario, status, evidence });
    if (status === 'PASS') pass(id, scenario, evidence);
    else fail(id, scenario, evidence);
  }

  try {
    // ── Authenticate ──────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════');
    console.log('M5 FINAL HUMAN UAT — RUNTIME VERIFICATION');
    console.log('══════════════════════════════════════════════════\n');

    console.log('── Authentication ──');
    const loginRes = await fetch(`${API}/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@scsp.dev', password: 'Admin@2026!', deviceId: 'uat-device-001', deviceInfo: { platform: 'Windows', userAgent: 'UAT/1.0' } }),
    });
    const loginData = await loginRes.json() as any;

    if (loginData.requiresOtp) {
      // Get OTP from Redis
      const otpResult = await pool.query("SELECT 1"); // just to test DB
      const { execSync } = await import('node:child_process');
      const otp = execSync('docker exec scs-redis redis-cli GET "otp:+10000000000"').toString().trim();
      const verifyRes = await fetch(`${API}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+10000000000', otp, deviceId: 'uat-device-001', deviceInfo: { platform: 'Windows', userAgent: 'UAT/1.0' } }),
      });
      const verifyData = await verifyRes.json() as any;
      TOKEN = verifyData.accessToken;
    } else {
      TOKEN = loginData.accessToken;
    }

    // Decode JWT to get user/org info
    const payload = JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64').toString());
    USER_ID = payload.sub;
    ORG_ID = payload.activeOrg;
    console.log(`  Authenticated: user=${USER_ID.slice(0, 8)}… org=${ORG_ID.slice(0, 8)}… role=${payload.role}\n`);

    // ── Section 4: Database Baseline ──────────────────────────────
    console.log('── Section 4: Database Baseline ──');
    const baseline = await pool.query(`
      SELECT 'categories' AS tbl, COUNT(*) FROM categories WHERE store_id IS NULL
      UNION ALL SELECT 'product_types', COUNT(*) FROM product_types
      UNION ALL SELECT 'attribute_definitions', COUNT(*) FROM attribute_definitions
      UNION ALL SELECT 'products', COUNT(*) FROM products WHERE store_id IS NULL
      UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
      UNION ALL SELECT 'brands', COUNT(*) FROM brands
      UNION ALL SELECT 'product_type_attributes', COUNT(*) FROM product_type_attributes
      UNION ALL SELECT 'product_sources', COUNT(*) FROM product_sources
      ORDER BY tbl
    `);
    for (const r of baseline.rows) console.log(`  ${r.tbl}: ${r.count}`);
    const totalBefore = baseline.rows.reduce((s: number, r: any) => s + parseInt(r.count), 0);
    console.log(`  Total entities before import: ${totalBefore}\n`);

    // ── Section 5: Import Acceptance Workbook ─────────────────────
    console.log('── Section 5: Import Acceptance Workbook ──');
    const buf = await buildAcceptanceWorkbook();
    const base64 = buf.toString('base64');

    // Upload
    const uploadRes = await apiFetch('/admin/catalog-imports/upload', {
      method: 'POST',
      body: JSON.stringify({ filename: 'm5-uat-acceptance.xlsx', fileBase64: base64 }),
    });
    const importId = uploadRes.importId ?? uploadRes.id;
    console.log(`  Upload: importId=${importId}`);
    record('UAT-01', 'Workbook upload', 'PASS', `importId=${importId}`);

    // Preview
    const preview = await apiFetch(`/admin/catalog-imports/${importId}/preview`);
    console.log(`  Preview: ${preview.plan?.summary ?? JSON.stringify(preview).slice(0, 200)}`);
    record('UAT-02', 'Import preview', 'PASS', `preview returned`);

    // Section 22: Preview non-mutation
    const afterPreview = await pool.query(`
      SELECT COUNT(*)::int AS total FROM (
        SELECT FROM categories UNION ALL SELECT FROM product_types UNION ALL SELECT FROM products
      ) sub
    `);
    const countAfterPreview = afterPreview.rows[0].total;
    record('UAT-03', 'Preview non-mutation', countAfterPreview === 0 ? 'PASS' : 'FAIL', `entities after preview: ${countAfterPreview} (expected 0)`);

    // Execute
    const execResult = await apiFetch(`/admin/catalog-imports/${importId}/execute`, { method: 'POST' });
    console.log(`  Execute: created=${execResult.created} updated=${execResult.updated} unchanged=${execResult.unchanged} rejected=${execResult.rejected} errors=${execResult.errors?.length ?? 0}`);
    record('UAT-04', 'Import execution', execResult.rejected === 0 && (execResult.errors?.length ?? 0) === 0 ? 'PASS' : 'FAIL', `created=${execResult.created} errors=${execResult.errors?.length ?? 0}`);

    // ── Section 4+: Database Post-Import ──────────────────────────
    console.log('\n── Section 4+: Database Post-Import ──');
    const postImport = await pool.query(`
      SELECT 'categories' AS tbl, COUNT(*) FROM categories WHERE store_id IS NULL
      UNION ALL SELECT 'product_types', COUNT(*) FROM product_types
      UNION ALL SELECT 'attribute_definitions', COUNT(*) FROM attribute_definitions
      UNION ALL SELECT 'products', COUNT(*) FROM products WHERE store_id IS NULL
      UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
      UNION ALL SELECT 'brands', COUNT(*) FROM brands
      UNION ALL SELECT 'product_type_attributes', COUNT(*) FROM product_type_attributes
      UNION ALL SELECT 'product_sources', COUNT(*) FROM product_sources
      ORDER BY tbl
    `);
    for (const r of postImport.rows) console.log(`  ${r.tbl}: ${r.count}`);

    // ── Section 6: Category UI Verification ───────────────────────
    console.log('\n── Section 6: Category UI (API) ──');
    const cats = await apiFetch('/categories?all=true&includeInactive=true');
    const laptopsCat = cats.find((c: any) => c.slug === 'laptops');
    const gamingCat = cats.find((c: any) => c.slug === 'gaming-laptops');
    const elecCat = cats.find((c: any) => c.slug === 'electronics');

    record('UAT-05', 'Category productCount (laptops)', laptopsCat?.productCount === 2 ? 'PASS' : 'FAIL', `laptops.productCount=${laptopsCat?.productCount} (expected 2)`);
    record('UAT-06', 'Category productCount (gaming)', gamingCat?.productCount === 1 ? 'PASS' : 'FAIL', `gaming-laptops.productCount=${gamingCat?.productCount} (expected 1)`);
    record('UAT-07', 'Category productCount (root)', elecCat?.productCount === 0 ? 'PASS' : 'FAIL', `electronics.productCount=${elecCat?.productCount} (expected 0)`);

    // ── Section 8: Associated Product Types ───────────────────────
    console.log('\n── Section 8: Associated Product Types ──');
    const laptopsPts = await apiFetch(`/admin/categories/${laptopsCat.id}/product-types`);
    const hasDraft = laptopsPts.some((p: any) => p.status === 'DRAFT');
    record('UAT-08', 'Admin shows DRAFT product types', hasDraft ? 'PASS' : 'FAIL', `laptops PTs: ${laptopsPts.length}, hasDRAFT=${hasDraft}`);

    const businessLaptop = laptopsPts.find((p: any) => p.code === 'business-laptop');
    if (businessLaptop) {
      record('UAT-09', 'Business Laptop PT visible', 'PASS', `id=${businessLaptop.id.slice(0, 8)}… status=${businessLaptop.status}`);
    } else {
      record('UAT-09', 'Business Laptop PT visible', 'FAIL', 'not found in laptops category');
    }

    // ── Section 9: Product Type Details + Variant Dimensions ──────
    console.log('\n── Section 9: Product Type Details ──');
    if (businessLaptop) {
      const schema = await apiFetch(`/product-types/${businessLaptop.id}/schema`);
      const enriched = (schema as any).variantDimensionsEnriched;
      const dims = schema.variantDimensions;

      record('UAT-10', 'variantDimensions are UUIDs', Array.isArray(dims) && dims.every((d: string) => /^[0-9a-f]{8}-/i.test(d)) ? 'PASS' : 'FAIL', `dims=${JSON.stringify(dims).slice(0, 100)}`);

      if (enriched && Array.isArray(enriched) && enriched.length > 0 && enriched[0].code) {
        record('UAT-11', 'Enriched dimensions have names', 'PASS', enriched.map((d: any) => `${d.code}→${d.name}`).join(', '));
      } else {
        record('UAT-11', 'Enriched dimensions have names', 'FAIL', `enriched=${JSON.stringify(enriched).slice(0, 200)}`);
      }
    }

    // ── Section 10: Database Variant Dimension Check ──────────────
    console.log('\n── Section 10: Variant Dimension DB Check ──');
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const dimCheck = await pool.query(`SELECT code, variant_dimensions FROM product_types`);
    let allUuids = true;
    for (const r of dimCheck.rows) {
      const dims = r.variant_dimensions as string[];
      const allValid = dims.every(d => uuidRe.test(d));
      if (!allValid) allUuids = false;
      console.log(`  ${r.code}: [${dims.map(d => allValid ? 'UUID' : d).join(', ')}]`);
    }
    record('UAT-12', 'All variant_dimensions are UUIDs', allUuids ? 'PASS' : 'FAIL', `${dimCheck.rows.length} product types checked`);

    // ── Section 11: Legacy Code Self-Healing ──────────────────────
    console.log('\n── Section 11: Legacy Code Self-Healing ──');
    if (businessLaptop) {
      // Overwrite with codes to simulate legacy data
      await pool.query(`UPDATE product_types SET variant_dimensions = $1::jsonb, status = 'DRAFT' WHERE id = $2`,
        [JSON.stringify(['ram-gb', 'storage-gb', 'color', 'os']), businessLaptop.id]);

      const before = await pool.query(`SELECT variant_dimensions FROM product_types WHERE id = $1`, [businessLaptop.id]);
      console.log(`  BEFORE: ${JSON.stringify(before.rows[0].variant_dimensions)}`);

      // Trigger publish-readiness (which resolves codes)
      const readiness = await apiFetch(`/admin/product-types/${businessLaptop.id}/publish-readiness`);
      record('UAT-13', 'Code-based dims resolve for publish', readiness.canPublish ? 'PASS' : 'FAIL', `canPublish=${readiness.canPublish} errors=${readiness.errors?.length ?? 0}`);

      // Check DB was fixed
      const after = await pool.query(`SELECT variant_dimensions FROM product_types WHERE id = $1`, [businessLaptop.id]);
      const afterDims = after.rows[0].variant_dimensions as string[];
      const afterAllUuids = afterDims.every(d => uuidRe.test(d));
      record('UAT-14', 'Codes persisted as UUIDs', afterAllUuids ? 'PASS' : 'FAIL', `AFTER: [${afterDims.map(d => d.slice(0, 8) + '…').join(', ')}]`);

      // Actually publish
      const published = await apiFetch(`/admin/product-types/${businessLaptop.id}/publish`, { method: 'POST' });
      record('UAT-15', 'Product Type publish', published.status === 'PUBLISHED' ? 'PASS' : 'FAIL', `status=${published.status}`);
    }

    // ── Section 12: Invalid Dimension Rejection ───────────────────
    console.log('\n── Section 12: Invalid Dimension Rejection ──');
    const invalidPtId = randomUUID();
    const laptopsId = laptopsCat.id;
    await pool.query(
      `INSERT INTO product_types (id, code, name, category_id, status, variant_dimensions) VALUES ($1, 'invalid-dim-test', 'Invalid Dim Test', $2, 'DRAFT', $3)`,
      [invalidPtId, laptopsId, JSON.stringify(['does-not-exist'])],
    );
    const attrRow = await pool.query(`SELECT id FROM attribute_definitions WHERE code = 'ram-gb'`);
    await pool.query(
      `INSERT INTO product_type_attributes (id, product_type_id, attribute_definition_id, required, scope) VALUES ($1, $2, $3, true, 'VARIANT')`,
      [randomUUID(), invalidPtId, attrRow.rows[0].id],
    );

    try {
      const invalidReadiness = await apiFetch(`/admin/product-types/${invalidPtId}/publish-readiness`);
      record('UAT-16', 'Invalid dimension rejected', !invalidReadiness.canPublish ? 'PASS' : 'FAIL', `canPublish=${invalidReadiness.canPublish} errors=${invalidReadiness.errors?.map((e: any) => e.code).join(',')}`);
    } catch (e: any) {
      record('UAT-16', 'Invalid dimension rejected', 'PASS', `API returned error: ${e.message.slice(0, 100)}`);
    }

    // ── Section 13: PRODUCT-Scope Dimension Rejection ─────────────
    console.log('\n── Section 13: PRODUCT-Scope Dimension Rejection ──');
    const wrongScopePtId = randomUUID();
    await pool.query(
      `INSERT INTO product_types (id, code, name, category_id, status, variant_dimensions) VALUES ($1, 'wrong-scope-test', 'Wrong Scope Test', $2, 'DRAFT', $3)`,
      [wrongScopePtId, laptopsId, JSON.stringify(['cpu-model'])],
    );
    const cpuAttr = await pool.query(`SELECT id FROM attribute_definitions WHERE code = 'cpu-model'`);
    await pool.query(
      `INSERT INTO product_type_attributes (id, product_type_id, attribute_definition_id, required, scope) VALUES ($1, $2, $3, true, 'PRODUCT')`,
      [randomUUID(), wrongScopePtId, cpuAttr.rows[0].id],
    );

    const wrongScopeReadiness = await apiFetch(`/admin/product-types/${wrongScopePtId}/publish-readiness`);
    const hasScopeError = wrongScopeReadiness.errors?.some((e: any) => e.code === 'VARIANT_DIMENSION_WRONG_SCOPE');
    record('UAT-17', 'PRODUCT-scope dim rejected', !wrongScopeReadiness.canPublish && hasScopeError ? 'PASS' : 'FAIL', `canPublish=${wrongScopeReadiness.canPublish} hasScopeError=${hasScopeError}`);

    // ── Section 15-16: Publish + Category Count After ─────────────
    console.log('\n── Section 15-16: Publish Verification ──');
    const catsAfterPublish = await apiFetch('/categories?all=true&includeInactive=true');
    const laptopsAfterPublish = catsAfterPublish.find((c: any) => c.slug === 'laptops');
    record('UAT-18', 'Product count stable after publish', laptopsAfterPublish?.productCount === 2 ? 'PASS' : 'FAIL', `laptops.productCount=${laptopsAfterPublish?.productCount}`);

    // Check published PT shows in category
    const laptopsPtsAfterPublish = await apiFetch(`/admin/categories/${laptopsCat.id}/product-types`);
    const publishedPt = laptopsPtsAfterPublish.find((p: any) => p.code === 'business-laptop');
    record('UAT-19', 'Published PT visible in category', publishedPt?.status === 'PUBLISHED' ? 'PASS' : 'FAIL', `status=${publishedPt?.status}`);

    // ── Section 19: SKU Integrity ─────────────────────────────────
    console.log('\n── Section 19: SKU Integrity ──');
    const corruptedSku = await pool.query(`SELECT sku FROM product_variants WHERE sku LIKE 'SKU-[%'`);
    record('UAT-20', 'No corrupted SKUs', corruptedSku.rows.length === 0 ? 'PASS' : 'FAIL', `corrupted SKUs: ${corruptedSku.rows.length}`);

    // ── Section 20: Catalog Export ────────────────────────────────
    console.log('\n── Section 20: Catalog Export ──');
    const exportRes = await apiFetch('/admin/catalog-imports/export', { method: 'POST' });
    const exportJobId = exportRes.importId ?? exportRes.id;
    // Wait for export to complete
    let exportData: any;
    for (let i = 0; i < 10; i++) {
      exportData = await apiFetch(`/admin/catalog-imports/${exportJobId}`);
      if (exportData.status === 'COMPLETED' || exportData.exportFileBase64) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    record('UAT-21', 'Catalog export', exportData?.status === 'COMPLETED' ? 'PASS' : 'FAIL', `status=${exportData?.status}`);

    // ── Section 21: Round-Trip ────────────────────────────────────
    console.log('\n── Section 21: Round-Tip Re-import ──');
    if (exportData?.exportFileBase64) {
      const reimportUpload = await apiFetch('/admin/catalog-imports/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: 'm5-uat-reimport.xlsx', fileBase64: exportData.exportFileBase64 }),
      });
      const reimportId = reimportUpload.importId ?? reimportUpload.id;
      const reimportExec = await apiFetch(`/admin/catalog-imports/${reimportId}/execute`, { method: 'POST' });
      const isIdempotent = reimportExec.created === 0 && reimportExec.updated === 0 && (reimportExec.errors?.length ?? 0) === 0;
      record('UAT-22', 'Round-trip idempotency', isIdempotent ? 'PASS' : 'FAIL', `created=${reimportExec.created} updated=${reimportExec.updated} unchanged=${reimportExec.unchanged}`);
    } else {
      record('UAT-22', 'Round-trip idempotency', 'BLOCKED', 'export file not available');
    }

    // ── Summary ───────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════');
    console.log('M5 UAT RESULTS SUMMARY');
    console.log('══════════════════════════════════════════════════');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const blocked = results.filter(r => r.status === 'BLOCKED').length;
    console.log(`\n  Total: ${results.length} | PASS: ${passed} | FAIL: ${failed} | BLOCKED: ${blocked}\n`);
    for (const r of results) {
      console.log(`  ${r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⊘'} ${r.id} | ${r.scenario} | ${r.status} | ${r.evidence}`);
    }
    console.log('');

  } catch (err) {
    console.error('UAT FATAL ERROR:', err);
  } finally {
    await pool.end();
  }
}

main();
