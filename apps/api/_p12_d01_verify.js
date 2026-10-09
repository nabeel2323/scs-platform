// P12 DEFECT-01 Live HTTP Verification
// Tests the IDOR fix on GET /v1/payments/:id
const { Pool } = require('pg');
const crypto = require('node:crypto');

const DATABASE_URL = 'postgresql://scs:scs_dev_2026@localhost:25433/scs_platform';
const API = 'http://localhost:3000/v1';
const SECRET = 'dev-access-secret-change-me-in-production-32chars!';

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function sign(p) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(p));
  const data = `${h}.${payload}`;
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  const uuid = () => crypto.randomUUID();

  // Seed test data
  console.log('Seeding test data...');
  const buyerA = uuid();
  const buyerB = uuid();
  const admin = uuid();
  const orgA = uuid();
  const orgB = uuid();
  const storeA = uuid();
  const storeB = uuid();

  await pool.query('BEGIN');
  try {
    // Create orgs
    await pool.query(`INSERT INTO organizations (id, name, type, country, verification_status, is_active) VALUES ($1, 'Org A - D01', 'WHOLESALER', 'SY', 'VERIFIED', true), ($2, 'Org B - D01', 'WHOLESALER', 'SY', 'VERIFIED', true)`, [orgA, orgB]);
    
    // Create stores
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a-d01', 'Store A', 'ACTIVE'), ($3, $4, 'store-b-d01', 'Store B', 'ACTIVE')`, [storeA, orgA, storeB, orgB]);
    
    // Create buyers
    await pool.query(`INSERT INTO users (id, email, full_name, phone) VALUES ($1, 'buyer-a-d01@test.com', 'Buyer A', '+963111111'), ($2, 'buyer-b-d01@test.com', 'Buyer B', '+963222222'), ($3, 'admin-d01@test.com', 'Admin', '+963333333')`, [buyerA, buyerB, admin]);
    
    // Create orders
    const moA = uuid(), moB = uuid();
    const ordA = uuid(), ordB = uuid();
    await pool.query(`INSERT INTO master_orders (id, buyer_id, status) VALUES ($1, $2, 'CONFIRMED'), ($3, $4, 'CONFIRMED')`, [moA, buyerA, moB, buyerB]);
    await pool.query(`INSERT INTO orders (id, master_order_id, buyer_id, store_id, status, subtotal_minor, delivery_fee_minor, tax_minor, total_minor, currency, fulfillment_method) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', 50000, 5000, 0, 55000, 'SYP', 'COURIER'), ($5, $6, $7, $8, 'PAYMENT_PENDING', 60000, 5000, 0, 65000, 'SYP', 'COURIER')`, [ordA, moA, buyerA, storeA, ordB, moB, buyerB, storeB]);
    
    // Create payments
    const payA = uuid(), payB = uuid();
    await pool.query(`INSERT INTO payment_records (id, order_id, provider_key, payment_method, status, amount_minor, currency, idempotency_key) VALUES ($1, $2, 'manual', 'BANK_TRANSFER', 'AWAITING_VERIFICATION', 55000, 'SYP', $3), ($4, $5, 'manual', 'CASH_ON_DELIVERY', 'AWAITING_PAYMENT', 65000, 'SYP', $6)`, [payA, ordA, `d01-${payA}`, payB, ordB, `d01-${payB}`]);
    
    await pool.query('COMMIT');
    console.log('Test data seeded');
    console.log(`  Buyer A: ${buyerA}`);
    console.log(`  Buyer B: ${buyerB}`);
    console.log(`  Payment A: ${payA} (belongs to Buyer A)`);
    console.log(`  Payment B: ${payB} (belongs to Buyer B)`);

    // Mint JWTs
    const buyerATok = sign({ sub: buyerA, role: 'BUYER', activeOrg: null, perms: ['orders:write'], sid: 'd01', jti: 'j1', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });
    const buyerBTok = sign({ sub: buyerB, role: 'BUYER', activeOrg: null, perms: ['orders:write'], sid: 'd01', jti: 'j2', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });
    const adminTok = sign({ sub: admin, role: 'ADMIN', activeOrg: orgA, perms: ['admin:payments:read','admin:payments:verify'], sid: 'd01', jti: 'j3', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });

    // Test 1: Buyer A reads own payment (should PASS)
    console.log('\n=== Test 1: Buyer A → Payment A (own) ===');
    let r = await fetch(`${API}/payments/${payA}`, { headers: { Authorization: `Bearer ${buyerATok}` } });
    console.log(`Status: ${r.status}`);
    if (r.status === 200) {
      const body = await r.json();
      console.log(`✓ PASS: Buyer A can read own payment (id=${body.id})`);
    } else {
      console.log(`✗ FAIL: Expected 200, got ${r.status}`);
    }

    // Test 2: Buyer B reads Payment A (IDOR — should DENY)
    console.log('\n=== Test 2: Buyer B → Payment A (foreign — IDOR) ===');
    r = await fetch(`${API}/payments/${payA}`, { headers: { Authorization: `Bearer ${buyerBTok}` } });
    console.log(`Status: ${r.status}`);
    if (r.status === 403 || r.status === 404) {
      console.log(`✓ PASS: Buyer B denied access to Buyer A's payment`);
    } else {
      const body = await r.json();
      console.log(`✗ FAIL: Expected 403/404, got ${r.status}`);
      console.log(`Body:`, body);
    }

    // Test 3: Buyer B reads own payment (should PASS)
    console.log('\n=== Test 3: Buyer B → Payment B (own) ===');
    r = await fetch(`${API}/payments/${payB}`, { headers: { Authorization: `Bearer ${buyerBTok}` } });
    console.log(`Status: ${r.status}`);
    if (r.status === 200) {
      const body = await r.json();
      console.log(`✓ PASS: Buyer B can read own payment (id=${body.id})`);
    } else {
      console.log(`✗ FAIL: Expected 200, got ${r.status}`);
    }

    // Test 4: Buyer A reads Payment B (IDOR — should DENY)
    console.log('\n=== Test 4: Buyer A → Payment B (foreign — IDOR) ===');
    r = await fetch(`${API}/payments/${payB}`, { headers: { Authorization: `Bearer ${buyerATok}` } });
    console.log(`Status: ${r.status}`);
    if (r.status === 403 || r.status === 404) {
      console.log(`✓ PASS: Buyer A denied access to Buyer B's payment`);
    } else {
      const body = await r.json();
      console.log(`✗ FAIL: Expected 403/404, got ${r.status}`);
      console.log(`Body:`, body);
    }

    // Test 5: Admin reads Payment A (privileged — should PASS)
    console.log('\n=== Test 5: Admin → Payment A (privileged) ===');
    r = await fetch(`${API}/payments/${payA}`, { headers: { Authorization: `Bearer ${adminTok}` } });
    console.log(`Status: ${r.status}`);
    if (r.status === 200) {
      const body = await r.json();
      console.log(`✓ PASS: Admin can read any payment (id=${body.id})`);
    } else {
      console.log(`✗ FAIL: Expected 200, got ${r.status}`);
    }

    // Test 6: Unauthenticated access (should DENY)
    console.log('\n=== Test 6: Unauthenticated → Payment A ===');
    r = await fetch(`${API}/payments/${payA}`);
    console.log(`Status: ${r.status}`);
    if (r.status === 401) {
      console.log(`✓ PASS: Unauthenticated access denied`);
    } else {
      console.log(`✗ FAIL: Expected 401, got ${r.status}`);
    }

    // Cleanup
    console.log('\nCleaning up test data...');
    await pool.query('BEGIN');
    try {
      await pool.query(`DELETE FROM payment_records WHERE id IN ($1, $2)`, [payA, payB]);
      await pool.query(`DELETE FROM orders WHERE id IN ($1, $2)`, [ordA, ordB]);
      await pool.query(`DELETE FROM master_orders WHERE id IN ($1, $2)`, [moA, moB]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [buyerA, buyerB, admin]);
      await pool.query(`DELETE FROM stores WHERE id IN ($1, $2)`, [storeA, storeB]);
      await pool.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgA, orgB]);
      await pool.query('COMMIT');
      console.log('Cleanup complete');
    } catch (e) {
      await pool.query('ROLLBACK');
      console.error('Cleanup failed:', e.message);
    }

  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('Test failed:', e.message);
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
