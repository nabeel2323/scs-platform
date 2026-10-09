// Quick 403 body check for data leakage verification
const crypto = require('node:crypto');
const { Pool } = require('pg');

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function sign(p) {
  const h = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const pl = b64url(JSON.stringify(p));
  const d = `${h}.${pl}`;
  const sig = b64url(crypto.createHmac('sha256','dev-access-secret-change-me-in-production-32chars!').update(d).digest());
  return `${d}.${sig}`;
}

async function main() {
  const pool = new Pool({connectionString:'postgresql://scs:scs_dev_2026@localhost:25433/scs_platform'});
  const uuid = () => crypto.randomUUID();
  const bA=uuid(), bB=uuid(), oA=uuid(), oB=uuid(), sA=uuid(), sB=uuid();
  const mA=uuid(), mB=uuid(), ordA=uuid(), ordB=uuid(), pA=uuid(), pB=uuid();

  await pool.query('BEGIN');
  await pool.query(`INSERT INTO organizations(id,name,type,country,verification_status,is_active)VALUES($1,'LK-A','WHOLESALER','SY','VERIFIED',true),($2,'LK-B','RETAILER','SY','VERIFIED',true)`,[oA,oB]);
  await pool.query(`INSERT INTO stores(id,org_id,slug,display_name,status)VALUES($1,$2,'lk-a','LK-A','ACTIVE'),($3,$4,'lk-b','LK-B','ACTIVE')`,[sA,oA,sB,oB]);
  await pool.query(`INSERT INTO users(id,email,full_name,phone)VALUES($1,'lk-a@t.com','BA','+96300001'),($2,'lk-b@t.com','BB','+96300002')`,[bA,bB]);
  await pool.query(`INSERT INTO master_orders(id,buyer_id,status)VALUES($1,$2,'CONFIRMED'),($3,$4,'CONFIRMED')`,[mA,bA,mB,bB]);
  await pool.query(`INSERT INTO orders(id,master_order_id,buyer_id,store_id,status,subtotal_minor,delivery_fee_minor,tax_minor,total_minor,currency,fulfillment_method)VALUES($1,$2,$3,$4,'PAYMENT_PENDING',50000,5000,0,55000,'SYP','COURIER'),($5,$6,$7,$8,'PAYMENT_PENDING',60000,5000,0,65000,'SYP','COURIER')`,[ordA,mA,bA,sA,ordB,mB,bB,sB]);
  await pool.query(`INSERT INTO payment_records(id,order_id,provider_key,payment_method,status,amount_minor,currency,idempotency_key)VALUES($1,$2,'manual','CASH_ON_DELIVERY','CONFIRMED',65000,'SYP',$3),($4,$5,'manual','BANK_TRANSFER','AWAITING_VERIFICATION',55000,'SYP',$6)`,[pB,ordB,'lk-'+pB,pA,ordA,'lk-'+pA]);
  await pool.query('COMMIT');

  const now = Math.floor(Date.now()/1000);
  const tokB = sign({sub:bB,role:'BUYER',activeOrg:null,perms:[],sid:'lk',jti:'j',iat:now,exp:now+3600});

  // Buyer B tries to read Payment A — should be 403
  const r = await fetch(`http://localhost:3000/v1/payments/${pA}`, {headers:{Authorization:`Bearer ${tokB}`}});
  console.log(`Status: ${r.status}`);
  const body = await r.json();
  console.log(`Body keys: ${JSON.stringify(Object.keys(body))}`);
  console.log(`Body: ${JSON.stringify(body, null, 2)}`);

  // Check for payment-specific data leakage
  const paymentFields = ['id','orderId','amountMinor','currency','paymentMethod','receiptUrl','receiptReference','verifiedBy','events','refunds','providerKey'];
  const leaked = paymentFields.filter(f => body[f] !== undefined);
  console.log(`\nPayment fields leaked: ${leaked.length === 0 ? 'NONE (clean)' : leaked.join(', ')}`);
  console.log(`'statusCode' or 'status' is HTTP envelope, NOT payment data: ${body.statusCode || body.status}`);

  // Cleanup
  await pool.query('BEGIN');
  await pool.query(`DELETE FROM payment_records WHERE id IN ($1,$2)`,[pA,pB]);
  await pool.query(`DELETE FROM orders WHERE id IN ($1,$2)`,[ordA,ordB]);
  await pool.query(`DELETE FROM master_orders WHERE id IN ($1,$2)`,[mA,mB]);
  await pool.query(`DELETE FROM users WHERE id IN ($1,$2)`,[bA,bB]);
  await pool.query(`DELETE FROM stores WHERE id IN ($1,$2)`,[sA,sB]);
  await pool.query(`DELETE FROM organizations WHERE id IN ($1,$2)`,[oA,oB]);
  await pool.query('COMMIT');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
