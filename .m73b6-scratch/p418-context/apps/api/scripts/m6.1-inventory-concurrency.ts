/**
 * M6.1 — Inventory Concurrency Stress Test
 *
 * Proves that PostgreSQL SELECT ... FOR UPDATE serialization inside
 * reserveStock() prevents over-reservation under true concurrent load.
 *
 * Test 1: stock=100, 100 concurrent reservations × qty 2 → max reserved = 100
 * Test 2: stock=10,  50 concurrent reservations × qty 1 → exactly 10 succeed, 40 rejected
 * Test 3: mixed reserve/release race → qtyReserved stays in [0, qtyOnHand]
 *
 * Verifies final DB state directly via psql.
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'node:crypto';

const API = 'http://localhost:3000/v1';
const DB_URL = 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform';

const pool = new Pool({ connectionString: DB_URL });

// ── Auth helper ─────────────────────────────────────────────

async function getToken(email: string, password: string, phone: string): Promise<string> {
  const redis = new Redis('redis://localhost:6379');
  const loginRes = await fetch(`${API}/auth/login/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceId: 'm61-stress-' + email }),
  });
  const loginData = await loginRes.json() as any;
  if (loginData.accessToken) { await redis.quit(); return loginData.accessToken; }
  await fetch(`${API}/auth/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const otp = await redis.get(`otp:${phone}`);
  await redis.quit();
  if (!otp) throw new Error('Could not read OTP');
  const verifyRes = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp, deviceId: 'm61-stress-' + email, deviceInfo: { platform: 'web', userAgent: 'M6.1-Stress/1.0' } }),
  });
  const verifyData = await verifyRes.json() as any;
  if (!verifyData.accessToken) throw new Error('OTP verify failed');
  return verifyData.accessToken;
}

function auth(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }

// ── API helpers ─────────────────────────────────────────────

async function apiPost(token: string, path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

// ── Setup: create inventory item ────────────────────────────

async function setupInventory(token: string, warehouseId: string, variantId: string, qty: number): Promise<string> {
  const { status, data } = await apiPost(token, '/inventory', {
    warehouseId,
    variantId,
    qtyOnHand: qty,
    reorderPoint: 5,
  });
  if (status !== 201 && status !== 200) throw new Error(`Create inventory failed: ${status} ${JSON.stringify(data)}`);
  return data.id;
}

async function getInventoryState(inventoryItemId: string): Promise<{ qtyOnHand: number; qtyReserved: number }> {
  const { rows } = await pool.query(
    'SELECT qty_on_hand, qty_reserved FROM inventory_items WHERE id = $1',
    [inventoryItemId]
  );
  if (!rows[0]) throw new Error('Inventory item not found');
  return { qtyOnHand: rows[0].qty_on_hand, qtyReserved: rows[0].qty_reserved };
}

async function getMovementCount(inventoryItemId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*) FROM stock_movements WHERE inventory_item_id = $1',
    [inventoryItemId]
  );
  return parseInt(rows[0].count, 10);
}

// ── Test 1: 100 concurrent × qty 2 on stock=100 ────────────

async function test1(token: string, inventoryItemId: string): Promise<{ passed: boolean; details: string }> {
  console.log('\n═══ TEST 1: stock=100, 100 concurrent reservations × qty 2 ═══');

  // Reset to 100 on hand, 0 reserved
  await pool.query(
    'UPDATE inventory_items SET qty_on_hand = 100, qty_reserved = 0 WHERE id = $1',
    [inventoryItemId]
  );
  // Clear movements for this test
  await pool.query('DELETE FROM stock_movements WHERE inventory_item_id = $1', [inventoryItemId]);

  const promises: Promise<{ status: number; data: any }>[] = [];
  for (let i = 0; i < 100; i++) {
    promises.push(apiPost(token, '/inventory/reserve', {
      inventoryItemId,
      quantity: 2,
      referenceId: crypto.randomUUID(),
      movementType: 'RESERVE',
    }));
  }

  const results = await Promise.all(promises);
  const succeeded = results.filter(r => r.status === 200 || r.status === 201).length;
  const rejected = results.filter(r => r.status === 400).length;
  const other = results.filter(r => r.status !== 200 && r.status !== 201 && r.status !== 400).length;

  const state = await getInventoryState(inventoryItemId);
  const movements = await getMovementCount(inventoryItemId);

  console.log(`  Succeeded: ${succeeded}, Rejected: ${rejected}, Other: ${other}`);
  console.log(`  Final: qtyOnHand=${state.qtyOnHand}, qtyReserved=${state.qtyReserved}`);
  console.log(`  Movements: ${movements}`);

  const pass = state.qtyReserved <= state.qtyOnHand
    && state.qtyReserved >= 0
    && state.qtyReserved === succeeded * 2
    && movements === succeeded
    && other === 0;

  return {
    passed: pass,
    details: `succeeded=${succeeded} rejected=${rejected} other=${other} reserved=${state.qtyReserved} onHand=${state.qtyOnHand} movements=${movements}`,
  };
}

// ── Test 2: 50 concurrent × qty 1 on stock=10 ──────────────

async function test2(token: string, inventoryItemId: string): Promise<{ passed: boolean; details: string }> {
  console.log('\n═══ TEST 2: stock=10, 50 concurrent reservations × qty 1 ═══');

  await pool.query(
    'UPDATE inventory_items SET qty_on_hand = 10, qty_reserved = 0 WHERE id = $1',
    [inventoryItemId]
  );
  await pool.query('DELETE FROM stock_movements WHERE inventory_item_id = $1', [inventoryItemId]);

  const promises: Promise<{ status: number; data: any }>[] = [];
  for (let i = 0; i < 50; i++) {
    promises.push(apiPost(token, '/inventory/reserve', {
      inventoryItemId,
      quantity: 1,
      referenceId: crypto.randomUUID(),
      movementType: 'RESERVE',
    }));
  }

  const results = await Promise.all(promises);
  const succeeded = results.filter(r => r.status === 200 || r.status === 201).length;
  const rejected = results.filter(r => r.status === 400).length;
  const other = results.filter(r => r.status !== 200 && r.status !== 201 && r.status !== 400).length;

  const state = await getInventoryState(inventoryItemId);
  const movements = await getMovementCount(inventoryItemId);

  console.log(`  Succeeded: ${succeeded}, Rejected: ${rejected}, Other: ${other}`);
  console.log(`  Final: qtyOnHand=${state.qtyOnHand}, qtyReserved=${state.qtyReserved}`);
  console.log(`  Movements: ${movements}`);

  const pass = succeeded === 10
    && rejected === 40
    && state.qtyReserved === 10
    && state.qtyOnHand === 10
    && movements === 10
    && other === 0;

  return {
    passed: pass,
    details: `succeeded=${succeeded} rejected=${rejected} other=${other} reserved=${state.qtyReserved} onHand=${state.qtyOnHand} movements=${movements}`,
  };
}

// ── Test 3: mixed reserve/release race ──────────────────────

async function test3(token: string, inventoryItemId: string): Promise<{ passed: boolean; details: string }> {
  console.log('\n═══ TEST 3: mixed reserve/release race ═══');

  await pool.query(
    'UPDATE inventory_items SET qty_on_hand = 50, qty_reserved = 0 WHERE id = $1',
    [inventoryItemId]
  );
  await pool.query('DELETE FROM stock_movements WHERE inventory_item_id = $1', [inventoryItemId]);

  // Fire 40 reserves and 20 releases interleaved
  const promises: Promise<{ status: number; data: any }>[] = [];
  for (let i = 0; i < 60; i++) {
    if (i % 3 === 2) {
      // Release (every 3rd)
      promises.push(apiPost(token, '/inventory/release', {
        inventoryItemId,
        quantity: 1,
        referenceId: crypto.randomUUID(),
        movementType: 'RELEASE',
      }));
    } else {
      // Reserve
      promises.push(apiPost(token, '/inventory/reserve', {
        inventoryItemId,
        quantity: 1,
        referenceId: crypto.randomUUID(),
        movementType: 'RESERVE',
      }));
    }
  }

  const results = await Promise.all(promises);
  const reserveOk = results.filter((r, i) => i % 3 !== 2 && (r.status === 200 || r.status === 201)).length;
  const releaseOk = results.filter((r, i) => i % 3 === 2 && (r.status === 200 || r.status === 201)).length;

  const state = await getInventoryState(inventoryItemId);

  console.log(`  Reserves OK: ${reserveOk}/40, Releases OK: ${releaseOk}/20`);
  console.log(`  Final: qtyOnHand=${state.qtyOnHand}, qtyReserved=${state.qtyReserved}`);

  // qtyReserved must be in [0, qtyOnHand]
  const pass = state.qtyReserved >= 0
    && state.qtyReserved <= state.qtyOnHand
    && state.qtyOnHand === 50;

  return {
    passed: pass,
    details: `reservesOk=${reserveOk}/40 releasesOk=${releaseOk}/20 reserved=${state.qtyReserved} onHand=${state.qtyOnHand}`,
  };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('M6.1 Inventory Concurrency Stress Test');
  console.log('======================================');

  // Login as admin (has all permissions)
  const token = await getToken('admin@scsp.dev', 'Admin@2026!', '+10000000000');
  console.log('Authenticated as admin');

  // We need a warehouse and variant. Use existing or create.
  const { rows: whRows } = await pool.query('SELECT id FROM warehouses LIMIT 1');
  if (!whRows[0]) throw new Error('No warehouse found. Run M6 setup first.');
  const warehouseId = whRows[0].id;

  const { rows: varRows } = await pool.query('SELECT id FROM product_variants LIMIT 1');
  if (!varRows[0]) throw new Error('No variant found. Run M6 setup first.');
  const variantId = varRows[0].id;

  console.log(`Using warehouse: ${warehouseId}`);
  console.log(`Using variant: ${variantId}`);

  // Create a fresh inventory item for stress testing
  const invId = await setupInventory(token, warehouseId, variantId, 100);
  console.log(`Inventory item: ${invId}`);

  // Run tests
  const r1 = await test1(token, invId);
  const r2 = await test2(token, invId);
  const r3 = await test3(token, invId);

  // Final DB verification
  console.log('\n═══ DB VERIFICATION ═══');
  const finalState = await getInventoryState(invId);
  const finalMovements = await getMovementCount(invId);
  console.log(`Final state: qtyOnHand=${finalState.qtyOnHand}, qtyReserved=${finalState.qtyReserved}`);
  console.log(`Total movements: ${finalMovements}`);

  // Check no negative values
  const { rows: negRows } = await pool.query(
    'SELECT COUNT(*) FROM inventory_items WHERE qty_on_hand < 0 OR qty_reserved < 0'
  );
  const negCount = parseInt(negRows[0].count, 10);

  // Check movement ledger consistency
  const { rows: movSumRows } = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN movement_type = 'RESERVE' THEN quantity WHEN movement_type = 'SALE' THEN quantity ELSE 0 END), 0) as total_reserved,
      COALESCE(SUM(CASE WHEN movement_type = 'RELEASE' THEN quantity ELSE 0 END), 0) as total_released
    FROM stock_movements WHERE inventory_item_id = $1
  `, [invId]);
  console.log(`Ledger: total_reserved=${movSumRows[0].total_reserved}, total_released=${movSumRows[0].total_released}`);

  console.log('\n═══ RESULTS ═══');
  console.log(`Test 1 (100×2 on 100): ${r1.passed ? 'PASS' : 'FAIL'} — ${r1.details}`);
  console.log(`Test 2 (50×1 on 10):   ${r2.passed ? 'PASS' : 'FAIL'} — ${r2.details}`);
  console.log(`Test 3 (mixed race):    ${r3.passed ? 'PASS' : 'FAIL'} — ${r3.details}`);
  console.log(`No negative values:     ${negCount === 0 ? 'PASS' : 'FAIL'} — negatives=${negCount}`);

  const allPass = r1.passed && r2.passed && r3.passed && negCount === 0;
  console.log(`\nOVERALL: ${allPass ? 'ALL PASS ✓' : 'SOME FAILED ✗'}`);

  // Cleanup: reset inventory item to neutral state
  await pool.query(
    'UPDATE inventory_items SET qty_on_hand = 0, qty_reserved = 0 WHERE id = $1',
    [invId]
  );

  await pool.end();
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  pool.end();
  process.exit(1);
});
