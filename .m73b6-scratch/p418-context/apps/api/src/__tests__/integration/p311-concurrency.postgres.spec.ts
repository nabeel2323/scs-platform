/**
 * P13 Phase 3.1.1 — Concurrency Verification (PostgreSQL)
 *
 * Proves that financial operations are safe under concurrent access:
 * - TC-01: Concurrent commission reversal for same return → idempotency key prevents duplicate
 * - TC-02: Concurrent approve by different users → both succeed (distinct approvers)
 * - TC-03: Concurrent post of same adjustment → only one wins (status check)
 * - TC-04: Concurrent reconciliation for same period/org → unique version constraint
 * - TC-05: Duplicate approval from same user → unique constraint rejects
 * - TC-06: Concurrent reject + approve → row lock serializes, one wins
 *
 * Each test runs against a disposable PostgreSQL provided by testcontainers,
 * following the same convention as the other *postgres.spec.ts suites (CI-safe).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { resolve, join } from 'node:path';
import * as fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { SettlementAdjustmentService } from '../../modules/returns/settlement-adjustment.service';
import { CommissionReversalService } from '../../modules/returns/commission-reversal.service';
import { ReconciliationService } from '../../modules/returns/reconciliation.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import { products, productVariants } from '../../modules/catalog/catalog.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations, organizationMembers } from '../../modules/identity/identity.schema';
import { stores, warehouses, storeMembers } from '../../modules/merchant/merchant.schema';
import { inventoryItems, stockMovements } from '../../modules/inventory/inventory.schema';
import { carts, cartItems } from '../../modules/orders/cart.schema';
import { masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory } from '../../modules/orders/orders.schema';
import { shipments, shipmentEvents } from '../../modules/orders/shipment.schema';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { paymentRecords, refunds, settlementRecords } from '../../modules/payments/payments.schema';
import { returnRequests, returnRequestItems, returnRequestEvents } from '../../modules/returns/returns.schema';
import {
  commissionReversals, settlementAdjustments, settlementAdjustmentApprovals,
  reconciliationRuns, reconciliationDiscrepancies,
} from '../../modules/returns/financial.schema';
import { businessCalendars, businessCalendarHolidays, businessCalendarAudit } from '../../modules/returns/business-calendar.schema';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';

/** Compute approval hash the same way the service does. */
function computeApprovalHash(amountMinor: number, currency: string, reason: string, subOrderId: string, adjustmentType: string) {
  const payload = `${amountMinor}:${currency}:${reason}:${subOrderId}:${adjustmentType}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ─── Disposable DB via testcontainers (same pattern as p13-returns) ───
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

describe('P13 Phase 3.1.1 — Concurrency Verification', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let settlementService: SettlementAdjustmentService;
  let commissionService: CommissionReversalService;
  let reconciliationService: ReconciliationService;

  // Shared fixture IDs
  let orgA: string;
  let adminA: string;
  let adminB: string;
  let adminC: string; // second approver for dual-approval
  let storeA: string;
  let orderA: string;
  let masterA: string;
  let buyerA: string;
  let paymentA: string;
  let returnA: string;
  let adjustmentA: string;
  let adjustmentB: string; // for reject+approve test

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    const db = drizzle(pool, {
      schema: {
        products, productVariants, merchantOffers, users, organizations, organizationMembers,
        stores, warehouses, storeMembers, inventoryItems, stockMovements, carts, cartItems,
        masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory,
        shipments, shipmentEvents, outboxEvents, paymentRecords, refunds, settlementRecords,
        returnRequests, returnRequestItems, returnRequestEvents,
        commissionReversals, settlementAdjustments, settlementAdjustmentApprovals,
        reconciliationRuns, reconciliationDiscrepancies,
        businessCalendars, businessCalendarHolidays, businessCalendarAudit,
      },
    }) as unknown as DatabaseService['db'];

    // Run all migrations
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && !EXCLUDED.has(f)).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sql = fs.readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // Seed fixture chain
    orgA = crypto.randomUUID();
    adminA = crypto.randomUUID();
    adminB = crypto.randomUUID();
    adminC = crypto.randomUUID();
    buyerA = crypto.randomUUID();
    storeA = crypto.randomUUID();
    masterA = crypto.randomUUID();
    orderA = crypto.randomUUID();
    paymentA = crypto.randomUUID();
    returnA = crypto.randomUUID();
    adjustmentA = crypto.randomUUID();
    adjustmentB = crypto.randomUUID();

    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SY')`, [orgA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin A', '+966500000001')`, [adminA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin B', '+966500000002')`, [adminB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin C', '+966500000003')`, [adminC]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000004')`, [buyerA]);

    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, currency, status, verification_status) VALUES ($1, $2, 'store-a-concur', 'Store A', 'SYP', 'ACTIVE', 'VERIFIED')`,
      [storeA, orgA],
    );
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status) VALUES ($1, $2, 'SUBMITTED')`,
      [masterA, buyerA],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor) VALUES ($1, $2, $3, $4, 'DELIVERED', 5000, 0, 500, 0, 5500)`,
      [orderA, masterA, storeA, buyerA],
    );
    await pool.query(
      `INSERT INTO payment_records (id, order_id, payment_method, status, amount_minor, currency) VALUES ($1, $2, 'CASH_ON_DELIVERY', 'CONFIRMED', 5500, 'SYP')`,
      [paymentA, orderA],
    );
    await pool.query(
      `INSERT INTO return_requests (id, sub_order_id, payment_record_id, buyer_id, status, reason, requested_refund_minor) VALUES ($1, $2, $3, $4, 'REQUESTED', 'PRODUCT_NOT_AS_DESCRIBED', 5000)`,
      [returnA, orderA, paymentA, buyerA],
    );

    // Financial breakdown (needed for commission reversal)
    await pool.query(
      `INSERT INTO order_financial_breakdown (id, order_id, products_minor, discount_minor, delivery_fee_minor, tax_minor, commission_minor, merchant_net_minor)
       VALUES ($1, $2, 5000, 0, 500, 0, 250, 4750)`,
      [crypto.randomUUID(), orderA],
    );

    // Financial records:
    // adjustmentA: DRAFT, for concurrent post tests
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1, $2, 'SETTLEMENT_CORRECTION', 500, 'SYP', 'BLOCKED', 'DRAFT', 'Concurrency test A', true, $3, $4)`,
      [adjustmentA, orderA, adminA, orgA],
    );
    // adjustmentB: PENDING_APPROVAL, for concurrent approve/reject tests
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1, $2, 'SETTLEMENT_CORRECTION', 300, 'SYP', 'BLOCKED', 'PENDING_APPROVAL', 'Concurrency test B', false, $3, $4)`,
      [adjustmentB, orderA, adminA, orgA],
    );

    // Build services
    const outbox = {
      dispatch: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
    } as any;

    const database = { db } as any;
    settlementService = new SettlementAdjustmentService(database, outbox);
    commissionService = new CommissionReversalService(database, outbox);
    reconciliationService = new ReconciliationService(database);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  // ═══════════════════════════════════════════════════════════════
  // TC-01: Commission reversal idempotency key constraint
  // ═══════════════════════════════════════════════════════════════
  it('TC-01: commission reversal idempotency key → unique constraint prevents duplicate', async () => {
    // The commission_reversals table has a unique index on idempotency_key.
    // This test verifies the constraint directly rather than through the full service chain
    // (which requires products, variants, order_items, return_request_items fixtures).
    const key = `commission-reversal:test:${crypto.randomUUID()}`;
    
    // First insert should succeed
    await pool.query(
      `INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id)
       VALUES ($1, $2, 250, 100, 'MERCHANT', $3, 'POSTED', 'SYP', $4)`,
      [crypto.randomUUID(), returnA, key, orgA],
    );

    // Second insert with same idempotency key should fail
    await expect(
      pool.query(
        `INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id)
         VALUES ($1, $2, 250, 100, 'MERCHANT', $3, 'POSTED', 'SYP', $4)`,
        [crypto.randomUUID(), returnA, key, orgA],
      ),
    ).rejects.toThrow();

    // Verify only one reversal exists with this key
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM commission_reversals WHERE idempotency_key = $1`,
      [key],
    );
    expect(rows[0].cnt).toBe(1);
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TC-02: Concurrent approve by different users (dual approval)
  // ═══════════════════════════════════════════════════════════════
  it('TC-02: concurrent approve by different users → both succeed for dual approval', async () => {
    // adjustmentA is DRAFT, requires_dual_approval=true, created_by=adminA
    // First submit it for approval
    await settlementService.submitForApproval(adjustmentA, adminA, orgA);

    // Now two different admins approve concurrently
    const approveInput = { approverRole: 'FINANCE', notes: 'OK' };
    const results = await Promise.allSettled([
      settlementService.approveAdjustment(adjustmentA, adminB, 'FINANCE', approveInput, orgA),
      settlementService.approveAdjustment(adjustmentA, adminC, 'ADMIN', approveInput, orgA),
    ]);

    // Both should succeed since they are distinct approvers
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(2);

    // Verify both approvals exist
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM settlement_adjustment_approvals WHERE adjustment_id = $1`,
      [adjustmentA],
    );
    expect(rows[0].cnt).toBe(2);

    // Adjustment should now be APPROVED (dual approval satisfied)
    const adj = await settlementService.getAdjustment(adjustmentA, orgA);
    expect(adj?.status).toBe('APPROVED');
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TC-03: Concurrent post of same adjustment
  // ═══════════════════════════════════════════════════════════════
  it('TC-03: concurrent post of same adjustment → only one wins', async () => {
    // Create a fresh adjustment for this test.
    // Phase 4: fx_status is 'RESOLVED', not 'BLOCKED'. Posting is allow-listed on
    // the FX position (settlement-adjustment.service.ts), because §7 requires that
    // an adjustment without an authoritative FX source stays blocked and the P13
    // monitor raises a CRITICAL invariant violation for any POSTED row whose FX is
    // still blocked. This test is about concurrent post, not about FX, so the row
    // must be in a state the posting guard accepts.
    const adjId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1, $2, 'SETTLEMENT_CORRECTION', 200, 'SYP', 'RESOLVED', 'APPROVED', 'Post test', false, $3, $4)`,
      [adjId, orderA, adminA, orgA],
    );
    // Add an approval record (required for posting)
    await pool.query(
      `INSERT INTO settlement_adjustment_approvals (id, adjustment_id, approver_id, approver_role, approval_hash)
       VALUES ($1, $2, $3, 'FINANCE', 'hash')`,
      [crypto.randomUUID(), adjId, adminB],
    );

    // Two concurrent post attempts
    const results = await Promise.allSettled([
      settlementService.postAdjustment(adjId, adminB, orgA),
      settlementService.postAdjustment(adjId, adminB, orgA),
    ]);

    // Exactly one should succeed, the other should fail (status is no longer APPROVED)
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify adjustment is POSTED
    const adj = await settlementService.getAdjustment(adjId, orgA);
    expect(adj?.status).toBe('POSTED');
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TC-04: Concurrent reconciliation for same period/org
  // ═══════════════════════════════════════════════════════════════
  it('TC-04: concurrent reconciliation for same period/org → unique version constraint', async () => {
    const periodStart = '2026-03-01';
    const periodEnd = '2026-03-31';

    // Two concurrent reconciliation runs
    const results = await Promise.allSettled([
      reconciliationService.executeReconciliation(periodStart, periodEnd, 'SYP', adminA, orgA),
      reconciliationService.executeReconciliation(periodStart, periodEnd, 'SYP', adminA, orgA),
    ]);

    // The first one should succeed. The second may succeed with version 2
    // (if it reads version 1 before the first inserts) or fail with unique constraint.
    // Either way, we should have at most 2 runs with distinct versions.
    const { rows } = await pool.query(
      `SELECT version FROM reconciliation_runs
       WHERE period_start = $1 AND period_end = $2 AND currency = $3 AND org_id = $4
       ORDER BY version`,
      [periodStart, periodEnd, 'SYP', orgA],
    );

    // All versions must be distinct
    const versions = rows.map((r: any) => r.version);
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(versions.length);
    expect(versions.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TC-05: Duplicate approval from same user
  // ═══════════════════════════════════════════════════════════════
  it('TC-05: duplicate approval from same user → rejected', async () => {
    // Create a fresh adjustment in PENDING_APPROVAL status
    const adjId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1, $2, 'SETTLEMENT_CORRECTION', 100, 'SYP', 'BLOCKED', 'PENDING_APPROVAL', 'Dup approval test', false, $3, $4)`,
      [adjId, orderA, adminA, orgA],
    );

    const approveInput = { approverRole: 'FINANCE', notes: 'First approval' };

    // First approval should succeed
    await settlementService.approveAdjustment(adjId, adminB, 'FINANCE', approveInput, orgA);

    // Second approval from same user should fail
    await expect(
      settlementService.approveAdjustment(adjId, adminB, 'FINANCE', approveInput, orgA),
    ).rejects.toThrow();

    // Verify only one approval exists
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM settlement_adjustment_approvals WHERE adjustment_id = $1`,
      [adjId],
    );
    expect(rows[0].cnt).toBe(1);
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TC-06: Concurrent reject + approve → row lock serializes
  // ═══════════════════════════════════════════════════════════════
  it('TC-06: concurrent reject + approve → row lock serializes, one wins', async () => {
    // adjustmentB is PENDING_APPROVAL, requires_dual_approval=false
    // Concurrent reject and approve should be serialized by FOR UPDATE lock
    const results = await Promise.allSettled([
      settlementService.rejectAdjustment(adjustmentB, adminB, 'Rejected concurrently', orgA),
      settlementService.approveAdjustment(adjustmentB, adminC, 'FINANCE', { approverRole: 'FINANCE', notes: 'Approved concurrently' }, orgA),
    ]);

    // Exactly one should succeed
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify final status is either REJECTED or APPROVED (not both)
    const adj = await settlementService.getAdjustment(adjustmentB, orgA);
    expect(['REJECTED', 'APPROVED']).toContain(adj?.status);
  }, 30_000);
});
