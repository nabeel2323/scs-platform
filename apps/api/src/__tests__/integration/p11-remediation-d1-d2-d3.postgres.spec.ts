/**
 * P11 Remediation Tests — D-1 / D-2 / D-3
 *
 * D-1: idx_products_governance_status index exists
 * D-2: Moderator concurrency — exactly 1 winner under concurrent terminal moderation
 * D-3: Offer availability snapshot — per-offer restoration after re-review
 *
 * All tests use real PostgreSQL (Testcontainers).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { ProductGovernanceService } from '../../modules/catalog/product-governance.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { products, productModeration } from '../../modules/catalog/catalog.schema';
import { merchantOffers, productOfferReviewState } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations, organizationMembers } from '../../modules/identity/identity.schema';
import { stores } from '../../modules/merchant/merchant.schema';
import { outboxEvents } from '../../modules/audit/audit.schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

const outbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;

async function q(pool: Pool, text: string, params?: any[]) { return pool.query(text, params); }
async function one(pool: Pool, text: string, params?: any[]) { return (await pool.query(text, params)).rows[0]; }
async function cnt(pool: Pool, text: string, params?: any[]) { return parseInt((await pool.query(text, params)).rows[0].cnt, 10); }

describe('P11 Remediation — D-1 / D-2 / D-3', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let database: DatabaseService;
  let governance: ProductGovernanceService;

  const orgA = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const merchantA = randomUUID();
  const modUser = randomUUID();
  const adminUser = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    // Apply ALL migrations
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && !EXCLUDED.has(f)).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    // Seed RBAC
    const client = await pool.connect();
    try { const { seedPlatformRbac } = await import('../../../infra/drizzle/seed-pg'); await seedPlatformRbac(client); }
    finally { client.release(); }

    db = drizzle(pool, {
      schema: { products, productModeration, merchantOffers, productOfferReviewState, users, organizations, organizationMembers, stores, outboxEvents },
    }) as unknown as DatabaseService['db'];
    database = { db } as DatabaseService;
    governance = new ProductGovernanceService(database, outbox, audit);

    // Seed orgs/stores/users
    await q(pool, `INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`, [orgA]);
    await q(pool, `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a', 'Store A', 'APPROVED')`, [storeA, orgA]);
    await q(pool, `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-b', 'Store B', 'APPROVED')`, [storeB, orgA]);
    await q(pool, `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+1000000001')`, [merchantA]);
    await q(pool, `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Moderator', '+1000000002')`, [modUser]);
    await q(pool, `INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin', '+1000000003')`, [adminUser]);

    const rolesRes = await q(pool, `SELECT id, key FROM roles`);
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));
    await q(pool, `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1,$2,$3,$4,'ACTIVE')`, [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')]);
    await q(pool, `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1,$2,$3,$4,'ACTIVE')`, [randomUUID(), orgA, modUser, roleById.get('MODERATOR')]);
    await q(pool, `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1,$2,$3,$4,'ACTIVE')`, [randomUUID(), orgA, adminUser, roleById.get('ADMIN')]);
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  // Helper: create product in a given status with JS-precision updated_at
  async function createProduct(status: string, storeId = storeA): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await q(pool, `INSERT INTO products (id, store_id, slug, title, status, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`, [id, storeId, `p-${id.slice(0,8)}`, `Prod ${id.slice(0,8)}`, status, now]);
    return id;
  }

  // Helper: create a product variant (needed to bypass uq_offer_store_product partial unique index)
  async function createVariant(productId: string): Promise<string> {
    const id = randomUUID();
    const sku = `SKU-${id.slice(0, 8)}`;
    await q(pool, `INSERT INTO product_variants (id, product_id, sku) VALUES ($1, $2, $3)`, [id, productId, sku]);
    return id;
  }

  // Helper: create an offer (with optional variant_id to bypass partial unique index)
  async function createOffer(productId: string, storeId: string, isAvailable: boolean, variantId?: string): Promise<string> {
    const id = randomUUID();
    if (variantId) {
      await q(pool, `INSERT INTO merchant_offers (id, store_id, product_id, variant_id, status, is_available) VALUES ($1,$2,$3,$4,'ACTIVE',$5)`, [id, storeId, productId, variantId, isAvailable]);
    } else {
      await q(pool, `INSERT INTO merchant_offers (id, store_id, product_id, status, is_available) VALUES ($1,$2,$3,'ACTIVE',$4)`, [id, storeId, productId, isAvailable]);
    }
    return id;
  }

  // Helper: get offer availability
  async function getOfferAvailability(offerId: string): Promise<boolean> {
    const row = await one(pool, `SELECT is_available FROM merchant_offers WHERE id = $1`, [offerId]);
    return row.is_available;
  }

  // ═══════════════════════════════════════════════════════════════
  //  D-1: Governance Status Index
  // ═══════════════════════════════════════════════════════════════

  describe('D-1 — Governance Status Index', () => {
    it('0057 migration is recorded', async () => {
      const row = await one(pool, `SELECT name FROM _migration_log WHERE name = '0057_governance_index_offer_snapshot.sql'`);
      expect(row).toBeDefined();
    });

    it('idx_products_governance_status exists', async () => {
      const idx = await one(pool, `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_products_governance_status'`);
      expect(idx).toBeDefined();
      expect(idx.indexname).toBe('idx_products_governance_status');
    });

    it('product_offer_review_state table exists', async () => {
      const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'product_offer_review_state'`);
      const names = cols.rows.map((r: any) => r.column_name);
      expect(names).toContain('id');
      expect(names).toContain('product_id');
      expect(names).toContain('offer_id');
      expect(names).toContain('previous_is_available');
      expect(names).toContain('review_cycle_id');
      expect(names).toContain('created_at');
      expect(names).toContain('restored_at');
    });

    it('migration idempotency: re-running 0057 causes no errors', async () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '0057_governance_index_offer_snapshot.sql'), 'utf-8');
      await expect(pool.query(sql)).resolves.toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  D-2: Moderator Concurrency — SELECT FOR UPDATE
  // ═══════════════════════════════════════════════════════════════

  describe('D-2 — Moderator Concurrency (SELECT FOR UPDATE)', () => {
    async function setupUnderReview(): Promise<{ pid: string; ut: string }> {
      const pid = await createProduct('DRAFT');
      await governance.submitProduct({ productId: pid, storeId: storeA, actorUserId: merchantA, actorRole: 'MERCHANT_OWNER' });
      await governance.startReview(pid, modUser, 'MODERATOR');
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      return { pid, ut: ut.toISOString() };
    }

    // D2-01: 10 concurrent APPROVE → exactly 1 succeeds
    it('D2-01: 10 concurrent approvals → exactly 1 succeeds', async () => {
      const { pid, ut } = await setupUnderReview();
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: i % 2 === 0 ? modUser : adminUser, actorRole: 'MODERATOR', clientUpdatedAt: ut }),
        ),
      );
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(1);
      expect((await one(pool, `SELECT status FROM products WHERE id=$1`, [pid])).status).toBe('APPROVED');
      const ledgerCount = await cnt(pool, `SELECT count(*)::int AS cnt FROM product_moderation WHERE product_id=$1 AND to_status='APPROVED'`, [pid]);
      expect(ledgerCount).toBe(1);
    }, 30_000);

    // D2-02: 50 concurrent APPROVE → exactly 1 succeeds
    it('D2-02: 50 concurrent approvals → exactly 1 succeeds', async () => {
      const { pid, ut } = await setupUnderReview();
      const results = await Promise.allSettled(
        Array.from({ length: 50 }, (_, i) =>
          governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: i % 2 === 0 ? modUser : adminUser, actorRole: 'MODERATOR', clientUpdatedAt: ut }),
        ),
      );
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(1);
      const ledgerCount = await cnt(pool, `SELECT count(*)::int AS cnt FROM product_moderation WHERE product_id=$1 AND to_status='APPROVED'`, [pid]);
      expect(ledgerCount).toBe(1);
    }, 60_000);

    // D2-03: 100 concurrent APPROVE → exactly 1 succeeds
    it('D2-03: 100 concurrent approvals → exactly 1 succeeds', async () => {
      const { pid, ut } = await setupUnderReview();
      const results = await Promise.allSettled(
        Array.from({ length: 100 }, (_, i) =>
          governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: i % 2 === 0 ? modUser : adminUser, actorRole: 'MODERATOR', clientUpdatedAt: ut }),
        ),
      );
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(1);
      const ledgerCount = await cnt(pool, `SELECT count(*)::int AS cnt FROM product_moderation WHERE product_id=$1 AND to_status='APPROVED'`, [pid]);
      expect(ledgerCount).toBe(1);
    }, 120_000);

    // D2-04: Concurrent APPROVE vs REJECT → exactly 1 terminal transition
    it('D2-04: concurrent APPROVE vs REJECT → exactly 1 succeeds', async () => {
      const { pid, ut } = await setupUnderReview();
      const results = await Promise.allSettled([
        governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut }),
        governance.moderateProduct({ productId: pid, decision: 'REJECTED', reason: 'Bad', actorUserId: adminUser, actorRole: 'ADMIN', clientUpdatedAt: ut }),
      ]);
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(1);
      const status = (await one(pool, `SELECT status FROM products WHERE id=$1`, [pid])).status;
      expect(['APPROVED', 'REJECTED']).toContain(status);
      const terminalLedger = await cnt(pool, `SELECT count(*)::int AS cnt FROM product_moderation WHERE product_id=$1 AND to_status IN ('APPROVED','REJECTED')`, [pid]);
      expect(terminalLedger).toBe(1);
    }, 30_000);

    // D2-05: Stale moderation after product edit → ConflictException
    it('D2-05: stale moderation request → ConflictException', async () => {
      const { pid, ut } = await setupUnderReview();
      // Simulate a product edit that changes updated_at (via startReview re-entry pattern)
      // We use the stale `ut` to moderate — but first change the product's updated_at
      await q(pool, `UPDATE products SET updated_at = NOW() WHERE id = $1`, [pid]);
      await expect(
        governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut }),
      ).rejects.toThrow();
      // Product should NOT be corrupted
      const status = (await one(pool, `SELECT status FROM products WHERE id=$1`, [pid])).status;
      expect(status).toBe('UNDER_REVIEW'); // unchanged
    }, 30_000);
  });

  // ═══════════════════════════════════════════════════════════════
  //  D-3: Offer Availability Snapshot
  // ═══════════════════════════════════════════════════════════════

  describe('D-3 — Offer Availability Snapshot', () => {
    // Helper: create a PUBLISHED product with offers (each offer gets a unique variant to bypass uq_offer_store_product)
    async function setupPublishedWithOffers(offerStates: boolean[]): Promise<{ pid: string; offerIds: string[] }> {
      const pid = await createProduct('PUBLISHED');
      const offerIds: string[] = [];
      for (const avail of offerStates) {
        const variantId = await createVariant(pid);
        const oid = await createOffer(pid, storeA, avail, variantId);
        offerIds.push(oid);
      }
      return { pid, offerIds };
    }

    // Helper: trigger re-review by calling the internal method
    async function triggerReReview(pid: string): Promise<void> {
      // Use the governance service's internal method via a high-risk field edit simulation
      // We directly call triggerReReviewIfNeeded through the service
      const changedFields = new Set(['title']); // high-risk field
      await governance.triggerReReviewIfNeeded(
        db, pid, changedFields, false, false, merchantA, 'MERCHANT_OWNER',
      );
    }

    // D3-01: Mixed availability
    it('D3-01: mixed offer availability — snapshot + restore correct', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([true, false, true]);
      await triggerReReview(pid);

      // All offers suspended
      for (const oid of offerIds) {
        expect(await getOfferAvailability(oid)).toBe(false);
      }

      // Verify snapshots (query per-offer to avoid UUID ordering assumptions)
      const snapshots = await pool.query(
        `SELECT offer_id, previous_is_available FROM product_offer_review_state WHERE product_id = $1 AND restored_at IS NULL`,
        [pid],
      );
      expect(snapshots.rows.length).toBe(3);
      const snapByOffer = new Map(snapshots.rows.map((r: any) => [r.offer_id, r.previous_is_available] as const));
      expect(snapByOffer.get(offerIds[0]!)).toBe(true);
      expect(snapByOffer.get(offerIds[1]!)).toBe(false);
      expect(snapByOffer.get(offerIds[2]!)).toBe(true);

      // Approve
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });

      // Restore: A=true, B=false, C=true
      expect(await getOfferAvailability(offerIds[0]!)).toBe(true);
      expect(await getOfferAvailability(offerIds[1]!)).toBe(false);
      expect(await getOfferAvailability(offerIds[2]!)).toBe(true);
    });

    // D3-02: All disabled
    it('D3-02: all disabled — remain disabled after approval', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([false, false]);
      await triggerReReview(pid);
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });
      expect(await getOfferAvailability(offerIds[0]!)).toBe(false);
      expect(await getOfferAvailability(offerIds[1]!)).toBe(false);
    });

    // D3-03: All enabled
    it('D3-03: all enabled — remain enabled after approval', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([true, true]);
      await triggerReReview(pid);
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });
      expect(await getOfferAvailability(offerIds[0]!)).toBe(true);
      expect(await getOfferAvailability(offerIds[1]!)).toBe(true);
    });

    // D3-04: Rejection — offers remain suspended
    it('D3-04: rejection — offers remain suspended, no restoration', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([true, false, true]);
      await triggerReReview(pid);
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'REJECTED', reason: 'Missing info', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });
      // All offers remain suspended
      for (const oid of offerIds) {
        expect(await getOfferAvailability(oid)).toBe(false);
      }
    });

    // D3-05: Re-review after rejection (full lifecycle)
    it('D3-05: full lifecycle — PUBLISHED→UNDER_REVIEW→REJECTED→SUBMITTED→UNDER_REVIEW→APPROVED→PUBLISHED', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([true, false]);

      // First review cycle: re-review → reject
      await triggerReReview(pid);
      let ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'REJECTED', reason: 'Bad', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });
      // Offers remain suspended
      expect(await getOfferAvailability(offerIds[0]!)).toBe(false);
      expect(await getOfferAvailability(offerIds[1]!)).toBe(false);

      // Resubmit
      await governance.submitProduct({ productId: pid, storeId: storeA, actorUserId: merchantA, actorRole: 'MERCHANT_OWNER' });
      await governance.startReview(pid, modUser, 'MODERATOR');

      // Second review cycle: approve
      ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });

      // Offers should be restored from the FIRST cycle's snapshot (which captured true/false)
      // The first cycle's snapshots are still unrestored (rejection didn't restore them)
      expect(await getOfferAvailability(offerIds[0]!)).toBe(true);
      expect(await getOfferAvailability(offerIds[1]!)).toBe(false);
    });

    // D3-06: Multiple merchants/offers
    it('D3-06: multiple merchants — per-offer snapshot, no cross-merchant leakage', async () => {
      const pid = await createProduct('PUBLISHED');
      // Two offers from different stores (merchants)
      const offerA = await createOffer(pid, storeA, true);
      const offerB = await createOffer(pid, storeB, false);

      await triggerReReview(pid);

      // Both suspended
      expect(await getOfferAvailability(offerA)).toBe(false);
      expect(await getOfferAvailability(offerB)).toBe(false);

      // Verify separate snapshots
      const snapA = await one(pool, `SELECT previous_is_available FROM product_offer_review_state WHERE offer_id = $1 AND restored_at IS NULL`, [offerA]);
      const snapB = await one(pool, `SELECT previous_is_available FROM product_offer_review_state WHERE offer_id = $1 AND restored_at IS NULL`, [offerB]);
      expect(snapA.previous_is_available).toBe(true);
      expect(snapB.previous_is_available).toBe(false);

      // Approve
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);
      await governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() });

      // Per-offer restoration
      expect(await getOfferAvailability(offerA)).toBe(true);
      expect(await getOfferAvailability(offerB)).toBe(false);
    });

    // D3-07: Concurrent approval — only one succeeds, restoration executes once
    it('D3-07: concurrent approval — exactly 1 succeeds, restoration is correct', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([true, false]);
      await triggerReReview(pid);
      const ut = new Date((await one(pool, `SELECT updated_at FROM products WHERE id=$1`, [pid])).updated_at);

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: i % 2 === 0 ? modUser : adminUser, actorRole: 'MODERATOR', clientUpdatedAt: ut.toISOString() }),
        ),
      );
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(1);

      // Restoration is correct
      expect(await getOfferAvailability(offerIds[0]!)).toBe(true);
      expect(await getOfferAvailability(offerIds[1]!)).toBe(false);
    }, 30_000);

    // D3-08: Transaction rollback — no orphaned snapshots
    it('D3-08: transaction rollback — no orphaned snapshots on failure', async () => {
      const { pid, offerIds } = await setupPublishedWithOffers([true, false]);
      await triggerReReview(pid);

      // Count snapshots before attempt
      const snapBefore = await cnt(pool, `SELECT count(*)::int AS cnt FROM product_offer_review_state WHERE product_id = $1`, [pid]);

      // Try to approve with stale updatedAt → should fail
      const staleDate = new Date('2020-01-01').toISOString();
      await expect(
        governance.moderateProduct({ productId: pid, decision: 'APPROVED', actorUserId: modUser, actorRole: 'MODERATOR', clientUpdatedAt: staleDate }),
      ).rejects.toThrow();

      // Product should still be UNDER_REVIEW
      expect((await one(pool, `SELECT status FROM products WHERE id=$1`, [pid])).status).toBe('UNDER_REVIEW');

      // Offers should still be suspended
      for (const oid of offerIds) {
        expect(await getOfferAvailability(oid)).toBe(false);
      }

      // No new snapshots should have been created (the approval didn't create any)
      const snapAfter = await cnt(pool, `SELECT count(*)::int AS cnt FROM product_offer_review_state WHERE product_id = $1`, [pid]);
      expect(snapAfter).toBe(snapBefore);
    });
  });
});
