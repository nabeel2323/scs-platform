/**
 * Diagnostic: capture exact error responses for the 9 failing M6 tests.
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'node:crypto';

const API = 'http://localhost:3000/v1';
const DB_URL = 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform';

async function getToken(email: string, password: string, phone: string): Promise<string> {
  const redis = new Redis('redis://localhost:6379');
  const loginRes = await fetch(`${API}/auth/login/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceId: 'm6-diag-' + email }),
  });
  const loginData = await loginRes.json() as any;
  if (loginData.accessToken) { await redis.quit(); return loginData.accessToken; }
  await fetch(`${API}/auth/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const otp = await redis.get(`otp:${phone}`);
  await redis.quit();
  if (!otp) throw new Error('No OTP');
  const verifyRes = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp, deviceId: 'm6-diag-' + email, deviceInfo: { platform: 'web', userAgent: 'M6-Diag/1.0' } }),
  });
  const vd = await verifyRes.json() as any;
  return vd.accessToken;
}

function auth(t: string) { return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }; }
async function api(m: string, p: string, t: string, b?: any) {
  const r = await fetch(`${API}${p}`, { method: m, headers: auth(t), body: b ? JSON.stringify(b) : undefined });
  const text = await r.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  const adminToken = await getToken('admin@scsp.dev', 'Admin@2026!', '+10000000000');
  const adminPayload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString());
  console.log('Admin role:', adminPayload.role, 'org:', adminPayload.activeOrg?.substring(0, 8));

  // Get existing infrastructure from the previous run
  const stores = await pool.query('SELECT id, display_name, org_id FROM stores ORDER BY display_name');
  console.log('\nStores:');
  for (const s of stores.rows) console.log(`  ${s.id.substring(0,8)} ${s.display_name} org=${s.org_id?.substring(0,8)}`);

  const offers = await pool.query('SELECT id, store_id, variant_id, product_id, status, base_price_minor, moq FROM merchant_offers');
  console.log('\nOffers:');
  for (const o of offers.rows) console.log(`  ${o.id.substring(0,8)} store=${o.store_id.substring(0,8)} var=${o.variant_id?.substring(0,8)} prod=${o.product_id.substring(0,8)} ${o.status} price=${o.base_price_minor} moq=${o.moq}`);

  const inv = await pool.query('SELECT id, variant_id, warehouse_id, qty_on_hand, qty_reserved FROM inventory_items');
  console.log('\nInventory:');
  for (const r of inv.rows) console.log(`  ${r.id.substring(0,8)} var=${r.variant_id.substring(0,8)} wh=${r.warehouse_id.substring(0,8)} onHand=${r.qty_on_hand} reserved=${r.qty_reserved}`);

  const wh = await pool.query('SELECT id, store_id, name FROM warehouses');
  console.log('\nWarehouses:');
  for (const w of wh.rows) console.log(`  ${w.id.substring(0,8)} store=${w.store_id.substring(0,8)} ${w.name}`);

  // ── Test 1: Inventory reservation with valid UUID referenceId ──
  console.log('\n=== TEST: Stock reservation with UUID referenceId ===');
  const invItemId = inv.rows[0]?.id;
  if (invItemId) {
    const testRefId = crypto.randomUUID();
    const res1 = await api('POST', '/inventory/reserve', adminToken, {
      inventoryItemId: invItemId, quantity: 5, referenceType: 'SALE', referenceId: testRefId,
    });
    console.log('  Reserve (UUID ref):', res1.status, JSON.stringify(res1.data).substring(0, 300));

    if (res1.status === 201) {
      // Release it back
      const rel1 = await api('POST', '/inventory/release', adminToken, {
        inventoryItemId: invItemId, quantity: 5, referenceType: 'SALE', referenceId: testRefId,
      });
      console.log('  Release:', rel1.status, JSON.stringify(rel1.data).substring(0, 200));
    }

    // Also test without referenceId
    const res2 = await api('POST', '/inventory/reserve', adminToken, {
      inventoryItemId: invItemId, quantity: 3,
    });
    console.log('  Reserve (no ref):', res2.status, JSON.stringify(res2.data).substring(0, 300));
    if (res2.status === 201) {
      const rel2 = await api('POST', '/inventory/release', adminToken, {
        inventoryItemId: invItemId, quantity: 3,
      });
      console.log('  Release:', rel2.status);
    }
  }

  // ── Test 2: Cart add with competing offers ──
  console.log('\n=== TEST: Cart add competing offers ===');
  // Find two ACTIVE offers for the same variant from different stores
  const competingOffers = await pool.query(`
    SELECT mo.id, mo.store_id, mo.variant_id, mo.product_id, mo.status, mo.moq, s.display_name
    FROM merchant_offers mo
    JOIN stores s ON s.id = mo.store_id
    WHERE mo.status = 'ACTIVE' AND mo.variant_id IS NOT NULL
    ORDER BY mo.variant_id, mo.store_id
  `);
  console.log('Active variant-scoped offers:');
  const offerMap = new Map<string, any[]>();
  for (const o of competingOffers.rows) {
    console.log(`  ${o.id.substring(0,8)} store=${o.display_name} var=${o.variant_id.substring(0,8)} moq=${o.moq}`);
    const key = o.variant_id;
    if (!offerMap.has(key)) offerMap.set(key, []);
    offerMap.get(key)!.push(o);
  }

  // Find a variant with 2+ offers from different stores
  let testVariant: string | null = null;
  let testOffers: any[] = [];
  for (const [varId, offs] of offerMap) {
    const uniqueStores = new Set(offs.map(o => o.store_id));
    if (uniqueStores.size >= 2) {
      testVariant = varId;
      testOffers = offs;
      break;
    }
  }

  if (testVariant && testOffers.length >= 2) {
    // Create a buyer
    const buyerId = crypto.randomUUID();
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('DiagBuyer@2026!', 10);
    try {
      await pool.query(
        `INSERT INTO users (id, phone, email, full_name, status, password_hash, password_set_at, email_verified_at) VALUES ($1,'+96650000098','diag-buyer@scsp.dev','Diag Buyer','ACTIVE',$2,NOW(),NOW())`,
        [buyerId, hash],
      );
    } catch (e: any) {
      if (e.code === '23505') {
        // User exists, get id
        const existing = await pool.query("SELECT id FROM users WHERE email = 'diag-buyer@scsp.dev'");
        // Use the existing user
      } else {
        console.log('  User creation error:', e.message);
      }
    }

    const buyerToken = await getToken('diag-buyer@scsp.dev', 'DiagBuyer@2026!', '+96650000098');

    // Clear cart first
    const clearRes = await api('DELETE', '/cart', buyerToken);
    console.log('  Clear cart:', clearRes.status);

    // Add first offer
    const add1 = await api('POST', '/cart/items', buyerToken, {
      variantId: testVariant, quantity: 1, offerId: testOffers[0].id,
    });
    console.log(`  Add offer 1 (${testOffers[0].display_name}):`, add1.status, JSON.stringify(add1.data).substring(0, 200));

    // Add second offer (same variant, different store)
    const add2 = await api('POST', '/cart/items', buyerToken, {
      variantId: testVariant, quantity: 1, offerId: testOffers[1].id,
    });
    console.log(`  Add offer 2 (${testOffers[1].display_name}):`, add2.status, JSON.stringify(add2.data).substring(0, 400));

    // Check cart
    const cart = await api('GET', '/cart', buyerToken);
    const items = cart.data?.items || [];
    console.log(`  Cart items: ${items.length}`);
    for (const i of items) {
      console.log(`    ${i.id?.substring(0,8)} variant=${i.variantId?.substring(0,8)} offer=${i.offerId?.substring(0,8)} store=${i.storeId?.substring(0,8)} qty=${i.quantity} price=${i.priceMinor}`);
    }
  } else {
    console.log('  No variant with 2+ competing offers found');
  }

  // ── Test 3: IDOR — inventory read isolation ──
  console.log('\n=== TEST: IDOR inventory read ===');
  // Check what permissions MERCHANT_OWNER has
  const perms = await pool.query(`
    SELECT p.key FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.key = 'MERCHANT_OWNER' AND p.key LIKE 'merchant:%'
    ORDER BY p.key
  `);
  console.log('MERCHANT_OWNER merchant permissions:', perms.rows.map((r: any) => r.key));

  // Check the inventory list endpoint — does it verify store ownership?
  // The route is GET /stores/:storeId/inventory with merchant:inventory:read permission
  // But it doesn't call assertStoreInOrg — any merchant with the permission can read any store
  if (stores.rows.length >= 2) {
    const merchantToken = await getToken('merchant-a@scsp.dev', 'MerchantA@2026!', '+96650000001');
    const storeBId = stores.rows.find((s: any) => s.display_name === 'Merchant B Store')?.id;
    if (storeBId) {
      const idor = await api('GET', `/stores/${storeBId}/inventory`, merchantToken);
      console.log(`  Merchant A reading Store B inventory: ${idor.status} items=${Array.isArray(idor.data) ? idor.data.length : '?'}`);
    }
  }

  // ── Test 4: Idempotency ──
  console.log('\n=== TEST: Idempotency ===');
  // Check master_orders table for idempotency_key column
  const moCols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'master_orders' ORDER BY ordinal_position`);
  console.log('master_orders columns:', moCols.rows.map((r: any) => `${r.column_name}(${r.data_type})`).join(', '));

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
