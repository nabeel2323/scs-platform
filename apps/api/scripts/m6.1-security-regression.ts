/**
 * M6.1 — Security Regression + Offer Duplicate Race Test
 *
 * Expanded IDOR coverage beyond M6:
 * - Cross-tenant offer modification (POST/PATCH)
 * - Cross-tenant inventory read/write
 * - Cross-tenant order read
 * - Cross-tenant store manipulation
 * - Direct ID manipulation (storeId, merchantId, organizationId, offerId, etc.)
 *
 * Offer duplicate race:
 * - Concurrent offer creation for same (store, variant) → at most 1 succeeds
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'node:crypto';

const API = 'http://localhost:3000/v1';
const DB_URL = 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform';
const pool = new Pool({ connectionString: DB_URL });

// ── Auth ────────────────────────────────────────────────────

async function getToken(email: string, password: string, phone: string): Promise<string> {
  const redis = new Redis('redis://localhost:6379');
  const loginRes = await fetch(`${API}/auth/login/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceId: 'm61-sec-' + email }),
  });
  const loginData = await loginRes.json() as any;
  if (loginData.accessToken) { await redis.quit(); return loginData.accessToken; }
  await fetch(`${API}/auth/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const otp = await redis.get(`otp:${phone}`);
  await redis.quit();
  if (!otp) throw new Error('OTP failed for ' + email);
  const verifyRes = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp, deviceId: 'm61-sec-' + email, deviceInfo: { platform: 'web', userAgent: 'M6.1-Sec/1.0' } }),
  });
  const d = await verifyRes.json() as any;
  return d.accessToken;
}

function auth(t: string) { return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }; }

async function api(method: string, path: string, token: string, body?: any): Promise<{ status: number; data: any }> {
  const r = await fetch(`${API}${path}`, {
    method, headers: auth(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}

// ── Results ─────────────────────────────────────────────────

const results: { id: string; name: string; status: string; detail: string }[] = [];
function rec(id: string, name: string, status: string, detail: string) {
  results.push({ id, name, status, detail });
  console.log(`  ${status === 'PASS' ? '✓' : '✗'} ${id}: ${name} — ${status} (${detail})`);
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('=== M6.1 SECURITY REGRESSION + OFFER RACE ===\n');

  // Get tokens
  const adminToken = await getToken('admin@scsp.dev', 'Admin@2026!', '+10000000000');
  const merchAToken = await getToken('merchant-a@scsp.dev', 'MerchantA@2026!', '+96650000001');
  const merchBToken = await getToken('merchant-b@scsp.dev', 'MerchantB@2026!', '+96650000002');
  console.log('Authenticated: admin, merchant-a, merchant-b\n');

  // Get IDs from DB
  const { rows: orgRows } = await pool.query("SELECT id, name FROM organizations WHERE name LIKE '%Merchant%' ORDER BY name");
  if (orgRows.length < 2) { console.log('Need M6 test data. Run m6-uat-run.ts first.'); await pool.end(); return; }
  const orgA = orgRows.find((r: any) => r.name.includes('A')) || orgRows[0];
  const orgB = orgRows.find((r: any) => r.name.includes('B')) || orgRows[1];

  const { rows: storeRows } = await pool.query('SELECT id, display_name, org_id FROM stores WHERE org_id IN ($1, $2)', [orgA.id, orgB.id]);
  const storeA = storeRows.find((s: any) => s.org_id === orgA.id);
  const storeB = storeRows.find((s: any) => s.org_id === orgB.id);

  const { rows: whRows } = await pool.query('SELECT id, store_id FROM warehouses WHERE store_id IN ($1, $2)', [storeA?.id, storeB?.id]);
  const whA = whRows.find((w: any) => w.store_id === storeA?.id);
  const whB = whRows.find((w: any) => w.store_id === storeB?.id);

  const { rows: offerRows } = await pool.query('SELECT id, store_id, status FROM merchant_offers WHERE store_id IN ($1, $2) AND status = $3 ORDER BY created_at', [storeA?.id, storeB?.id, 'ACTIVE']);
  const offerA = offerRows.find((o: any) => o.store_id === storeA?.id);
  const offerB = offerRows.find((o: any) => o.store_id === storeB?.id);

  const { rows: invRows } = await pool.query('SELECT id, warehouse_id FROM inventory_items WHERE warehouse_id IN ($1, $2)', [whA?.id, whB?.id]);
  const invA = invRows.find((i: any) => i.warehouse_id === whA?.id);
  const invB = invRows.find((i: any) => i.warehouse_id === whB?.id);

  console.log(`Org A: ${orgA.id}, Store A: ${storeA?.id}, WH A: ${whA?.id}, Offer A: ${offerA?.id}, Inv A: ${invA?.id}`);
  console.log(`Org B: ${orgB.id}, Store B: ${storeB?.id}, WH B: ${whB?.id}, Offer B: ${offerB?.id}, Inv B: ${invB?.id}\n`);

  // ── SEC-01: Cross-tenant inventory read ──
  console.log('--- Cross-Tenant Inventory ---');
  if (invB) {
    const r = await api('GET', `/stores/${storeA?.id}/inventory`, merchBToken);
    rec('SEC-01-1', 'Merchant B cannot read Store A inventory', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // ── SEC-02: Cross-tenant inventory export ──
  if (invB) {
    const r = await api('GET', `/stores/${storeA?.id}/inventory/export`, merchBToken);
    rec('SEC-01-2', 'Merchant B cannot export Store A inventory', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // ── SEC-03: Cross-tenant low-stock check ──
  {
    const r = await api('POST', `/stores/${storeA?.id}/inventory/check-low-stock`, merchBToken, {});
    rec('SEC-01-3', 'Merchant B cannot check Store A low stock', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // ── SEC-04: Cross-tenant offer modification ──
  console.log('\n--- Cross-Tenant Offer Modification ---');
  if (offerA) {
    const r = await api('PATCH', `/merchant/offers/${offerA.id}/pricing`, merchBToken, { unitPriceMinor: 1 });
    rec('SEC-02-1', 'Merchant B cannot modify Merchant A offer pricing', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }
  if (offerA) {
    const r = await api('POST', `/merchant/offers/${offerA.id}/withdraw`, merchBToken);
    rec('SEC-02-2', 'Merchant B cannot withdraw Merchant A offer', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // ── SEC-05: Cross-tenant order read ──
  console.log('\n--- Cross-Tenant Orders ---');
  {
    const r = await api('GET', '/orders', merchAToken);
    const ordersA = r.data?.filter?.((o: any) => o.storeId === storeB?.id) || [];
    rec('SEC-03-1', 'Merchant A orders do not include Store B orders', ordersA.length === 0 ? 'PASS' : 'FAIL', `leaked=${ordersA.length}`);
  }

  // ── SEC-06: Direct ID manipulation ──
  console.log('\n--- Direct ID Manipulation ---');
  {
    const fakeUuid = crypto.randomUUID();
    const r = await api('GET', `/stores/${fakeUuid}/inventory`, merchAToken);
    rec('SEC-04-1', 'Fake storeId returns 403/404', (r.status === 403 || r.status === 404) ? 'PASS' : 'FAIL', `status=${r.status}`);
  }
  if (offerB) {
    const r = await api('PATCH', `/merchant/offers/${offerB.id}/pricing`, merchAToken, { unitPriceMinor: 1 });
    rec('SEC-04-2', 'Merchant A cannot modify Merchant B offer by ID', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }
  if (invB) {
    const r = await api('POST', '/inventory/adjust', merchAToken, { inventoryItemId: invB.id, quantity: 1, reason: 'test' });
    rec('SEC-04-3', 'Merchant A cannot adjust Merchant B inventory by ID', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }
  if (invB) {
    const r = await api('POST', '/inventory/reserve', merchAToken, { inventoryItemId: invB.id, quantity: 1, referenceId: crypto.randomUUID(), movementType: 'RESERVE' });
    rec('SEC-04-4', 'Merchant A cannot reserve Merchant B stock by ID', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // ── SEC-07: Warehouse ID manipulation ──
  console.log('\n--- Warehouse ID Manipulation ---');
  if (whB) {
    const r = await api('GET', `/inventory/warehouse/${whB.id}`, merchAToken);
    rec('SEC-05-1', 'Merchant A cannot list Merchant B warehouse inventory', r.status === 403 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // ── RACE-01: Offer duplicate race ──
  console.log('\n--- Offer Duplicate Race ---');
  // Get a variant that merchant A hasn't offered on store A yet
  const { rows: varRows } = await pool.query(`
    SELECT v.id FROM product_variants v 
    WHERE NOT EXISTS (
      SELECT 1 FROM merchant_offers o WHERE o.variant_id = v.id AND o.store_id = $1
    ) LIMIT 1
  `, [storeA?.id]);

  if (varRows[0]) {
    const variantId = varRows[0].id;
    console.log(`  Racing offer creation for variant ${variantId} on store A`);

    const promises: Promise<{ status: number; data: any }>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(api('POST', '/merchant/offers', merchAToken, {
        storeId: storeA?.id,
        variantId,
        unitPriceMinor: 1000 + i,
        currency: 'SAR',
        moq: 1,
        leadTimeDays: 3,
      }));
    }

    const raceResults = await Promise.all(promises);
    const created = raceResults.filter(r => r.status === 201 || r.status === 200).length;
    const conflicts = raceResults.filter(r => r.status === 409).length;
    const other = raceResults.filter(r => r.status !== 201 && r.status !== 200 && r.status !== 409).length;

    // Count actual offers in DB
    const { rows: dupCheck } = await pool.query(
      'SELECT COUNT(*) FROM merchant_offers WHERE store_id = $1 AND variant_id = $2',
      [storeA?.id, variantId]
    );
    const actualOffers = parseInt(dupCheck[0].count, 10);

    rec('RACE-01', 'Concurrent offer creation → max 1 created',
      (created <= 1 && actualOffers <= 1) ? 'PASS' : 'FAIL',
      `created=${created} conflicts=${conflicts} other=${other} actualDB=${actualOffers}`
    );
  } else {
    console.log('  No unused variant available for race test — SKIP');
    rec('RACE-01', 'Offer duplicate race', 'BLOCKED', 'no unused variant');
  }

  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`  PASS: ${pass}  FAIL: ${fail}  TOTAL: ${results.length}`);
  console.log(`  ${fail === 0 ? 'ALL PASS ✓' : 'SOME FAILED ✗'}`);

  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('FATAL:', err); pool.end(); process.exit(1); });
