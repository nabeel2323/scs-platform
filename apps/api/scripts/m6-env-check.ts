/**
 * M6 Environment & Catalog Baseline Check
 * Full auth flow: password login → OTP request → OTP verify → baseline queries.
 */
import Redis from 'ioredis';

const API = 'http://localhost:3000/v1';
const EMAIL = 'admin@scsp.dev';
const PASSWORD = 'Admin@2026!';
const PHONE = '+10000000000';
const DEVICE_ID = 'm6-env-check-device';

async function main() {
  const redis = new Redis('redis://localhost:6379');

  // 1. Password login (will require OTP)
  console.log('=== AUTH ===');
  const loginRes = await fetch(`${API}/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, deviceId: DEVICE_ID }),
  });
  const loginData = await loginRes.json() as any;
  console.log(`Login: ${loginRes.status} requiresOtp=${loginData.requiresOtp}`);

  let token: string;
  if (loginData.accessToken) {
    token = loginData.accessToken;
  } else {
    // 2. Request OTP
    const otpReqRes = await fetch(`${API}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: PHONE }),
    });
    console.log(`OTP request: ${otpReqRes.status}`);

    // 3. Read OTP from Redis immediately
    const otp = await redis.get(`otp:${PHONE}`);
    if (!otp) {
      console.log('FATAL: Could not read OTP from Redis');
      await redis.quit();
      process.exit(1);
    }
    console.log(`OTP read from Redis: ${otp}`);

    // 4. Verify OTP
    const otpVerifyRes = await fetch(`${API}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: PHONE, otp, deviceId: DEVICE_ID, deviceInfo: { platform: 'web', userAgent: 'M6-UAT-Script/1.0' } }),
    });
    const otpVerifyData = await otpVerifyRes.json() as any;
    if (!otpVerifyData.accessToken) {
      console.log('OTP verify FAILED:', otpVerifyRes.status, JSON.stringify(otpVerifyData).substring(0, 200));
      await redis.quit();
      process.exit(1);
    }
    token = otpVerifyData.accessToken;
    console.log('OTP verify: OK');
  }

  await redis.quit();

  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  console.log(`  User: ${payload.sub}, Org: ${payload.activeOrg}, Role: ${payload.role}`);
  const auth = { Authorization: `Bearer ${token}` };

  // 5. Catalog baseline
  console.log('\n=== CATALOG BASELINE ===');
  const endpoints: [string, string, (d: any) => number | string][] = [
    ['Categories', '/admin/categories', (d) => Array.isArray(d) ? d.length : (d.total ?? d.length ?? '?')],
    ['Product Types', '/admin/product-types', (d) => Array.isArray(d) ? d.length : (d.total ?? d.length ?? '?')],
    ['Products', '/admin/products?limit=100', (d) => d.items?.length ?? d.length ?? '?'],
  ];
  for (const [label, ep, countFn] of endpoints) {
    try {
      const r = await fetch(`${API}${ep}`, { headers: auth });
      const d = await r.json() as any;
      console.log(`  ${label}: ${countFn(d)}`);
    } catch (e: any) {
      console.log(`  ${label}: ERROR - ${e.message}`);
    }
  }

  // 6. Products + Variants detail
  console.log('\n=== PRODUCTS & VARIANTS ===');
  try {
    const prodRes = await fetch(`${API}/admin/products?limit=100`, { headers: auth });
    const prodData = await prodRes.json() as any;
    const products = prodData.items || prodData;
    if (Array.isArray(products)) {
      console.log(`  Total products: ${products.length}`);
      let totalVariants = 0;
      for (const p of products) {
        const varRes = await fetch(`${API}/admin/products/${p.id}/variants`, { headers: auth });
        const variants = await varRes.json() as any;
        const varArr = Array.isArray(variants) ? variants : (variants.items || []);
        totalVariants += varArr.length;
        console.log(`  ${p.id?.substring(0, 8)}... | ${(p.title || '').substring(0, 40)} | status=${p.status} | store=${p.storeId ? 'owned' : 'canonical'} | variants=${varArr.length}`);
      }
      console.log(`  Total variants: ${totalVariants}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // 7. Merchant infrastructure
  console.log('\n=== MERCHANT INFRASTRUCTURE ===');
  try {
    const storesRes = await fetch(`${API}/admin/stores`, { headers: auth });
    const storesData = await storesRes.json() as any;
    const storesArr = Array.isArray(storesData) ? storesData : (storesData.items || storesData.data || []);
    console.log(`  Stores: ${storesArr.length}`);
    for (const s of storesArr) {
      console.log(`    ${s.id?.substring(0, 8)}... | ${s.displayName} | org=${s.orgId?.substring(0, 8)} | status=${s.status} | ver=${s.verificationStatus}`);
    }
  } catch (e: any) {
    console.log(`  Stores: ERROR - ${e.message}`);
  }

  // 8. Offers, Inventory, Orders
  console.log('\n=== MARKETPLACE DATA ===');
  const marketEndpoints: [string, string][] = [
    ['Merchant Offers', '/merchant/offers'],
    ['Warehouses', '/admin/warehouses'],
    ['Inventory Items (low-stock)', '/inventory/low-stock'],
    ['Master Orders', '/admin/master-orders'],
    ['Carts', '/admin/carts'],
  ];
  for (const [label, ep] of marketEndpoints) {
    try {
      const r = await fetch(`${API}${ep}`, { headers: auth });
      const d = await r.json() as any;
      const arr = Array.isArray(d) ? d : (d.items || d.data || []);
      console.log(`  ${label}: ${arr.length}`);
    } catch (e: any) {
      console.log(`  ${label}: ERROR - ${e.message}`);
    }
  }

  // 9. DB direct count via API (price lists, etc.)
  console.log('\n=== PRICING DATA ===');
  try {
    const plRes = await fetch(`${API}/admin/price-lists`, { headers: auth });
    const plData = await plRes.json() as any;
    const plArr = Array.isArray(plData) ? plData : (plData.items || plData.data || []);
    console.log(`  Price Lists: ${plArr.length}`);
  } catch (e: any) {
    console.log(`  Price Lists: ERROR - ${e.message}`);
  }

  console.log('\n=== ENVIRONMENT SUMMARY ===');
  console.log(`  Git: ba6f9f9 (develop)`);
  console.log(`  Node: ${process.version}`);
  console.log(`  API: ${API}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
