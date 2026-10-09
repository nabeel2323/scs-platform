// P12 DEFECT-01 Independent Re-Verification — Comprehensive Script
// Covers: §5 Security Matrix, §6 Data Leakage, §7 Privileged, §10 PostgreSQL,
//         §11 Concurrency, §12 Events/Refunds
const { Pool } = require('pg');
const crypto = require('node:crypto');

const DATABASE_URL = 'postgresql://scs:scs_dev_2026@localhost:25433/scs_platform';
const API = 'http://localhost:3000/v1';
const SECRET = 'dev-access-secret-change-me-in-production-32chars!';

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function sign(p) {
  const h = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const pl = b64url(JSON.stringify(p));
  const d = `${h}.${pl}`;
  const sig = b64url(crypto.createHmac('sha256',SECRET).update(d).digest());
  return `${d}.${sig}`;
}

const results = [];
function record(id, desc, status, pass, detail='') {
  results.push({id, desc, status, pass, detail});
  console.log(`${pass?'✓':'✗'} ${id}: ${desc} → ${status}${detail?' — '+detail:''}`);
}

async function main() {
  const pool = new Pool({connectionString: DATABASE_URL, max: 5});
  const uuid = () => crypto.randomUUID();

  // ── Seed ──────────────────────────────────────────────────────
  console.log('=== SEEDING TEST DATA ===');
  const buyerA = uuid(), buyerB = uuid(), adminUser = uuid(), modUser = uuid();
  const orgA = uuid(), orgB = uuid();
  const storeA = uuid(), storeB = uuid();
  const moA = uuid(), moB = uuid();
  const ordA = uuid(), ordB = uuid();
  const payA = uuid(), payB = uuid();

  await pool.query('BEGIN');
  try {
    await pool.query(`INSERT INTO organizations (id,name,type,country,verification_status,is_active) VALUES ($1,'RV-OrgA','WHOLESALER','SY','VERIFIED',true),($2,'RV-OrgB','RETAILER','SY','VERIFIED',true)`,[orgA,orgB]);
    await pool.query(`INSERT INTO stores (id,org_id,slug,display_name,status) VALUES ($1,$2,'rv-store-a','RV Store A','ACTIVE'),($3,$4,'rv-store-b','RV Store B','ACTIVE')`,[storeA,orgA,storeB,orgB]);
    await pool.query(`INSERT INTO users (id,email,full_name,phone) VALUES ($1,'rv-buyer-a@test.com','Buyer A','+963100001'),($2,'rv-buyer-b@test.com','Buyer B','+963100002'),($3,'rv-admin@test.com','Admin RV','+963100003'),($4,'rv-mod@test.com','Mod RV','+963100004')`,[buyerA,buyerB,adminUser,modUser]);
    await pool.query(`INSERT INTO master_orders (id,buyer_id,status) VALUES ($1,$2,'CONFIRMED'),($3,$4,'CONFIRMED')`,[moA,buyerA,moB,buyerB]);
    await pool.query(`INSERT INTO orders (id,master_order_id,buyer_id,store_id,status,subtotal_minor,delivery_fee_minor,tax_minor,total_minor,currency,fulfillment_method) VALUES ($1,$2,$3,$4,'PAYMENT_PENDING',50000,5000,0,55000,'SYP','COURIER'),($5,$6,$7,$8,'PAYMENT_PENDING',60000,5000,0,65000,'SYP','COURIER')`,[ordA,moA,buyerA,storeA,ordB,moB,buyerB,storeB]);
    await pool.query(`INSERT INTO payment_records (id,order_id,provider_key,payment_method,status,amount_minor,currency,idempotency_key) VALUES ($1,$2,'manual','BANK_TRANSFER','AWAITING_VERIFICATION',55000,'SYP',$3),($4,$5,'manual','CASH_ON_DELIVERY','CONFIRMED',65000,'SYP',$6)`,[payA,ordA,`rv-${payA}`,payB,ordB,`rv-${payB}`]);

    // Seed payment events for payA (at least 1)
    await pool.query(`INSERT INTO payment_events (payment_record_id,event_type,from_status,to_status,actor_id,actor_type) VALUES ($1,'CREATED',NULL,'AWAITING_VERIFICATION',$2,'BUYER'),($1,'PROOF_SUBMITTED','AWAITING_PAYMENT','AWAITING_VERIFICATION',$2,'BUYER')`,[payA,buyerA]);
    // Seed a refund for payB (at least 1)
    await pool.query(`INSERT INTO refunds (payment_record_id,order_id,amount_minor,currency,reason,status,requested_by,idempotency_key) VALUES ($1,$2,10000,'SYP','BUYER_REQUEST','REQUESTED',$3,$4)`,[payB,ordB,buyerB,`rv-refund-${uuid()}`]);

    await pool.query('COMMIT');
    console.log('Seeded: 2 orgs, 2 stores, 4 users, 2 orders, 2 payments, events, refund\n');
  } catch(e) { await pool.query('ROLLBACK'); throw e; }

  // ── Mint JWTs ─────────────────────────────────────────────────
  const now = Math.floor(Date.now()/1000);
  const tokBuyerA = sign({sub:buyerA,role:'BUYER',activeOrg:null,perms:['orders:write'],sid:'rv',jti:'j1',iat:now,exp:now+3600});
  const tokBuyerB = sign({sub:buyerB,role:'BUYER',activeOrg:null,perms:['orders:write'],sid:'rv',jti:'j2',iat:now,exp:now+3600});
  const tokAdmin  = sign({sub:adminUser,role:'ADMIN',activeOrg:orgA,perms:['admin:payments:read','admin:payments:verify'],sid:'rv',jti:'j3',iat:now,exp:now+3600});
  const tokMod    = sign({sub:modUser,role:'MODERATOR',activeOrg:orgA,perms:[],sid:'rv',jti:'j4',iat:now,exp:now+3600});

  // ── §10: PostgreSQL Relationship Verification ─────────────────
  console.log('=== §10: PostgreSQL Relationship Verification ===');
  const r1 = await pool.query(`SELECT pr.id as pay_id, pr.order_id, o.buyer_id, o.store_id, s.org_id FROM payment_records pr JOIN orders o ON o.id=pr.order_id JOIN stores s ON s.id=o.store_id WHERE pr.id=$1`,[payA]);
  const r2 = await pool.query(`SELECT pr.id as pay_id, pr.order_id, o.buyer_id, o.store_id, s.org_id FROM payment_records pr JOIN orders o ON o.id=pr.order_id JOIN stores s ON s.id=o.store_id WHERE pr.id=$1`,[payB]);
  const payARow = r1.rows[0], payBRow = r2.rows[0];
  record('RV-DB-01','Payment A → Order A → Buyer A → Store A → Org A',
    `${payARow.buyer_id===buyerA?'MATCH':'MISMATCH'}`,
    payARow.buyer_id===buyerA && payARow.org_id===orgA,
    `buyer=${payARow.buyer_id===buyerA?'✓':'✗'} org=${payARow.org_id===orgA?'✓':'✗'}`);
  record('RV-DB-02','Payment B → Order B → Buyer B → Store B → Org B',
    `${payBRow.buyer_id===buyerB?'MATCH':'MISMATCH'}`,
    payBRow.buyer_id===buyerB && payBRow.org_id===orgB,
    `buyer=${payBRow.buyer_id===buyerB?'✓':'✗'} org=${payBRow.org_id===orgB?'✓':'✗'}`);
  record('RV-DB-03','Orgs are isolated (A≠B)',
    `${orgA.slice(0,8)}≠${orgB.slice(0,8)}`,
    orgA!==orgB);
  // Verify events and refund exist
  const evCount = await pool.query(`SELECT count(*) FROM payment_events WHERE payment_record_id=$1`,[payA]);
  const rfCount = await pool.query(`SELECT count(*) FROM refunds WHERE payment_record_id=$1`,[payB]);
  record('RV-DB-04','Payment A has events seeded',
    `${evCount.rows[0].count} events`,
    parseInt(evCount.rows[0].count)>=1);
  record('RV-DB-05','Payment B has refund seeded',
    `${rfCount.rows[0].count} refunds`,
    parseInt(rfCount.rows[0].count)>=1);

  // ── §5: Security Matrix (D01-RV-01..10) ──────────────────────
  console.log('\n=== §5: Security Matrix ===');

  // D01-RV-01: Buyer A → Payment A (own) = 200
  let r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}});
  record('D01-RV-01','Buyer A → Payment A (own)',r.status,r.status===200);

  // D01-RV-02: Buyer B → Payment A (foreign) = 403
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerB}`}});
  record('D01-RV-02','Buyer B → Payment A (foreign)',r.status,r.status===403);

  // D01-RV-03: Buyer A → Payment B (foreign) = 403
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}});
  record('D01-RV-03','Buyer A → Payment B (foreign)',r.status,r.status===403);

  // D01-RV-04: Buyer B → Payment B (own) = 200
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokBuyerB}`}});
  record('D01-RV-04','Buyer B → Payment B (own)',r.status,r.status===200);

  // D01-RV-05: Buyer A → Payment A from another org/store context
  // Buyer A has activeOrg=null; even if we set it to orgB, buyer ownership is by sub
  const tokBuyerAOrgB = sign({sub:buyerA,role:'BUYER',activeOrg:orgB,perms:['orders:write'],sid:'rv',jti:'j5',iat:now,exp:now+3600});
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerAOrgB}`}});
  // Buyer A is still the buyer of Payment A, so 200 is correct (buyer ownership check passes)
  record('D01-RV-05','Buyer A (activeOrg=OrgB) → Payment A',r.status,r.status===200,
    'buyer ownership by sub, not org');

  // D01-RV-06: Buyer B → Payment A cross-org = 403
  const tokBuyerBOrgA = sign({sub:buyerB,role:'BUYER',activeOrg:orgA,perms:['orders:write'],sid:'rv',jti:'j6',iat:now,exp:now+3600});
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerBOrgA}`}});
  record('D01-RV-06','Buyer B (activeOrg=OrgA) → Payment A',r.status,r.status===403,
    'buyer B is not buyer of payA, org fallback fails (storeA∈orgA but buyer check fails first)');

  // D01-RV-07: ADMIN → Payment A = 200
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokAdmin}`}});
  record('D01-RV-07','ADMIN → Payment A (privileged)',r.status,r.status===200);

  // D01-RV-08: MODERATOR → Payment A = 200
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokMod}`}});
  record('D01-RV-08','MODERATOR → Payment A (privileged)',r.status,r.status===200);

  // D01-RV-09: Unauthenticated → Payment A = 401
  r = await fetch(`${API}/payments/${payA}`);
  record('D01-RV-09','Unauthenticated → Payment A',r.status,r.status===401);

  // D01-RV-10: Invalid/nonexistent UUID = existing behavior (no info leak)
  const fakeUuid = crypto.randomUUID();
  r = await fetch(`${API}/payments/${fakeUuid}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}});
  record('D01-RV-10','Nonexistent UUID → no info leak',r.status,r.status===404,
    `expected 404`);

  // ── §6: Data Leakage Verification ─────────────────────────────
  console.log('\n=== §6: Data Leakage Verification ===');
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerB}`}});
  const leakBody = await r.json();
  const leakFields = ['id','orderId','amountMinor','currency','paymentMethod','status','receiptUrl','receiptReference','verifiedBy','events','refunds'];
  const leaked = leakFields.filter(f => leakBody[f] !== undefined);
  record('RV-LEAK-01','403 body contains no payment fields',
    `fields=${leaked.length}`,
    leaked.length===0,
    leaked.length===0?'clean':'LEAKED: '+leaked.join(','));

  // Also check Buyer A → Payment B
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}});
  const leakBody2 = await r.json();
  const leaked2 = leakFields.filter(f => leakBody2[f] !== undefined);
  record('RV-LEAK-02','403 body (A→B) contains no payment fields',
    `fields=${leaked2.length}`,
    leaked2.length===0,
    leaked2.length===0?'clean':'LEAKED: '+leaked2.join(','));

  // ── §7: Privileged Access Verification ────────────────────────
  console.log('\n=== §7: Privileged Access ===');
  // ADMIN → both payments
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokAdmin}`}});
  record('RV-PRIV-01','ADMIN → Payment A',r.status,r.status===200);
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokAdmin}`}});
  record('RV-PRIV-02','ADMIN → Payment B',r.status,r.status===200);
  // MODERATOR → both payments
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokMod}`}});
  record('RV-PRIV-03','MODERATOR → Payment A',r.status,r.status===200);
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokMod}`}});
  record('RV-PRIV-04','MODERATOR → Payment B',r.status,r.status===200);

  // ── §12: Events/Refunds Authorization ─────────────────────────
  console.log('\n=== §12: Events/Refunds Authorization ===');
  // Buyer A reads Payment A (own) — should see events
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}});
  const bodyA = await r.json();
  const hasEvents = Array.isArray(bodyA.events) && bodyA.events.length >= 1;
  record('RV-EVT-01','Buyer A sees Payment A events',
    `events=${bodyA.events?.length||0}`,
    r.status===200 && hasEvents);

  // Buyer B reads Payment A (denied) — must NOT see events
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerB}`}});
  const bodyDeny = await r.json();
  record('RV-EVT-02','Buyer B cannot see Payment A events',
    `status=${r.status}, events=${bodyDeny.events?.length??'absent'}`,
    r.status===403 && !bodyDeny.events);

  // Buyer B reads Payment B (own) — should see refunds
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokBuyerB}`}});
  const bodyB = await r.json();
  const hasRefunds = Array.isArray(bodyB.refunds) && bodyB.refunds.length >= 1;
  record('RV-EVT-03','Buyer B sees Payment B refunds',
    `refunds=${bodyB.refunds?.length||0}`,
    r.status===200 && hasRefunds);

  // Buyer A reads Payment B (denied) — must NOT see refunds
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}});
  const bodyDeny2 = await r.json();
  record('RV-EVT-04','Buyer A cannot see Payment B refunds',
    `status=${r.status}, refunds=${bodyDeny2.refunds?.length??'absent'}`,
    r.status===403 && !bodyDeny2.refunds);

  // ── §11: Concurrency/Race Check ───────────────────────────────
  console.log('\n=== §11: Concurrency/Race Check (50 concurrent per caller) ===');
  const N = 50;

  // Buyer A → Payment A (should all be 200)
  const promisesA = Array.from({length:N}, () =>
    fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerA}`}}).then(r=>r.status));
  const statusesA = await Promise.all(promisesA);
  const okA = statusesA.filter(s=>s===200).length;
  record('RV-CONC-01',`Buyer A → Payment A (${N} concurrent)`,
    `200×${okA}/${N}`,
    okA===N,
    `${okA===N?'all authorized':'FAIL: '+((N-okA)+' denied')}`);

  // Buyer B → Payment A (should all be 403)
  const promisesB = Array.from({length:N}, () =>
    fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerB}`}}).then(r=>r.status));
  const statusesB = await Promise.all(promisesB);
  const denyB = statusesB.filter(s=>s===403).length;
  const leakB = statusesB.filter(s=>s===200).length;
  record('RV-CONC-02',`Buyer B → Payment A (${N} concurrent)`,
    `403×${denyB}/${N}, 200×${leakB}`,
    denyB===N && leakB===0,
    `${leakB===0?'ZERO unauthorized reads':'FAIL: '+leakB+' unauthorized reads!'}`);

  // Cross-org: Buyer B (activeOrg=orgA) → Payment A (should all be 403)
  const promisesC = Array.from({length:N}, () =>
    fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBuyerBOrgA}`}}).then(r=>r.status));
  const statusesC = await Promise.all(promisesC);
  const denyC = statusesC.filter(s=>s===403).length;
  const leakC = statusesC.filter(s=>s===200).length;
  record('RV-CONC-03',`Buyer B (orgA) → Payment A (${N} concurrent cross-org)`,
    `403×${denyC}/${N}, 200×${leakC}`,
    denyC===N && leakC===0,
    `${leakC===0?'ZERO unauthorized reads':'FAIL: '+leakC+' unauthorized reads!'}`);

  // ── Cleanup ───────────────────────────────────────────────────
  console.log('\n=== CLEANUP ===');
  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM refunds WHERE payment_record_id=$1`,[payB]);
    await pool.query(`DELETE FROM payment_events WHERE payment_record_id=$1`,[payA]);
    await pool.query(`DELETE FROM payment_records WHERE id IN ($1,$2)`,[payA,payB]);
    await pool.query(`DELETE FROM orders WHERE id IN ($1,$2)`,[ordA,ordB]);
    await pool.query(`DELETE FROM master_orders WHERE id IN ($1,$2)`,[moA,moB]);
    await pool.query(`DELETE FROM users WHERE id IN ($1,$2,$3,$4)`,[buyerA,buyerB,adminUser,modUser]);
    await pool.query(`DELETE FROM stores WHERE id IN ($1,$2)`,[storeA,storeB]);
    await pool.query(`DELETE FROM organizations WHERE id IN ($1,$2)`,[orgA,orgB]);
    await pool.query('COMMIT');
    console.log('Cleanup complete');
  } catch(e) { await pool.query('ROLLBACK'); console.error('Cleanup failed:',e.message); }

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  const total = results.length;
  const passed = results.filter(r=>r.pass).length;
  const failed = results.filter(r=>!r.pass).length;
  console.log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFAILED:');
    results.filter(r=>!r.pass).forEach(r => console.log(`  ${r.id}: ${r.desc} → ${r.status} ${r.detail}`));
  }
  console.log(`\nForeign buyer successful reads = 0: ${leakB===0 && leakC===0 ? 'CONFIRMED' : 'VIOLATED'}`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
