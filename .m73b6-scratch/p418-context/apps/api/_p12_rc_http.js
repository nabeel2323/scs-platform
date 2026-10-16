// P12 Release Closure — HTTP Release Matrix + IDOR Final Check
// Covers §6 (HTTP matrix), §7 (IDOR final), §12 (security), §13 (read paths)
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

const R = [];
function rec(id, desc, status, pass, detail='') {
  R.push({id,desc,status,pass,detail});
  console.log(`${pass?'✓':'✗'} ${id}: ${desc} → ${status}${detail?' — '+detail:''}`);
}

async function main() {
  const pool = new Pool({connectionString: DATABASE_URL, max: 5});
  const uuid = () => crypto.randomUUID();

  // ── Seed ──────────────────────────────────────────────────────
  console.log('=== SEEDING RELEASE VERIFICATION DATA ===');
  const buyerA=uuid(), buyerB=uuid(), adminU=uuid(), modU=uuid(), merchU=uuid();
  const orgA=uuid(), orgB=uuid();
  const storeA=uuid(), storeB=uuid();
  const moA=uuid(), moB=uuid(), moC=uuid();
  const ordA=uuid(), ordB=uuid(), ordC=uuid();
  const payA=uuid(), payB=uuid(), payC=uuid();

  await pool.query('BEGIN');
  try {
    await pool.query(`INSERT INTO organizations(id,name,type,country,verification_status,is_active)VALUES($1,'RC-OrgA','WHOLESALER','SY','VERIFIED',true),($2,'RC-OrgB','RETAILER','SY','VERIFIED',true)`,[orgA,orgB]);
    await pool.query(`INSERT INTO stores(id,org_id,slug,display_name,status)VALUES($1,$2,'rc-store-a','RC Store A','ACTIVE'),($3,$4,'rc-store-b','RC Store B','ACTIVE')`,[storeA,orgA,storeB,orgB]);
    await pool.query(`INSERT INTO users(id,email,full_name,phone)VALUES($1,'rc-ba@t.com','BuyerA','+963200001'),($2,'rc-bb@t.com','BuyerB','+963200002'),($3,'rc-ad@t.com','AdminRC','+963200003'),($4,'rc-md@t.com','ModRC','+963200004'),($5,'rc-mr@t.com','MerchRC','+963200005')`,[buyerA,buyerB,adminU,modU,merchU]);
    // 3 orders: A (buyerA, storeA), B (buyerB, storeB), C (buyerA, storeA — for refund tests)
    await pool.query(`INSERT INTO master_orders(id,buyer_id,status)VALUES($1,$2,'CONFIRMED'),($3,$4,'CONFIRMED'),($5,$6,'CONFIRMED')`,[moA,buyerA,moB,buyerB,moC,buyerA]);
    await pool.query(`INSERT INTO orders(id,master_order_id,buyer_id,store_id,status,subtotal_minor,delivery_fee_minor,tax_minor,total_minor,currency,fulfillment_method)VALUES($1,$2,$3,$4,'PAYMENT_PENDING',100000,10000,0,110000,'SYP','COURIER'),($5,$6,$7,$8,'PAYMENT_PENDING',50000,5000,0,55000,'SYP','COURIER'),($9,$10,$11,$12,'PAYMENT_CONFIRMED',200000,15000,0,215000,'SYP','COURIER')`,[ordA,moA,buyerA,storeA,ordB,moB,buyerB,storeB,ordC,moC,buyerA,storeA]);
    // Payments: A (bank transfer, awaiting verification), B (COD, awaiting payment), C (confirmed — for refund/settlement)
    await pool.query(`INSERT INTO payment_records(id,order_id,provider_key,payment_method,status,amount_minor,currency,idempotency_key)VALUES($1,$2,'manual','BANK_TRANSFER','AWAITING_VERIFICATION',110000,'SYP',$3),($4,$5,'manual','CASH_ON_DELIVERY','AWAITING_PAYMENT',55000,'SYP',$6),($7,$8,'manual','BANK_TRANSFER','CONFIRMED',215000,'SYP',$9)`,[payA,ordA,'rc-'+payA,payB,ordB,'rc-'+payB,payC,ordC,'rc-'+payC]);
    // Seed events for payA
    await pool.query(`INSERT INTO payment_events(payment_record_id,event_type,from_status,to_status,actor_id,actor_type)VALUES($1,'CREATED',NULL,'AWAITING_VERIFICATION',$2,'BUYER')`,[payA,buyerA]);
    // Seed a refund for payC
    await pool.query(`INSERT INTO refunds(payment_record_id,order_id,amount_minor,currency,reason,status,requested_by,idempotency_key)VALUES($1,$2,20000,'SYP','BUYER_REQUEST','REQUESTED',$3,$4)`,[payC,ordC,buyerA,'rc-refund-'+uuid()]);

    await pool.query('COMMIT');
    console.log('Seeded: 2 orgs, 2 stores, 5 users, 3 orders, 3 payments, events, refund\n');
  } catch(e) { await pool.query('ROLLBACK'); throw e; }

  // ── Mint JWTs ─────────────────────────────────────────────────
  const now = Math.floor(Date.now()/1000);
  const tokA = sign({sub:buyerA,role:'BUYER',activeOrg:null,perms:['orders:write'],sid:'rc',jti:'j1',iat:now,exp:now+3600});
  const tokB = sign({sub:buyerB,role:'BUYER',activeOrg:null,perms:['orders:write'],sid:'rc',jti:'j2',iat:now,exp:now+3600});
  const tokAdm = sign({sub:adminU,role:'ADMIN',activeOrg:orgA,perms:['admin:payments:read','admin:payments:verify','admin:refunds:approve','admin:settlements:read','admin:settlements:write'],sid:'rc',jti:'j3',iat:now,exp:now+3600});
  const tokMod = sign({sub:modU,role:'MODERATOR',activeOrg:orgA,perms:[],sid:'rc',jti:'j4',iat:now,exp:now+3600});
  const tokMerch = sign({sub:merchU,role:'MERCHANT_OWNER',activeOrg:orgA,perms:['merchant:orders:read','merchant:orders:write'],sid:'rc',jti:'j5',iat:now,exp:now+3600});

  // ══════════════════════════════════════════════════════════════
  // §7: PAYMENT IDOR FINAL CHECK (mandatory release check)
  // ══════════════════════════════════════════════════════════════
  console.log('=== §7: Payment IDOR Final Check ===');

  // Buyer B → Payment A (formerly vulnerable) = must be 403
  let r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokB}`}});
  const body403 = await r.json();
  const payFields = ['id','orderId','amountMinor','currency','paymentMethod','status','receiptUrl','verifiedBy','events','refunds'];
  const leaked = payFields.filter(f => body403[f] !== undefined);
  rec('IDOR-FINAL','Buyer B → Payment A = 403 + no data leak',r.status,r.status===403 && leaked.length===0,
    `leaked=${leaked.length}`);

  // Buyer A → Payment A (own) = 200
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokA}`}});
  rec('IDOR-OWN','Buyer A → Payment A (own) = 200',r.status,r.status===200);

  // Admin → Payment A = 200
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('IDOR-ADMIN','Admin → Payment A = 200',r.status,r.status===200);

  // Unauthenticated → Payment A = 401
  r = await fetch(`${API}/payments/${payA}`);
  rec('IDOR-UNAUTH','Unauthenticated → Payment A = 401',r.status,r.status===401);

  // ══════════════════════════════════════════════════════════════
  // §6B: Buyer Payment Checks
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== §6B: Buyer Payment ===');

  // Buyer can read own payment
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokA}`}});
  rec('BUY-01','Buyer reads own payment',r.status,r.status===200);

  // Buyer cannot read foreign payment
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokA}`}});
  rec('BUY-02','Buyer denied foreign payment',r.status,r.status===403);

  // Unauthenticated denied
  r = await fetch(`${API}/payments/${payA}`);
  rec('BUY-03','Unauthenticated denied payment',r.status,r.status===401);

  // ══════════════════════════════════════════════════════════════
  // §6C: Admin Payment Checks
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== §6C: Admin Payment ===');

  // Admin verification queue
  r = await fetch(`${API}/admin/payments/verification-queue`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('ADM-01','Admin verification queue',r.status,r.status===200);

  // Admin payment list
  r = await fetch(`${API}/admin/payments`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('ADM-02','Admin payment list',r.status,r.status===200);

  // Admin payment detail
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('ADM-03','Admin payment detail',r.status,r.status===200);

  // Buyer cannot access admin endpoints
  r = await fetch(`${API}/admin/payments`,{headers:{Authorization:`Bearer ${tokA}`}});
  rec('ADM-04','Buyer denied admin payments',r.status,r.status===403);

  // ══════════════════════════════════════════════════════════════
  // §6D: Merchant Payment Checks
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== §6D: Merchant Payment ===');

  // Merchant payment list
  r = await fetch(`${API}/merchant/payments`,{headers:{Authorization:`Bearer ${tokMerch}`}});
  rec('MER-01','Merchant payment list',r.status,r.status===200);

  // Buyer cannot access merchant endpoints
  r = await fetch(`${API}/merchant/payments`,{headers:{Authorization:`Bearer ${tokA}`}});
  rec('MER-02','Buyer denied merchant payments',r.status,r.status===403);

  // ══════════════════════════════════════════════════════════════
  // §6H: Tenant Isolation
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== §6H: Tenant Isolation ===');

  // Buyer A → Buyer B's payment = DENY
  r = await fetch(`${API}/payments/${payB}`,{headers:{Authorization:`Bearer ${tokA}`}});
  rec('TEN-01','Buyer A → Buyer B payment = DENY',r.status,r.status===403);

  // Buyer B → Buyer A's payment = DENY
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokB}`}});
  rec('TEN-02','Buyer B → Buyer A payment = DENY',r.status,r.status===403);

  // Cross-org: buyer with orgB activeOrg → payA (storeA∈orgA)
  const tokBOrgB = sign({sub:buyerB,role:'BUYER',activeOrg:orgB,perms:['orders:write'],sid:'rc',jti:'j6',iat:now,exp:now+3600});
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokBOrgB}`}});
  rec('TEN-03','Cross-org buyer B(orgB) → payA(storeA∈orgA) = DENY',r.status,r.status===403);

  // Privileged admin behavior preserved
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('TEN-04','Admin → any payment = 200',r.status,r.status===200);

  // Moderator preserved
  r = await fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokMod}`}});
  rec('TEN-05','Moderator → any payment = 200',r.status,r.status===200);

  // ══════════════════════════════════════════════════════════════
  // §10: Concurrency — IDOR under concurrent access
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== §10: Concurrency ===');

  for (const N of [2, 10, 50, 100]) {
    const promises = Array.from({length:N}, () =>
      fetch(`${API}/payments/${payA}`,{headers:{Authorization:`Bearer ${tokB}`}}).then(r=>r.status));
    const statuses = await Promise.all(promises);
    const denied = statuses.filter(s=>s===403).length;
    const leaked = statuses.filter(s=>s===200).length;
    rec(`CONC-IDOR-${N}`,`Buyer B → PayA (${N} concurrent)`,
      `403×${denied},200×${leaked}`,
      denied===N && leaked===0,
      `${leaked===0?'ZERO unauthorized':'FAIL: '+leaked+' leaked!'}`);
  }

  // ══════════════════════════════════════════════════════════════
  // §13: Alternate Read Paths (quick confirmation)
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== §13: Alternate Read Paths ===');

  // Admin stale payments
  r = await fetch(`${API}/admin/payments/stale`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('PATH-01','GET /admin/payments/stale (admin)',r.status,r.status===200);

  // Merchant settlements
  r = await fetch(`${API}/merchant/settlements`,{headers:{Authorization:`Bearer ${tokMerch}`}});
  rec('PATH-02','GET /merchant/settlements (merchant)',r.status,r.status===200);

  // Admin settlements
  r = await fetch(`${API}/admin/settlements`,{headers:{Authorization:`Bearer ${tokAdm}`}});
  rec('PATH-03','GET /admin/settlements (admin)',r.status,r.status===200);

  // ══════════════════════════════════════════════════════════════
  // Cleanup
  // ══════════════════════════════════════════════════════════════
  console.log('\n=== CLEANUP ===');
  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM refunds WHERE payment_record_id=$1`,[payC]);
    await pool.query(`DELETE FROM payment_events WHERE payment_record_id=$1`,[payA]);
    await pool.query(`DELETE FROM payment_records WHERE id IN ($1,$2,$3)`,[payA,payB,payC]);
    await pool.query(`DELETE FROM orders WHERE id IN ($1,$2,$3)`,[ordA,ordB,ordC]);
    await pool.query(`DELETE FROM master_orders WHERE id IN ($1,$2,$3)`,[moA,moB,moC]);
    await pool.query(`DELETE FROM users WHERE id IN ($1,$2,$3,$4,$5)`,[buyerA,buyerB,adminU,modU,merchU]);
    await pool.query(`DELETE FROM stores WHERE id IN ($1,$2)`,[storeA,storeB]);
    await pool.query(`DELETE FROM organizations WHERE id IN ($1,$2)`,[orgA,orgB]);
    await pool.query('COMMIT');
    console.log('Cleanup complete');
  } catch(e) { await pool.query('ROLLBACK'); console.error('Cleanup failed:',e.message); }

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  const total=R.length, passed=R.filter(r=>r.pass).length, failed=R.filter(r=>!r.pass).length;
  console.log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
  if (failed>0) {
    console.log('\nFAILED:');
    R.filter(r=>!r.pass).forEach(r=>console.log(`  ${r.id}: ${r.desc} → ${r.status} ${r.detail}`));
  }

  await pool.end();
  process.exit(failed>0?1:0);
}

main().catch(e=>{console.error(e);process.exit(1)});
