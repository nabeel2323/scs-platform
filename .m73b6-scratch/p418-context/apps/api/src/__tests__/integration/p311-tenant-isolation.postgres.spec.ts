/**
 * P13 Phase 3.1.1 — Adversarial Tenant Isolation Tests (PostgreSQL)
 *
 * Proves financial data isolation between organizations at the service layer:
 * TISO-01..09: Cross-tenant read/write rejection for all financial services
 *
 * Each test runs against a disposable PostgreSQL provided by testcontainers,
 * following the same convention as the other *postgres.spec.ts suites (CI-safe).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { SettlementAdjustmentService } from '../../modules/returns/settlement-adjustment.service';
import { ReconciliationService } from '../../modules/returns/reconciliation.service';
import { CommissionReversalService } from '../../modules/returns/commission-reversal.service';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
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

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
const outbox = { dispatch: vi.fn().mockResolvedValue(undefined), publish: vi.fn().mockResolvedValue(undefined) } as unknown as OutboxDispatcher;

describe('P13 Phase 3.1.1 — Adversarial Tenant Isolation (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let database: DatabaseService;
  let settlementService: SettlementAdjustmentService;
  let reconciliationService: ReconciliationService;
  let commissionService: CommissionReversalService;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const adminA = randomUUID();
  const adminB = randomUUID();
  const buyerA = randomUUID();
  const buyerB = randomUUID();
  let storeA: string;
  let storeB: string;
  let orderA: string;
  let orderB: string;
  let retA: string;
  let retB: string;
  let adjustmentA: string;
  let adjustmentB: string;

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
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sql); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }
    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    database = { db } as any;
    settlementService = new SettlementAdjustmentService(database, outbox);
    reconciliationService = new ReconciliationService(database);
    commissionService = new CommissionReversalService(database, outbox);

    // Create orgs and users
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SY')`, [orgA]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org B', 'SY')`, [orgB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin A', '+966500000003')`, [adminA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin B', '+966500000004')`, [adminB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+966500000005')`, [buyerA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer B', '+966500000006')`, [buyerB]);

    // Stores (one per org)
    storeA = randomUUID();
    storeB = randomUUID();
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, currency, status, verification_status) VALUES ($1, $2, 'org-a-store', 'Org A Store', 'SYP', 'ACTIVE', 'VERIFIED')`,
      [storeA, orgA],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, currency, status, verification_status) VALUES ($1, $2, 'org-b-store', 'Org B Store', 'SYP', 'ACTIVE', 'VERIFIED')`,
      [storeB, orgB],
    );

    // Master orders
    const masterA = randomUUID();
    const masterB = randomUUID();
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status) VALUES ($1, $2, 'SUBMITTED')`,
      [masterA, buyerA],
    );
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status) VALUES ($1, $2, 'SUBMITTED')`,
      [masterB, buyerB],
    );

    // Sub-orders (one per store)
    orderA = randomUUID();
    orderB = randomUUID();
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor)
       VALUES ($1, $2, $3, $4, 'DELIVERED', 5000, 0, 500, 0, 5500)`,
      [orderA, masterA, storeA, buyerA],
    );
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor)
       VALUES ($1, $2, $3, $4, 'DELIVERED', 8000, 0, 500, 0, 8500)`,
      [orderB, masterB, storeB, buyerB],
    );

    // Payment records (needed for return_requests FK)
    const payA = randomUUID();
    const payB = randomUUID();
    await pool.query(
      `INSERT INTO payment_records (id, order_id, payment_method, status, amount_minor, currency) VALUES ($1, $2, 'CASH_ON_DELIVERY', 'CONFIRMED', 5500, 'SYP')`,
      [payA, orderA],
    );
    await pool.query(
      `INSERT INTO payment_records (id, order_id, payment_method, status, amount_minor, currency) VALUES ($1, $2, 'CASH_ON_DELIVERY', 'CONFIRMED', 8500, 'SYP')`,
      [payB, orderB],
    );

    // Return requests (needed for commission_reversals FK)
    retA = randomUUID();
    retB = randomUUID();
    await pool.query(
      `INSERT INTO return_requests (id, sub_order_id, payment_record_id, buyer_id, status, reason, requested_refund_minor)
       VALUES ($1, $2, $3, $4, 'REQUESTED', 'PRODUCT_NOT_AS_DESCRIBED', 5000)`,
      [retA, orderA, payA, buyerA],
    );
    await pool.query(
      `INSERT INTO return_requests (id, sub_order_id, payment_record_id, buyer_id, status, reason, requested_refund_minor)
       VALUES ($1, $2, $3, $4, 'REQUESTED', 'PRODUCT_NOT_AS_DESCRIBED', 8000)`,
      [retB, orderB, payB, buyerB],
    );

    // Insert settlement adjustments with real sub_order_id references
    adjustmentA = randomUUID();
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1, $2, 'SETTLEMENT_CORRECTION', 500, 'SYP', 'BLOCKED', 'DRAFT', 'Org A correction', true, $3, $4)`,
      [adjustmentA, orderA, adminA, orgA],
    );
    adjustmentB = randomUUID();
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1, $2, 'SETTLEMENT_CORRECTION', 1000, 'SYP', 'BLOCKED', 'DRAFT', 'Org B correction', true, $3, $4)`,
      [adjustmentB, orderB, adminB, orgB],
    );

    // Commission reversals per org (now with valid return_request_id)
    await pool.query(
      `INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id)
       VALUES ($1, $2, 200, 200, 'MERCHANT', $3, 'POSTED', 'SYP', $4)`,
      [randomUUID(), retA, `idem-a-${randomUUID()}`, orgA],
    );
    await pool.query(
      `INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id)
       VALUES ($1, $2, 400, 400, 'PLATFORM', $3, 'POSTED', 'SYP', $4)`,
      [randomUUID(), retB, `idem-b-${randomUUID()}`, orgB],
    );

    // Reconciliation runs per org (different periods to satisfy unique version constraint)
    await pool.query(
      `INSERT INTO reconciliation_runs (id, period_start, period_end, currency, status, org_id) VALUES ($1, '2026-01-01', '2026-01-31', 'SYP', 'COMPLETED', $2)`,
      [randomUUID(), orgA],
    );
    await pool.query(
      `INSERT INTO reconciliation_runs (id, period_start, period_end, currency, status, org_id) VALUES ($1, '2026-02-01', '2026-02-28', 'SYP', 'COMPLETED', $2)`,
      [randomUUID(), orgB],
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('TISO-01: listing adjustments scoped by orgId returns only own data', async () => {
    const listA = await settlementService.listAdjustments(orgA);
    const listB = await settlementService.listAdjustments(orgB);
    expect(listA.length).toBe(1); expect(listA[0]!.id).toBe(adjustmentA);
    expect(listB.length).toBe(1); expect(listB[0]!.id).toBe(adjustmentB);
    expect(listA.some((a: any) => a.id === adjustmentB)).toBe(false);
  });

  it('TISO-02: getAdjustment with wrong orgId throws NotFoundException', async () => {
    await expect(
      settlementService.getAdjustment(adjustmentB, orgA),
    ).rejects.toThrow();
    const own = await settlementService.getAdjustment(adjustmentA, orgA);
    expect(own).toBeDefined(); expect(own!.id).toBe(adjustmentA);
  });

  it('TISO-03: approveAdjustment with wrong orgId throws', async () => {
    // Submit Org B's adjustment first
    await settlementService.submitForApproval(adjustmentB, adminB, orgB);
    // Org A tries to approve Org B's adjustment
    await expect(
      settlementService.approveAdjustment(adjustmentB, adminA, 'ADMIN', { approverRole: 'ADMIN', notes: 'cross-org' }, orgA),
    ).rejects.toThrow();
    // Verify Org B's adjustment was NOT modified
    const adj = await settlementService.getAdjustment(adjustmentB, orgB);
    expect(adj!.status).toBe('PENDING_APPROVAL');
  });

  it('TISO-04: listReversals scoped by orgId returns only own data', async () => {
    const listA = await commissionService.listReversals(orgA);
    const listB = await commissionService.listReversals(orgB);
    expect(listA.length).toBe(1); expect(listA[0]!.orgId).toBe(orgA);
    expect(listB.length).toBe(1); expect(listB[0]!.orgId).toBe(orgB);
  });

  it('TISO-05: listReconciliationRuns scoped by orgId returns only own data', async () => {
    const runsA = await reconciliationService.listReconciliationRuns(orgA);
    const runsB = await reconciliationService.listReconciliationRuns(orgB);
    expect(runsA.length).toBe(1); expect(runsA[0]!.orgId).toBe(orgA);
    expect(runsB.length).toBe(1); expect(runsB[0]!.orgId).toBe(orgB);
  });

  it('TISO-06: resolveDiscrepancy with wrong orgId throws', async () => {
    const runsB = await reconciliationService.listReconciliationRuns(orgB);
    const discId = randomUUID();
    await pool.query(
      `INSERT INTO reconciliation_discrepancies (id, run_id, discrepancy_type, source_ref, expected_minor, actual_minor, delta_minor, org_id) VALUES ($1, $2, 'SETTLEMENT_MISMATCH', 'ref-1', 1000, 800, 200, $3)`,
      [discId, runsB[0]!.id, orgB],
    );
    await expect(
      reconciliationService.resolveDiscrepancy(discId, adminA, 'cross-org attempt', orgA),
    ).rejects.toThrow();
    const disc = await pool.query(`SELECT resolved FROM reconciliation_discrepancies WHERE id = $1`, [discId]);
    expect(disc.rows[0].resolved).toBe(false);
  });

  it('TISO-07: listing without orgId returns all (admin super-query) but scoped queries work', async () => {
    // Without orgId, list returns all records (for super-admin use)
    const all = await settlementService.listAdjustments();
    expect(all.length).toBe(2); // Both orgs' adjustments visible
    // But scoped queries only return own data
    const scopedA = await settlementService.listAdjustments(orgA);
    expect(scopedA.length).toBe(1);
    expect(scopedA[0]!.orgId).toBe(orgA);
  });

  it('TISO-08: knowing UUID of another org adjustment does not grant read', async () => {
    await expect(
      settlementService.getAdjustment(adjustmentB, orgA),
    ).rejects.toThrow();
  });

  it('TISO-09: concurrent cross-org listing returns isolated results', async () => {
    const [listA, listB] = await Promise.all([
      settlementService.listAdjustments(orgA),
      settlementService.listAdjustments(orgB),
    ]);
    const idsA = new Set(listA.map((a: any) => a.id));
    const idsB = new Set(listB.map((a: any) => a.id));
    for (const id of idsA) { expect(idsB.has(id)).toBe(false); }
  });
});
