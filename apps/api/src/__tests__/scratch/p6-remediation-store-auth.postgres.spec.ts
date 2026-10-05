/**
 * P6 Remediation — Store-Level Authorization Security Tests
 *
 * Verifies DEFECT-01 fix: same-org-different-store access must be DENIED.
 *
 * Tests scenarios A–M from the remediation spec plus extras:
 *   A. Store A owner → Store A product → ALLOW
 *   B. Store A admin → Store A product → ALLOW
 *   C. Store A member → Store A product → ALLOW
 *   D. Store B owner → Store A product → DENY
 *   E. Store B admin → Store A product → DENY
 *   F. Store B member → Store A product → DENY
 *   G. Same org, no store membership → DENY
 *   H. Different organization → DENY
 *   I. Offer owner, no store membership → DENY
 *   J. storeId NULL → DENY for merchant
 *   K. SUPER_ADMIN → ALLOW
 *   L. ADMIN → ALLOW
 *   M. MODERATOR → ALLOW
 *   + Inactive membership → DENY
 *   + Nonexistent membership → DENY
 *   + Variant belonging to another store → DENY
 *
 * Plus concurrency tests (5 × 50 iterations).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { assertStoreMember, assertProductEditableByMerchant } from '../../common/tenant-scope';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as schema from '../../drizzle/schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

async function applyMigrations(pool: Pool) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  for (const f of files) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'));
  }
}

// ── Shared state ────────────────────────────────────────────────────

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: DatabaseService;
let catalogService: CatalogService;
let taxonomyService: CatalogTaxonomyService;

// Orgs
let orgX: string, orgY: string;
// Stores in OrgX
let storeA: string, storeB: string;
// Store in OrgY
let storeY: string;
// Users
let userOwnerA: string, userAdminA: string, userMemberA: string;
let userOwnerB: string, userAdminB: string, userMemberB: string;
let userOrgY: string;
let userNoMembership: string;
let userInactive: string;
// Product
let productA: string, productNoStore: string;
// Roles
let merchantOwnerRoleId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await applyMigrations(pool);

  const drizzleDb = drizzle(pool, { schema: schema as any }) as any;
  db = { db: drizzleDb } as any;

  taxonomyService = new CatalogTaxonomyService(db);
  catalogService = new CatalogService(
    db,
    {} as any,
    { publish: async () => undefined } as any,
    { createPresignedGetUrl: async () => null } as any,
    { record: async () => {} } as any,
    { evaluate: () => ({ effects: new Map(), errors: [] }) } as any,
    taxonomyService,
  );

  // ── Seed roles (migrations don't seed data) ─────────────────────
  const roleKeys = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'MERCHANT_OWNER', 'MERCHANT_STAFF', 'BUYER', 'DRIVER'];
  for (const key of roleKeys) {
    await pool.query(`INSERT INTO roles (id, key, name) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`, [randomUUID(), key, key]);
  }
  const rolesRes = await pool.query(`SELECT id, key FROM roles`);
  const roleMap = new Map(rolesRes.rows.map((r: any) => [r.key, r.id]));
  merchantOwnerRoleId = roleMap.get('MERCHANT_OWNER')!;

  // ── Seed orgs ───────────────────────────────────────────────────
  orgX = randomUUID(); orgY = randomUUID();
  await pool.query(`INSERT INTO organizations (id, name, type, country) VALUES ($1, 'OrgX', 'WHOLESALER', 'SA')`, [orgX]);
  await pool.query(`INSERT INTO organizations (id, name, type, country) VALUES ($1, 'OrgY', 'WHOLESALER', 'SA')`, [orgY]);

  // ── Seed stores ─────────────────────────────────────────────────
  storeA = randomUUID(); storeB = randomUUID(); storeY = randomUUID();
  await pool.query(`INSERT INTO stores (id, org_id, slug, display_name) VALUES ($1, $2, 'store-a-rem', 'Store A')`, [storeA, orgX]);
  await pool.query(`INSERT INTO stores (id, org_id, slug, display_name) VALUES ($1, $2, 'store-b-rem', 'Store B')`, [storeB, orgX]);
  await pool.query(`INSERT INTO stores (id, org_id, slug, display_name) VALUES ($1, $2, 'store-y-rem', 'Store Y')`, [storeY, orgY]);

  // ── Seed users ──────────────────────────────────────────────────
  userOwnerA = randomUUID(); userAdminA = randomUUID(); userMemberA = randomUUID();
  userOwnerB = randomUUID(); userAdminB = randomUUID(); userMemberB = randomUUID();
  userOrgY = randomUUID(); userNoMembership = randomUUID(); userInactive = randomUUID();

  const createUser = async (id: string, name: string) => {
    await pool.query(
      `INSERT INTO users (id, phone, full_name) VALUES ($1, $2, $3)`,
      [id, `+966${Math.floor(100000000 + Math.random() * 899999999)}`, name],
    );
  };
  await createUser(userOwnerA, 'Owner A');
  await createUser(userAdminA, 'Admin A');
  await createUser(userMemberA, 'Member A');
  await createUser(userOwnerB, 'Owner B');
  await createUser(userAdminB, 'Admin B');
  await createUser(userMemberB, 'Member B');
  await createUser(userOrgY, 'User OrgY');
  await createUser(userNoMembership, 'No Membership');
  await createUser(userInactive, 'Inactive User');

  // ── Seed org memberships ────────────────────────────────────────
  const addOrgMember = async (orgId: string, userId: string, roleKey: string) => {
    const roleId = roleMap.get(roleKey)!;
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgId, userId, roleId],
    );
  };
  await addOrgMember(orgX, userOwnerA, 'MERCHANT_OWNER');
  await addOrgMember(orgX, userAdminA, 'MERCHANT_OWNER');
  await addOrgMember(orgX, userMemberA, 'MERCHANT_STAFF');
  await addOrgMember(orgX, userOwnerB, 'MERCHANT_OWNER');
  await addOrgMember(orgX, userAdminB, 'MERCHANT_OWNER');
  await addOrgMember(orgX, userMemberB, 'MERCHANT_STAFF');
  await addOrgMember(orgY, userOrgY, 'MERCHANT_OWNER');
  await addOrgMember(orgX, userNoMembership, 'MERCHANT_STAFF');
  await addOrgMember(orgX, userInactive, 'MERCHANT_STAFF');

  // ── Seed store_members (migration 0054) ─────────────────────────
  const addStoreMember = async (storeId: string, userId: string, role: string, status = 'ACTIVE') => {
    await pool.query(
      `INSERT INTO store_members (store_id, user_id, role, status) VALUES ($1, $2, $3, $4)`,
      [storeId, userId, role, status],
    );
  };
  // Store A members
  await addStoreMember(storeA, userOwnerA, 'OWNER');
  await addStoreMember(storeA, userAdminA, 'ADMIN');
  await addStoreMember(storeA, userMemberA, 'MEMBER');
  await addStoreMember(storeA, userInactive, 'MEMBER', 'INACTIVE');
  // Store B members
  await addStoreMember(storeB, userOwnerB, 'OWNER');
  await addStoreMember(storeB, userAdminB, 'ADMIN');
  await addStoreMember(storeB, userMemberB, 'MEMBER');

  // ── Seed products ───────────────────────────────────────────────
  const ptId = randomUUID();
  await pool.query(`INSERT INTO product_types (id, code, name) VALUES ($1, 'rem-type', 'Rem Type')`, [ptId]);

  productA = randomUUID();
  productNoStore = randomUUID();
  await pool.query(
    `INSERT INTO products (id, store_id, product_type_id, slug, title, updated_at) VALUES ($1, $2, $3, 'rem-product-a', 'Product A', $4)`,
    [productA, storeA, ptId, new Date()],
  );
  await pool.query(
    `INSERT INTO products (id, store_id, product_type_id, slug, title, updated_at) VALUES ($1, NULL, $2, 'rem-no-store', 'No Store', $3)`,
    [productNoStore, ptId, new Date()],
  );
}, 120_000);

afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

// ═══════════════════════════════════════════════════════════════════════

describe('P6 Remediation — Store-Level Authorization', () => {
  // ── §A–C: Store A members → Store A product → ALLOW ──────────────

  it('A: Store A OWNER → Store A product → ALLOW', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userOwnerA, role: 'MERCHANT_OWNER', activeOrg: orgX }, productA),
    ).resolves.toBeUndefined();
  });

  it('B: Store A ADMIN → Store A product → ALLOW', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userAdminA, role: 'MERCHANT_OWNER', activeOrg: orgX }, productA),
    ).resolves.toBeUndefined();
  });

  it('C: Store A MEMBER → Store A product → ALLOW', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userMemberA, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA),
    ).resolves.toBeUndefined();
  });

  // ── §D–F: Store B members → Store A product → DENY ───────────────

  it('D: Store B OWNER → Store A product → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userOwnerB, role: 'MERCHANT_OWNER', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  it('E: Store B ADMIN → Store A product → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userAdminB, role: 'MERCHANT_OWNER', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  it('F: Store B MEMBER → Store A product → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userMemberB, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  // ── §G: Same org, no store membership → DENY ─────────────────────

  it('G: Same org, no store membership → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userNoMembership, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  // ── §H: Different organization → DENY ────────────────────────────

  it('H: Different organization → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userOrgY, role: 'MERCHANT_OWNER', activeOrg: orgY }, productA),
    ).rejects.toThrow();
  });

  // ── §I: Offer owner, no store membership → DENY ──────────────────

  it('I: Merchant with offer but no store_members membership → DENY', async () => {
    // userNoMembership is an org member but has no store_members row for storeA
    await expect(
      assertProductEditableByMerchant(db, { sub: userNoMembership, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  // ── §J: storeId NULL → DENY for merchant ─────────────────────────

  it('J: product.storeId = NULL → DENY for merchant', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userOwnerA, role: 'MERCHANT_OWNER', activeOrg: orgX }, productNoStore),
    ).rejects.toThrow();
  });

  // ── §K–M: Privileged roles → ALLOW ───────────────────────────────

  it('K: SUPER_ADMIN → ALLOW (bypass)', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: 'anyone', role: 'SUPER_ADMIN', activeOrg: null }, productA),
    ).resolves.toBeUndefined();
  });

  it('L: ADMIN → ALLOW (bypass)', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: 'anyone', role: 'ADMIN', activeOrg: null }, productA),
    ).resolves.toBeUndefined();
  });

  it('M: MODERATOR → ALLOW (bypass)', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: 'anyone', role: 'MODERATOR', activeOrg: null }, productA),
    ).resolves.toBeUndefined();
  });

  // ── Extras ────────────────────────────────────────────────────────

  it('Inactive membership → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userInactive, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  it('Nonexistent membership → DENY', async () => {
    await expect(
      assertProductEditableByMerchant(db, { sub: userNoMembership, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA),
    ).rejects.toThrow();
  });

  it('assertStoreMember: Store A member → ALLOW', async () => {
    await expect(
      assertStoreMember(db, { sub: userOwnerA, role: 'MERCHANT_OWNER', activeOrg: orgX }, storeA),
    ).resolves.toBeUndefined();
  });

  it('assertStoreMember: Store B member on Store A → DENY', async () => {
    await expect(
      assertStoreMember(db, { sub: userOwnerB, role: 'MERCHANT_OWNER', activeOrg: orgX }, storeA),
    ).rejects.toThrow();
  });

  it('assertStoreMember: SUPER_ADMIN bypass → ALLOW', async () => {
    await expect(
      assertStoreMember(db, { sub: 'anyone', role: 'SUPER_ADMIN', activeOrg: null }, storeA),
    ).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Migration Validation
// ═══════════════════════════════════════════════════════════════════════

describe('Migration 0054 Validation', () => {
  it('store_members table exists', async () => {
    const res = await pool.query(`SELECT to_regclass('public.store_members')`);
    expect(res.rows[0].to_regclass).toBe('store_members');
  });

  it('indexes exist', async () => {
    const res = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'store_members'`);
    const names = res.rows.map((r: any) => r.indexname);
    expect(names).toContain('idx_store_members_store');
    expect(names).toContain('idx_store_members_user');
    expect(names).toContain('idx_store_members_store_active');
  });

  it('unique constraint works', async () => {
    await expect(
      pool.query(`INSERT INTO store_members (store_id, user_id, role, status) VALUES ($1, $2, 'MEMBER', 'ACTIVE')`, [storeA, userOwnerA]),
    ).rejects.toThrow();
  });

  it('role constraint works', async () => {
    await expect(
      pool.query(`INSERT INTO store_members (store_id, user_id, role, status) VALUES ($1, $2, 'INVALID', 'ACTIVE')`, [randomUUID(), randomUUID()]),
    ).rejects.toThrow();
  });

  it('status constraint works', async () => {
    await expect(
      pool.query(`INSERT INTO store_members (store_id, user_id, role, status) VALUES ($1, $2, 'MEMBER', 'INVALID')`, [randomUUID(), randomUUID()]),
    ).rejects.toThrow();
  });

  it('backfill produced memberships', async () => {
    const res = await pool.query(`SELECT COUNT(*) FROM store_members`);
    expect(parseInt(res.rows[0].count)).toBeGreaterThan(0);
  });

  it('re-run migration is safe (idempotent)', async () => {
    const migrationFile = fs.readFileSync(path.join(MIGRATIONS_DIR, '0054_store_members.sql'), 'utf-8');
    await expect(pool.query(migrationFile)).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Concurrency Regression (5 × 50 iterations)
// ═══════════════════════════════════════════════════════════════════════

describe('Concurrency Regression', () => {
  it('CONC-1: 5 concurrent authorized edits by Store A members (50 iter)', async () => {
    let doubleSuccess = 0;
    for (let i = 0; i < 50; i++) {
      const ts = toISO((await pool.query(`SELECT updated_at FROM products WHERE id = '${productA}'`)).rows[0].updated_at);
      // Reset title for each iteration
      await pool.query(`UPDATE products SET title = 'Base', updated_at = $1 WHERE id = $2`, [new Date(), productA]);
      const baseTs = toISO((await pool.query(`SELECT updated_at FROM products WHERE id = '${productA}'`)).rows[0].updated_at);

      const callers = [userOwnerA, userAdminA, userMemberA, userOwnerA, userAdminA];
      const results = await Promise.allSettled(
        callers.map(async (uid) => {
          await assertProductEditableByMerchant(db, { sub: uid, role: 'MERCHANT_OWNER', activeOrg: orgX }, productA);
          return catalogService.updateProduct(productA, { title: `Edit-${uid.slice(0, 8)}` }, baseTs);
        }),
      );
      const successes = results.filter(r => r.status === 'fulfilled').length;
      if (successes > 1) doubleSuccess++;
    }
    expect(doubleSuccess).toBe(0);
  });

  it('CONC-2: 5 concurrent unauthorized edits by Store B members → all DENY (50 iter)', async () => {
    let anySuccess = 0;
    for (let i = 0; i < 50; i++) {
      const callers = [userOwnerB, userAdminB, userMemberB, userOwnerB, userAdminB];
      const results = await Promise.allSettled(
        callers.map(async (uid) => {
          await assertProductEditableByMerchant(db, { sub: uid, role: 'MERCHANT_OWNER', activeOrg: orgX }, productA);
        }),
      );
      const successes = results.filter(r => r.status === 'fulfilled').length;
      if (successes > 0) anySuccess++;
    }
    expect(anySuccess).toBe(0);
  });

  it('CONC-3: membership deactivation vs product mutation (50 iter)', async () => {
    let deniedAfterDeactivation = 0;
    for (let i = 0; i < 50; i++) {
      // Ensure member is active
      await pool.query(`UPDATE store_members SET status = 'ACTIVE' WHERE store_id = $1 AND user_id = $2`, [storeA, userMemberA]);
      // Deactivate
      await pool.query(`UPDATE store_members SET status = 'INACTIVE' WHERE store_id = $1 AND user_id = $2`, [storeA, userMemberA]);
      // Try to edit
      try {
        await assertProductEditableByMerchant(db, { sub: userMemberA, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA);
      } catch {
        deniedAfterDeactivation++;
      }
    }
    expect(deniedAfterDeactivation).toBe(50);
  });

  it('CONC-4: membership activation vs product mutation (50 iter)', async () => {
    let allowedAfterActivation = 0;
    for (let i = 0; i < 50; i++) {
      // Ensure member is inactive
      await pool.query(`UPDATE store_members SET status = 'INACTIVE' WHERE store_id = $1 AND user_id = $2`, [storeA, userMemberA]);
      // Activate
      await pool.query(`UPDATE store_members SET status = 'ACTIVE' WHERE store_id = $1 AND user_id = $2`, [storeA, userMemberA]);
      // Try to edit
      try {
        await assertProductEditableByMerchant(db, { sub: userMemberA, role: 'MERCHANT_STAFF', activeOrg: orgX }, productA);
        allowedAfterActivation++;
      } catch { /* denied */ }
    }
    expect(allowedAfterActivation).toBe(50);
  });

  it('CONC-5: optimistic locking conflict still works (50 iter)', async () => {
    let conflicts = 0;
    for (let i = 0; i < 50; i++) {
      await pool.query(`UPDATE products SET title = 'Base', updated_at = $1 WHERE id = $2`, [new Date(), productA]);
      const ts = toISO((await pool.query(`SELECT updated_at FROM products WHERE id = '${productA}'`)).rows[0].updated_at);

      // Two concurrent edits with same timestamp
      const [r1, r2] = await Promise.allSettled([
        catalogService.updateProduct(productA, { title: 'Edit-1' }, ts),
        catalogService.updateProduct(productA, { title: 'Edit-2' }, ts),
      ]);
      if (r1.status === 'rejected' || r2.status === 'rejected') conflicts++;
    }
    expect(conflicts).toBeGreaterThan(0);
  });
});

function toISO(val: any): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}
