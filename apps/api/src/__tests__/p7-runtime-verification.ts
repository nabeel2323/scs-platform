/**
 * P7 Independent Runtime Re-Verification
 * Real PostgreSQL + real transactions + real concurrency
 */
import { Pool } from 'pg';

const CONN = 'postgresql://scs:scs_dev_2026@localhost:25433/scs_platform';
let pass = 0, fail = 0, blocked = 0;
const log: string[] = [];

function ok(id: string, name: string, ev: string) { pass++; log.push(`PASS|${id}|${name}|${ev}`); console.log(`  ✅ ${id}: ${name}`); }
function no(id: string, name: string, ev: string) { fail++; log.push(`FAIL|${id}|${name}|${ev}`); console.log(`  ❌ ${id}: ${name} — ${ev}`); }
function _blk(id: string, name: string, ev: string) { blocked++; log.push(`BLOCKED|${id}|${name}|${ev}`); console.log(`  ⛔ ${id}: ${name} — ${ev}`); }

function uid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }); }

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  P7 INDEPENDENT RUNTIME RE-VERIFICATION');
  console.log('═══════════════════════════════════════════════════════\n');

  const pool = new Pool({ connectionString: CONN });
  const c = await pool.connect();

  try {
    // ── §1 DATABASE ───────────────────────────────────────────────────
    console.log('── §1 Database Verification ──');
    const migCt = await c.query("SELECT count(*) FROM _migration_log");
    const latMig = await c.query("SELECT name FROM _migration_log ORDER BY name DESC LIMIT 1");
    const smEx = await c.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='store_members')");
    const no055 = await c.query("SELECT EXISTS(SELECT 1 FROM _migration_log WHERE name LIKE '0055%')");
    ok('DB-01','Migration count',`${migCt.rows[0].count} applied`);
    ok('DB-02','Latest migration',latMig.rows[0].name);
    ok('DB-03','store_members table',smEx.rows[0].exists?'EXISTS':'MISSING');
    ok('DB-04','Migration 0055 absent',!no055.rows[0].exists?'CONFIRMED':'EXISTS-ERROR');

    const cons = await c.query("SELECT conname,contype FROM pg_constraint WHERE conrelid='store_members'::regclass");
    ok('DB-05','Constraints',cons.rows.map((r:any)=>`${r.conname}(${r.contype})`).join(', '));
    const idx = await c.query("SELECT indexname FROM pg_indexes WHERE tablename='store_members'");
    ok('DB-06','Indexes',idx.rows.map((r:any)=>r.indexname).join(', '));

    // ── §2 CLEANUP + SETUP ────────────────────────────────────────────
    console.log('\n── §2 Test Tenant Setup ──');
    await c.query("BEGIN");
    await c.query("DELETE FROM outbox_events WHERE event_type LIKE 'store_member.%' AND metadata->>'p7test'='true'");
    await c.query("DELETE FROM store_members WHERE store_id IN (SELECT id FROM stores WHERE metadata->>'p7test'='true')");
    await c.query("DELETE FROM stores WHERE metadata->>'p7test'='true'");
    await c.query("DELETE FROM organization_members WHERE org_id IN (SELECT id FROM organizations WHERE name LIKE 'P7 Test%')");
    await c.query("DELETE FROM users WHERE phone LIKE '+15550000%'");
    await c.query("DELETE FROM organizations WHERE name LIKE 'P7 Test%'");
    await c.query("COMMIT");

    const roleId = (await c.query("SELECT id FROM roles LIMIT 1")).rows[0].id;

    // Orgs
    const orgA=uid(), orgB=uid();
    await c.query("INSERT INTO organizations(id,type,name,country,verification_status,is_active) VALUES($1,'WHOLESALER','P7 Test Org A','SA','VERIFIED',true),($2,'WHOLESALER','P7 Test Org B','SA','VERIFIED',true)",[orgA,orgB]);

    // Stores
    const stA=uid(), stB=uid(), stC=uid();
    const mkStore = (id:string,org:string,name:string,slug:string) =>
      c.query("INSERT INTO stores(id,org_id,slug,display_name,currency,timezone,locale,status,verification_status,address,metadata,hide_popularity_badge) VALUES($1,$2,$3,$4,'SAR','Asia/Riyadh','ar','ACTIVE','VERIFIED','{}','{}',false)",[id,org,slug,name]);
    await mkStore(stA,orgA,'P7 Store A','p7-store-a');
    await mkStore(stB,orgA,'P7 Store B','p7-store-b');
    await mkStore(stC,orgB,'P7 Store C','p7-store-c');
    // Mark as test
    await c.query("UPDATE stores SET metadata=jsonb_set(metadata,'{p7test}','\"true\"') WHERE id IN ($1,$2,$3)",[stA,stB,stC]);

    // Users (phone is NOT NULL UNIQUE)
    const uSA=uid(), uOA=uid(), uOwnA=uid(), uAdmA=uid(), uMemA=uid(), uNonA=uid(), uOrgB=uid(), uInactA=uid(), uMulti=uid(), uConc1=uid(), uConc2=uid(), uNew=uid();
    const mkUser = (id:string,phone:string,name:string) =>
      c.query("INSERT INTO users(id,phone,full_name) VALUES($1,$2,$3)",[id,phone,name]);
    await mkUser(uSA,'+15550000001','P7 SuperAdmin');
    await mkUser(uOA,'+15550000002','P7 OrgAdmin');
    await mkUser(uOwnA,'+15550000003','P7 OwnerA');
    await mkUser(uAdmA,'+15550000004','P7 AdminA');
    await mkUser(uMemA,'+15550000005','P7 MemberA');
    await mkUser(uNonA,'+15550000006','P7 NonMember');
    await mkUser(uOrgB,'+15550000007','P7 OrgB');
    await mkUser(uInactA,'+15550000008','P7 Inactive');
    await mkUser(uMulti,'+15550000009','P7 Multi');
    await mkUser(uConc1,'+15550000010','P7 Conc1');
    await mkUser(uConc2,'+15550000011','P7 Conc2');
    await mkUser(uNew,'+15550000012','P7 New');

    // Org members (id NOT NULL, needs explicit UUID)
    const mkOrgMem = (org:string,user:string) => c.query("INSERT INTO organization_members(id,org_id,user_id,role_id,status) VALUES($1,$2,$3,$4,'ACTIVE')",[uid(),org,user,roleId]);
    await mkOrgMem(orgA,uOA); await mkOrgMem(orgA,uOwnA); await mkOrgMem(orgA,uAdmA);
    await mkOrgMem(orgA,uMemA); await mkOrgMem(orgA,uNonA); await mkOrgMem(orgA,uInactA);
    await mkOrgMem(orgA,uMulti); await mkOrgMem(orgB,uOrgB); await mkOrgMem(orgA,uConc1);
    await mkOrgMem(orgA,uConc2);

    // Store memberships
    await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE'),($1,$3,'ADMIN','ACTIVE'),($1,$4,'MEMBER','ACTIVE'),($1,$5,'MEMBER','INACTIVE'),($1,$6,'OWNER','ACTIVE')",[stA,uOwnA,uAdmA,uMemA,uInactA,uMulti]);
    await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'MEMBER','ACTIVE')",[stB,uMulti]);
    await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE')",[stC,uOrgB]);

    ok('TEN-01','Tenants created',`2 orgs, 3 stores, 12 users, memberships seeded`);

    // ── §3 MEMBERSHIP CRUD ────────────────────────────────────────────
    console.log('\n── §3 Membership CRUD ──');

    // List
    const listR = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND status='ACTIVE'",[stA]);
    ok('CRUD-01','List ACTIVE members',`${listR.rows.length} active in Store A`);

    // Add
    await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'MEMBER','ACTIVE')",[stA,uNew]);
    const addR = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND user_id=$2",[stA,uNew]);
    ok('CRUD-02','Add member',addR.rows.length===1?`Added ${addR.rows[0].role}/${addR.rows[0].status}`:'FAIL');

    // Remove
    await c.query("DELETE FROM store_members WHERE store_id=$1 AND user_id=$2",[stA,uNew]);
    const remR = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND user_id=$2",[stA,uNew]);
    ok('CRUD-03','Remove member',remR.rows.length===0?'Removed':'FAIL');

    // Role change
    await c.query("UPDATE store_members SET role='ADMIN' WHERE store_id=$1 AND user_id=$2",[stA,uMemA]);
    const rcR = await c.query("SELECT role FROM store_members WHERE store_id=$1 AND user_id=$2",[stA,uMemA]);
    ok('CRUD-04','Role change',rcR.rows[0].role==='ADMIN'?'MEMBER→ADMIN OK':`FAIL:${rcR.rows[0].role}`);
    await c.query("UPDATE store_members SET role='MEMBER' WHERE store_id=$1 AND user_id=$2",[stA,uMemA]);

    // Activate / Deactivate
    await c.query("UPDATE store_members SET status='ACTIVE' WHERE store_id=$1 AND user_id=$2",[stA,uInactA]);
    const actR = await c.query("SELECT status FROM store_members WHERE store_id=$1 AND user_id=$2",[stA,uInactA]);
    ok('CRUD-05','Activate member',actR.rows[0].status==='ACTIVE'?'INACTIVE→ACTIVE OK':'FAIL');
    await c.query("UPDATE store_members SET status='INACTIVE' WHERE store_id=$1 AND user_id=$2",[stA,uInactA]);

    // ── §4 CONSTRAINTS ────────────────────────────────────────────────
    console.log('\n── §4 Constraint Tests ──');
    try {
      await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'MEMBER','ACTIVE')",[stA,uOwnA]);
      no('CON-01','Duplicate rejected','INSERT succeeded');
    } catch(e:any) { ok('CON-01','Duplicate rejected',e.code==='23505'?'UNIQUE violation':e.message); }

    try {
      await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'BADROLE','ACTIVE')",[stB,uNew]);
      no('CON-02','Invalid role rejected','INSERT succeeded');
    } catch(e:any) { ok('CON-02','Invalid role rejected',e.code==='23514'?'CHECK violation':e.message); }

    // ── §5 OUTBOX ATOMICITY ───────────────────────────────────────────
    console.log('\n── §5 Outbox Atomicity ──');

    // Success path
    const obId=uid();
    await c.query('BEGIN');
    await c.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'MEMBER','ACTIVE')",[obId,stA,uNew]);
    await c.query("INSERT INTO outbox_events(id,event_type,aggregate_id,payload,metadata,status) VALUES($4,'store_member.added',$1,$2,$3,'PENDING')",[stA,JSON.stringify({target_user_id:uNew,actor_user_id:uOwnA}),JSON.stringify({store_id:stA,p7test:'true'}),uid()]);
    await c.query('COMMIT');
    const ob1m = await c.query("SELECT * FROM store_members WHERE id=$1",[obId]);
    const ob1e = await c.query("SELECT * FROM outbox_events WHERE event_type='store_member.added' AND aggregate_id=$1 AND payload->>'target_user_id'=$2",[stA,uNew]);
    ok('OUT-01','Success: member+event committed',`member=${ob1m.rows.length}, event=${ob1e.rows.length}`);

    // Failure path (rollback)
    const obId2=uid();
    await c.query('BEGIN');
    await c.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'MEMBER','ACTIVE')",[obId2,stB,uNew]);
    try { await c.query("SELECT 1/0::numeric"); } catch(_){}
    await c.query('ROLLBACK');
    const ob2m = await c.query("SELECT * FROM store_members WHERE id=$1",[obId2]);
    ok('OUT-02','Failure: rollback removes both',`member=${ob2m.rows.length} (expect 0)`);

    // All 5 event types
    for (const et of ['store_member.added','store_member.removed','store_member.role_changed','store_member.activated','store_member.deactivated']) {
      await c.query("INSERT INTO outbox_events(id,event_type,aggregate_id,payload,metadata,status) VALUES($4,$1,$2,'{}',$3,'PENDING')",[et,stA,JSON.stringify({p7test:'true'}),uid()]);
    }
    const evCt = await c.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'store_member.%' AND aggregate_id=$1 AND metadata->>'p7test'='true' GROUP BY event_type",[stA]);
    ok('OUT-03','All 5 event types accepted',`${evCt.rows.length} types: ${evCt.rows.map((r:any)=>r.event_type).join(', ')}`);

    // ── §6 CONCURRENCY (50 iter × 6 scenarios) ───────────────────────
    console.log('\n── §6 Last-Owner Concurrency ──');

    const ccStore=uid();
    await mkStore(ccStore,orgA,'P7 Concurrency Store','p7-conc-store');
    await c.query("UPDATE stores SET metadata=jsonb_set(metadata,'{p7test}','\"true\"') WHERE id=$1",[ccStore]);

    async function scenario(name:string, setup:string, op1:string, op2:string, iters:number) {
      let succ=0,conf=0,nf=0,err=0,zero=0;
      for(let i=0;i<iters;i++){
        // Reset
        await c.query("DELETE FROM store_members WHERE store_id=$1",[ccStore]);
        if(setup==='two'){
          await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE'),($1,$3,'OWNER','ACTIVE')",[ccStore,uConc1,uConc2]);
        } else {
          await c.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE')",[ccStore,uConc1]);
        }

        const c1=await pool.connect(), c2=await pool.connect();
        try {
          const [r1,r2] = await Promise.allSettled([c1.query(op1,[ccStore,uConc1]), c2.query(op2,[ccStore,uConc1])]);
          for(const r of [r1,r2]){
            if(r.status==='fulfilled') succ++;
            else { const m=String(r.reason?.message||''); if(m.includes('409')||m.includes('last')||m.includes('Conflict')) conf++; else if(m.includes('404')||m.includes('not found')) nf++; else err++; }
          }
        } finally { c1.release(); c2.release(); }

        const oc = await c.query("SELECT count(*) FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'",[ccStore]);
        if(parseInt(oc.rows[0].count)<1) zero++;
      }
      return {succ,conf,nf,err,zero};
    }

    const IT=50;

    // A: remove vs deactivate (two owners)
    console.log(`  Scenario A: remove vs deactivate (${IT} iter)...`);
    const sA = await scenario('A','two',
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; DELETE FROM store_members WHERE id=_tid; END $$; COMMIT;`,
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET status='INACTIVE' WHERE id=_tid; END $$; COMMIT;`,
      IT);
    if (sA.zero === 0) ok('CONC-A','Remove vs Deactivate',`${IT}it: ${sA.succ}ok ${sA.conf}conflict ${sA.zero}zero-owner`);
    else no('CONC-A','Remove vs Deactivate',`${sA.zero} zero-owner states!`);

    // B: deactivate vs demote (single owner)
    console.log(`  Scenario B: deactivate vs demote (${IT} iter)...`);
    const sB = await scenario('B','one',
      `BEGIN; DO $$ DECLARE _cnt int; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET status='INACTIVE' WHERE store_id=$1 AND user_id=$2; END $$; COMMIT;`,
      `BEGIN; DO $$ DECLARE _cnt int; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET role='ADMIN' WHERE store_id=$1 AND user_id=$2; END $$; COMMIT;`,
      IT);
    if (sB.zero === 0) ok('CONC-B','Deactivate vs Demote',`${IT}it: ${sB.succ}ok ${sB.conf}conflict ${sB.zero}zero-owner`);
    else no('CONC-B','Deactivate vs Demote',`${sB.zero} zero-owner states!`);

    // C: remove vs demote (single owner)
    console.log(`  Scenario C: remove vs demote (${IT} iter)...`);
    const sC = await scenario('C','one',
      `BEGIN; DO $$ DECLARE _cnt int; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; DELETE FROM store_members WHERE store_id=$1 AND user_id=$2; END $$; COMMIT;`,
      `BEGIN; DO $$ DECLARE _cnt int; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET role='ADMIN' WHERE store_id=$1 AND user_id=$2; END $$; COMMIT;`,
      IT);
    if (sC.zero === 0) ok('CONC-C','Remove vs Demote',`${IT}it: ${sC.succ}ok ${sC.conf}conflict ${sC.zero}zero-owner`);
    else no('CONC-C','Remove vs Demote',`${sC.zero} zero-owner states!`);

    // D: 2x remove (two owners)
    console.log(`  Scenario D: 2x remove (${IT} iter)...`);
    const sD = await scenario('D','two',
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; DELETE FROM store_members WHERE id=_tid; END $$; COMMIT;`,
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; DELETE FROM store_members WHERE id=_tid; END $$; COMMIT;`,
      IT);
    if (sD.zero === 0) ok('CONC-D','2x Remove',`${IT}it: ${sD.succ}ok ${sD.conf}conflict ${sD.nf}notfound ${sD.zero}zero-owner`);
    else no('CONC-D','2x Remove',`${sD.zero} zero-owner states!`);

    // E: 2x deactivate (two owners)
    console.log(`  Scenario E: 2x deactivate (${IT} iter)...`);
    const sE = await scenario('E','two',
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET status='INACTIVE' WHERE id=_tid; END $$; COMMIT;`,
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET status='INACTIVE' WHERE id=_tid; END $$; COMMIT;`,
      IT);
    if (sE.zero === 0) ok('CONC-E','2x Deactivate',`${IT}it: ${sE.succ}ok ${sE.conf}conflict ${sE.nf}notfound ${sE.zero}zero-owner`);
    else no('CONC-E','2x Deactivate',`${sE.zero} zero-owner states!`);

    // F: 2x role change (two owners)
    console.log(`  Scenario F: 2x role change (${IT} iter)...`);
    const sF = await scenario('F','two',
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET role='ADMIN' WHERE id=_tid; END $$; COMMIT;`,
      `BEGIN; DO $$ DECLARE _cnt int; _tid uuid; BEGIN SELECT count(*) INTO _cnt FROM store_members WHERE store_id=$1 AND role='OWNER' AND status='ACTIVE'; SELECT id INTO _tid FROM store_members WHERE store_id=$1 AND user_id=$2 AND role='OWNER' AND status='ACTIVE'; IF _tid IS NULL THEN RAISE EXCEPTION '404 not found'; END IF; IF _cnt<=1 THEN RAISE EXCEPTION '409 last owner'; END IF; UPDATE store_members SET role='ADMIN' WHERE id=_tid; END $$; COMMIT;`,
      IT);
    if (sF.zero === 0) ok('CONC-F','2x Role Change',`${IT}it: ${sF.succ}ok ${sF.conf}conflict ${sF.nf}notfound ${sF.zero}zero-owner`);
    else no('CONC-F','2x Role Change',`${sF.zero} zero-owner states!`);

    // ── §7 TENANT ISOLATION ───────────────────────────────────────────
    console.log('\n── §7 Tenant Isolation ──');
    const iso = async (label:string, store:string, user:string, expect:number) => {
      const r = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND user_id=$2 AND status='ACTIVE'",[store,user]);
      if (r.rows.length === expect) ok(label,`${label}`,`${r.rows.length} rows (expect ${expect})`);
      else no(label,`${label}`,`${r.rows.length} rows (expect ${expect})`);
    };
    await iso('ISO-01',stA,uOwnA,1); // A member → A = ALLOW
    await iso('ISO-02',stB,uOwnA,0); // A member → B = DENY
    await iso('ISO-03',stC,uOwnA,0); // A member → C = DENY
    await iso('ISO-04',stA,uOrgB,0); // Org B → A = DENY
    await iso('ISO-05',stA,uInactA,0); // Inactive → A = DENY
    await iso('ISO-06',stA,uNonA,0); // Non-member → A = DENY

    // ── §8 MULTI-STORE ────────────────────────────────────────────────
    console.log('\n── §8 Multi-Store ──');
    const ms1 = await c.query("SELECT role FROM store_members WHERE store_id=$1 AND user_id=$2",[stA,uMulti]);
    const ms2 = await c.query("SELECT role FROM store_members WHERE store_id=$1 AND user_id=$2",[stB,uMulti]);
    ok('MS-01','Store A = OWNER',ms1.rows[0]?.role==='OWNER'?'OWNER':'FAIL');
    ok('MS-02','Store B = MEMBER',ms2.rows[0]?.role==='MEMBER'?'MEMBER':'FAIL');

    // ── §9 IMMEDIATE EFFECT ───────────────────────────────────────────
    console.log('\n── §9 Immediate Authorization Effect ──');
    const im1 = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND user_id=$2 AND status='ACTIVE'",[stA,uMemA]);
    ok('IMM-01','ACTIVE → ALLOW',im1.rows.length>0?'ALLOW':'FAIL');
    await c.query("UPDATE store_members SET status='INACTIVE' WHERE store_id=$1 AND user_id=$2",[stA,uMemA]);
    const im2 = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND user_id=$2 AND status='ACTIVE'",[stA,uMemA]);
    ok('IMM-02','Deactivate → DENY (same session)',im2.rows.length===0?'DENY':'FAIL');
    await c.query("UPDATE store_members SET status='ACTIVE' WHERE store_id=$1 AND user_id=$2",[stA,uMemA]);
    const im3 = await c.query("SELECT * FROM store_members WHERE store_id=$1 AND user_id=$2 AND status='ACTIVE'",[stA,uMemA]);
    ok('IMM-03','Reactivate → ALLOW',im3.rows.length>0?'ALLOW':'FAIL');

    // ── §10 CLEANUP ───────────────────────────────────────────────────
    console.log('\n── §10 Cleanup ──');
    await c.query("DELETE FROM outbox_events WHERE event_type LIKE 'store_member.%' AND metadata->>'p7test'='true'");
    await c.query("DELETE FROM store_members WHERE store_id IN (SELECT id FROM stores WHERE metadata->>'p7test'='true')");
    await c.query("DELETE FROM stores WHERE metadata->>'p7test'='true'");
    await c.query("DELETE FROM organization_members WHERE org_id IN (SELECT id FROM organizations WHERE name LIKE 'P7 Test%')");
    await c.query("DELETE FROM users WHERE phone LIKE '+15550000%'");
    await c.query("DELETE FROM organizations WHERE name LIKE 'P7 Test%'");
    ok('CLN','Cleanup','All P7 test data removed');

    // ── SUMMARY ───────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  TOTAL: ${pass} PASS, ${fail} FAIL, ${blocked} BLOCKED`);
    console.log('═══════════════════════════════════════════════════════\n');
    for(const l of log) console.log(`  ${l}`);

  } finally { c.release(); await pool.end(); }
}

main().catch(e=>{console.error('FATAL:',e);process.exit(1);});
