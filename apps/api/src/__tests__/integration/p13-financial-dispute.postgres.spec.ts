/**
 * P13 — Dispute/Refund & Settlement Financial Integration (PostgreSQL)
 *
 * Closes the runtime-verification gaps for dispute-to-refund behavior and
 * concurrent refund-versus-settlement calculation:
 *
 *   FIN-DSH-01  Resolve dispute WITHOUT issuing a refund
 *   FIN-DSH-02  Resolve dispute WITH a pending refund recommendation
 *   FIN-DSH-03  Approve the dispute refund through the P12 authorization path
 *   FIN-DSH-04  Refund/dispute linked to the correct dispute and return request
 *   FIN-DSH-05  Retry dispute resolution without creating duplicate refunds
 *   FIN-DSH-06  Orphan-refund recovery (refunded but unresolved → retry reuses)
 *   FIN-DSH-07  Simultaneous return-initiated and dispute-initiated refunds
 *   FIN-DSH-08  Concurrent refund approval and settlement calculation
 *   FIN-DSH-09  Refund approved after settlement already PAID (ADJUSTMENT, original preserved)
 *   FIN-DSH-10  Rollback when the REFUNDED transition loses a race (no double settlement debit)
 *   FIN-DSH-13  Concurrent settlement calculations reuse one payable settlement
 *   FIN-DSH-14  Recalculation after settlement PAID is rejected
 *   FIN-DSH-15  Settlement is blocked until payment is confirmed
 *   FIN-DSH-16  Payment verification, COD confirmation and refund amounts must be positive safe integers

 *   FIN-DSH-24  Refund adjustment serializes with settlement payment
 *   FIN-DSH-25  Post-refund adjustment preserves settlement currency
 *
 * All assertions are against persisted database state, not code inspection.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { OrdersService } from '../../modules/orders/orders.service';
import { PromotionsService } from '../../modules/promotions/promotions.service';
import { PaymentsService } from '../../modules/payments/payments.service';
import { PaymentProviderRegistry } from '../../modules/payments/payments.provider-registry';
import { ManualVerificationProvider } from '../../modules/payments/manual-verification.provider';
import { ReturnsService } from '../../modules/returns/returns.service';
import { AuditService } from '../../modules/audit/audit.service';
import { OpsAlertService } from '../../modules/operations/ops-alert.service';
import { PilotControlService } from '../../modules/operations/pilot-control.service';
import { BusinessCalendarService } from '../../modules/returns/business-calendar.service';
import { CommissionReversalService } from '../../modules/returns/commission-reversal.service';
import { SettlementAdjustmentService } from '../../modules/returns/settlement-adjustment.service';
import { DisputesService } from '../../modules/reviews/disputes.service';
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
import { paymentRecords, paymentEvents, refunds, settlementRecords } from '../../modules/payments/payments.schema';
import { returnRequests, returnRequestItems, returnRequestEvents } from '../../modules/returns/returns.schema';
import { commissionReversals, settlementAdjustments, settlementAdjustmentApprovals } from '../../modules/returns/financial.schema';
import { disputes, disputeEvents } from '../../modules/reviews/support.schema';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

const realtime = {
  emitNewOrder: vi.fn(),
  emitOrderStatusChanged: vi.fn(),
  server: { to: () => ({ emit: () => {} }) },
} as any;
const notifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

// ─── Helpers ──────────────────────────────────────────────────────

async function createDeliveredOrder(
  pool: Pool,
  ordersService: OrdersService,
  buyerId: string,
  merchantId: string,
  storeId: string,
  variantId: string,
  offerId: string,
  orgId: string,
): Promise<string> {
  const cartId = randomUUID();
  await pool.query(
    `INSERT INTO carts (id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
    [cartId, buyerId],
  );
  await pool.query(
    `INSERT INTO cart_items (id, cart_id, store_id, variant_id, quantity, price_minor, line_total_minor, offer_id)
     VALUES ($1, $2, $3, $4, 3, 1000, 3000, $5)`,
    [randomUUID(), cartId, storeId, variantId, offerId],
  );

  const co = await ordersService.checkout({
    buyerId,
    deliveryAddress: {},
    idempotencyKey: `p13fin-${randomUUID()}`,
  });
  const orderId = co.subOrders[0]!.id;
  const caller = { sub: merchantId, role: 'MERCHANT_OWNER' as const, activeOrg: orgId };

  await ordersService.acceptOrder(orderId, merchantId, caller);
  await ordersService.prepareOrder(orderId, merchantId, caller);
  await ordersService.readyOrder(orderId, merchantId, caller);

  await pool.query(
    `UPDATE orders SET status = 'DELIVERED', updated_at = now() WHERE id = $1`,
    [orderId],
  );
  await pool.query(
    `UPDATE shipments SET status = 'DELIVERED', delivered_at = now() WHERE order_id = $1`,
    [orderId],
  );
  await pool.query(
    `UPDATE payment_records SET status = 'CONFIRMED', confirmed_amount_minor = 3450 WHERE order_id = $1`,
    [orderId],
  );

  return orderId;
}

/** Drive a return REQUESTED → REFUND_PENDING (GOOD inspection) for `quantity` units. */
async function advanceReturnToRefundPending(
  returnsService: ReturnsService,
  pool: Pool,
  orderId: string,
  quantity: number,
  buyerId: string,
  merchantId: string,
  orgId: string,
): Promise<any> {
  const itemsRes = await pool.query(`SELECT id FROM order_items WHERE order_id = $1`, [orderId]);
  const orderItemId = itemsRes.rows[0].id as string;
  const buyerCaller = { sub: buyerId, role: 'BUYER' as const, activeOrg: orgId };
  const merchantCaller = { sub: merchantId, role: 'MERCHANT_OWNER' as const, activeOrg: orgId };

  const ret = await returnsService.createReturnRequest({
    subOrderId: orderId,
    reason: 'PRODUCT_NOT_AS_DESCRIBED',
    description: 'Financial integration test',
    lines: [{ orderItemId, quantity }],
  }, buyerCaller);

  await returnsService.transitionReturn(ret.id, 'MERCHANT_APPROVED', merchantCaller);
  await returnsService.transitionReturn(ret.id, 'BUYER_SHIPPED', buyerCaller, { trackingNumber: 'TRK-FIN' });
  await returnsService.transitionReturn(ret.id, 'RECEIVED', merchantCaller);
  await returnsService.transitionReturn(ret.id, 'INSPECTED', merchantCaller, { condition: 'GOOD' });
  return returnsService.transitionReturn(ret.id, 'REFUND_PENDING', merchantCaller);
}

// ═══════════════════════════════════════════════════════════════════
//  P13 FINANCIAL DISPUTE / SETTLEMENT TESTS
// ═══════════════════════════════════════════════════════════════════

describe('P13 — Dispute/Refund & Settlement Financial Integration (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let ordersService: OrdersService;
  let returnsService: ReturnsService;
  let paymentsService: PaymentsService;
  let disputesService: DisputesService;

  const merchantA = randomUUID();
  const buyerA = randomUUID();
  const adminA = randomUUID();
  const orgA = randomUUID();
  const storeA = randomUUID();
  const warehouseA = randomUUID();
  const variantA = randomUUID();
  const offerA = randomUUID();
  const productIdA = randomUUID();
  const invItemA = randomUUID();
  let roleById: Map<string, string>;

  const adminCaller = { sub: adminA, role: 'ADMIN' as const };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    db = drizzle(pool, {
      schema: {
        products, productVariants, merchantOffers,
        users, organizations, organizationMembers,
        stores, warehouses, storeMembers,
        inventoryItems, stockMovements,
        carts, cartItems,
        masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory,
        shipments, shipmentEvents,
        outboxEvents,
        paymentRecords, paymentEvents, refunds, settlementRecords,
        returnRequests, returnRequestItems, returnRequestEvents,
        commissionReversals,
        settlementAdjustments, settlementAdjustmentApprovals,
        disputes, disputeEvents,
      },
    }) as unknown as DatabaseService['db'];

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    await pool.query(
      `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`,
    );
    for (const file of files) {
      const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(sqlText);
        await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
        await pool.query('COMMIT');
      } catch {
        await pool.query('ROLLBACK');
      }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    const outbox = new OutboxDispatcher({ db } as DatabaseService);
    const promotions = new PromotionsService({ db } as DatabaseService);
    const registry = new PaymentProviderRegistry();
    registry.register(new ManualVerificationProvider());
    paymentsService = new PaymentsService({ db } as DatabaseService, outbox, registry);
    const database = { db } as DatabaseService;
    ordersService = new OrdersService(database, outbox, promotions, realtime, undefined, notifications, undefined, paymentsService);
    const calendarService = new BusinessCalendarService(database);
    const commissionReversalService = new CommissionReversalService(database, outbox);
    const settlementAdjService = new SettlementAdjustmentService(database, outbox);
    // P13 Phase 4: pilot gate is inactive in this suite (no flag, no env mode),
    // so ReturnsService behaviour is identical to Phase 3.1.1.
    const pilotService = new PilotControlService(
      database, new AuditService(database), new OpsAlertService(database),
    );
    returnsService = new ReturnsService(database, outbox, paymentsService, calendarService, commissionReversalService, settlementAdjService, pilotService);
    disputesService = new DisputesService(database, outbox, paymentsService);

    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+13110000001')`, [merchantA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer A', '+13110000002')`, [buyerA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Admin A', '+13110000009')`, [adminA]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org Fin', 'SA')`, [orgA]);
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')],
    );
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [randomUUID(), orgA, buyerA, roleById.get('BUYER')],
    );
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-fin-p13', 'Store Fin', 'APPROVED')`,
      [storeA, orgA],
    );
    await pool.query(
      `INSERT INTO store_members (id, store_id, user_id, status) VALUES ($1, $2, $3, 'ACTIVE')`,
      [randomUUID(), storeA, merchantA],
    );
    await pool.query(`INSERT INTO warehouses (id, store_id, name) VALUES ($1, $2, 'WH FIN')`, [warehouseA, storeA]);
    await pool.query(
      `INSERT INTO products (id, store_id, slug, title, status) VALUES ($1, $2, 'fin-product-a', 'FIN Product A', 'ACTIVE')`,
      [productIdA, storeA],
    );
    await pool.query(
      `INSERT INTO product_variants (id, product_id, sku) VALUES ($1, $2, 'FIN-SKU-A')`,
      [variantA, productIdA],
    );
    await pool.query(
      `INSERT INTO merchant_offers (id, store_id, product_id, variant_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [offerA, storeA, productIdA, variantA],
    );
    await pool.query(
      `INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved) VALUES ($1, $2, $3, 10000, 0)`,
      [invItemA, variantA, warehouseA],
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  }, 30_000);

  async function openDispute(orderId: string) {
    return disputesService.createDispute({
      orderId,
      raisedBy: buyerA,
      againstId: merchantA,
      reason: 'Item not as described — financial test',
    });
  }

  // ── FIN-DSH-01: Resolve without refund ───────────────────────────

  it('FIN-DSH-01: resolve dispute without issuing a refund persists RESOLVED with no refund rows', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    const resolved = await disputesService.resolveDispute(dispute.id, adminA, 'Merchant complied; no refund warranted', adminCaller);

    expect(resolved['status']).toBe('RESOLVED');
    expect(resolved['resolution']).toBe('Merchant complied; no refund warranted');

    const refundCount = await pool.query(
      `SELECT count(*)::int AS n FROM refunds WHERE order_id = $1`, [orderId],
    );
    expect(refundCount.rows[0].n).toBe(0);

    const events = await pool.query(
      `SELECT event_type, metadata FROM dispute_events WHERE dispute_id = $1`, [dispute.id],
    );
    expect(events.rows.map((r: any) => r.event_type)).toContain('RESOLVED');

    const outbox = await pool.query(
      `SELECT event_type, payload FROM outbox_events WHERE aggregate_id = $1`, [dispute.id],
    );
    const resolvedEvt = outbox.rows.find((r: any) => r.event_type === 'dispute.resolved');
    expect(resolvedEvt).toBeTruthy();
    expect(resolvedEvt.payload.refundId).toBeNull();
  }, 60_000);

  // ── FIN-DSH-02: Resolve with pending refund ──────────────────────

  it('FIN-DSH-02: resolve dispute with refund recommendation creates REQUESTED refund linked to the dispute', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    const resolved = await disputesService.resolveDispute(
      dispute.id, adminA, 'Partial refund approved by admin', adminCaller,
      { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    );

    expect(resolved['status']).toBe('RESOLVED');

    const refund = await pool.query(
      `SELECT id, status, amount_minor, idempotency_key, dispute_id, return_request_id
       FROM refunds WHERE order_id = $1`, [orderId],
    );
    expect(refund.rows.length).toBe(1);
    expect(refund.rows[0].status).toBe('REQUESTED');
    expect(Number(refund.rows[0].amount_minor)).toBe(1000);
    expect(refund.rows[0].idempotency_key).toBe(`dispute-refund:${dispute.id}`);
    expect(refund.rows[0].dispute_id).toBe(dispute.id);   // P13 linkage

    // Payment must be untouched by a REQUESTED (pending) refund
    const payment = await pool.query(
      `SELECT status FROM payment_records WHERE order_id = $1`, [orderId],
    );
    expect(payment.rows[0].status).toBe('CONFIRMED');

    const evt = await pool.query(
      `SELECT metadata FROM dispute_events WHERE dispute_id = $1 AND event_type = 'RESOLVED'`, [dispute.id],
    );
    expect(evt.rows[0].metadata.refundId).toBe(refund.rows[0].id);
    expect(Number(evt.rows[0].metadata.amountMinor)).toBe(1000);
  }, 60_000);

  // ── FIN-DSH-03: Approve dispute refund via P12 ───────────────────

  it('FIN-DSH-03: approve dispute refund through P12 path yields SUCCEEDED + PARTIALLY_REFUNDED payment', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    await disputesService.resolveDispute(
      dispute.id, adminA, 'Refund approved', adminCaller,
      { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    );
    const refundRow = (await pool.query(
      `SELECT id FROM refunds WHERE order_id = $1`, [orderId],
    )).rows[0];

    const approved = await paymentsService.approveRefund(refundRow.id, adminA, adminCaller);
    expect(approved.status).toBe('SUCCEEDED');

    const payment = await pool.query(`SELECT status FROM payment_records WHERE order_id = $1`, [orderId]);
    expect(payment.rows[0].status).toBe('PARTIALLY_REFUNDED');

    const outbox = await pool.query(
      `SELECT event_type FROM outbox_events WHERE event_type IN ('payment.refund_succeeded') AND payload->>'refundId' = $1`,
      [refundRow.id],
    );
    expect(outbox.rows.length).toBe(1);

    // Non-admin cannot approve
    await expect(
      paymentsService.approveRefund(refundRow.id, buyerA, { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA }),
    ).rejects.toThrow(/Only admins/);
  }, 60_000);

  // ── FIN-DSH-04: Dispute↔return linkage ───────────────────────────

  it('FIN-DSH-04: dispute resolution links refund and dispute to the originating return request', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    // Create a real return request for the same order (REQUESTED state)
    const itemsRes = await pool.query(`SELECT id FROM order_items WHERE order_id = $1`, [orderId]);
    const ret = await returnsService.createReturnRequest({
      subOrderId: orderId,
      reason: 'PRODUCT_NOT_AS_DESCRIBED',
      lines: [{ orderItemId: itemsRes.rows[0].id, quantity: 1 }],
    }, { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA });

    const resolved = await disputesService.resolveDispute(
      dispute.id, adminA, 'Refund tied to return', adminCaller,
      { amountMinor: 900, reason: 'PRODUCT_NOT_AS_DESCRIBED', returnRequestId: ret.id },
    );

    expect(resolved['returnRequestId']).toBe(ret.id);

    const refund = await pool.query(
      `SELECT dispute_id, return_request_id FROM refunds WHERE order_id = $1`, [orderId],
    );
    expect(refund.rows[0].dispute_id).toBe(dispute.id);
    // return_request_id on the refund is only set by the return flow; the dispute
    // flow links the return via the dispute row — verify no cross-contamination
    expect(refund.rows[0].return_request_id).toBeNull();
  }, 60_000);

  // ── FIN-DSH-05: Retry resolution — no duplicate refund ───────────

  it('FIN-DSH-05: retrying dispute resolution is rejected and creates no duplicate refund', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    await disputesService.resolveDispute(
      dispute.id, adminA, 'First resolution stands', adminCaller,
      { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    );

    await expect(
      disputesService.resolveDispute(
        dispute.id, adminA, 'Second attempt', adminCaller,
        { amountMinor: 2000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
      ),
    ).rejects.toThrow(/already RESOLVED/);

    const refundsRes = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(amount_minor),0)::int AS total FROM refunds WHERE order_id = $1`, [orderId],
    );
    expect(refundsRes.rows[0].n).toBe(1);
    expect(refundsRes.rows[0].total).toBe(1000);

    const d = await pool.query(`SELECT resolution FROM disputes WHERE id = $1`, [dispute.id]);
    expect(d.rows[0].resolution).toBe('First resolution stands');
  }, 60_000);

  // ── FIN-DSH-06: Orphan-refund recovery ───────────────────────────

  it('FIN-DSH-06: refund committed by a crashed attempt is reused on retry (no duplicate, dispute resolves)', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);
    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;

    // Simulate the crash window of the previous design: requestRefund committed,
    // dispute-resolution transaction never completed.
    const orphanRefundId = randomUUID();
    await pool.query(
      `INSERT INTO refunds (id, payment_record_id, order_id, idempotency_key, amount_minor, currency, status, reason, requested_by)
       VALUES ($1, $2, $3, $4, 1000, 'SYP', 'REQUESTED', 'PRODUCT_NOT_AS_DESCRIBED', $5)`,
      [orphanRefundId, paymentId, orderId, `dispute-refund:${dispute.id}`, buyerA],
    );

    const resolved = await disputesService.resolveDispute(
      dispute.id, adminA, 'Recovered resolution', adminCaller,
      { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    );

    expect(resolved['status']).toBe('RESOLVED');

    const refundsRes = await pool.query(
      `SELECT id, dispute_id FROM refunds WHERE order_id = $1`, [orderId],
    );
    expect(refundsRes.rows.length).toBe(1);           // reused, not duplicated
    expect(refundsRes.rows[0].id).toBe(orphanRefundId);
    expect(refundsRes.rows[0].dispute_id).toBe(dispute.id);
  }, 60_000);

  // ── FIN-DSH-20: Dispute refund recovery payload integrity ────────

  it('FIN-DSH-20: orphan dispute refund with a different amount is not reused or linked', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);
    const paymentId = (await pool.query(`SELECT id FROM payment_records WHERE order_id = $1`, [orderId])).rows[0].id;
    const orphanRefundId = randomUUID();
    await pool.query(
      `INSERT INTO refunds (id, payment_record_id, order_id, idempotency_key, amount_minor, currency, status, reason, requested_by)
       VALUES ($1, $2, $3, $4, 1000, 'SYP', 'REQUESTED', 'PRODUCT_NOT_AS_DESCRIBED', $5)`,
      [orphanRefundId, paymentId, orderId, `dispute-refund:${dispute.id}`, buyerA],
    );

    await expect(disputesService.resolveDispute(
      dispute.id, adminA, 'Mismatched retry must not resolve', adminCaller,
      { amountMinor: 1200, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    )).rejects.toThrow(/idempotency key was already used for a different request/i);

    const state = await pool.query(`SELECT status FROM disputes WHERE id = $1`, [dispute.id]);
    const refund = await pool.query(`SELECT dispute_id FROM refunds WHERE id = $1`, [orphanRefundId]);
    expect(state.rows[0].status).toBe('OPEN');
    expect(refund.rows[0].dispute_id).toBeNull();
  }, 60_000);

  it('FIN-DSH-20: orphan dispute refund with a different reason is not reused or linked', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);
    const paymentId = (await pool.query(`SELECT id FROM payment_records WHERE order_id = $1`, [orderId])).rows[0].id;
    const orphanRefundId = randomUUID();
    await pool.query(
      `INSERT INTO refunds (id, payment_record_id, order_id, idempotency_key, amount_minor, currency, status, reason, requested_by)
       VALUES ($1, $2, $3, $4, 1000, 'SYP', 'REQUESTED', 'CUSTOMER_REQUEST', $5)`,
      [orphanRefundId, paymentId, orderId, `dispute-refund:${dispute.id}`, buyerA],
    );

    await expect(disputesService.resolveDispute(
      dispute.id, adminA, 'Mismatched retry must not resolve', adminCaller,
      { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    )).rejects.toThrow(/idempotency key was already used for a different request/i);

    const state = await pool.query(`SELECT status FROM disputes WHERE id = $1`, [dispute.id]);
    const refund = await pool.query(`SELECT dispute_id FROM refunds WHERE id = $1`, [orphanRefundId]);
    expect(state.rows[0].status).toBe('OPEN');
    expect(refund.rows[0].dispute_id).toBeNull();
  }, 60_000);


  // ── FIN-DSH-24: Return refund recovery payload integrity ────────

  it('FIN-DSH-24: orphan return refund with a different amount is not reused or linked', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const items = await pool.query(`SELECT id FROM order_items WHERE order_id = $1`, [orderId]);
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER' as const, activeOrg: orgA };
    const ret = await returnsService.createReturnRequest({
      subOrderId: orderId,
      reason: 'PRODUCT_NOT_AS_DESCRIBED',
      lines: [{ orderItemId: items.rows[0].id, quantity: 1 }],
    }, buyerCaller);
    await returnsService.transitionReturn(ret.id, 'MERCHANT_APPROVED', merchantCaller);
    await returnsService.transitionReturn(ret.id, 'BUYER_SHIPPED', buyerCaller, { trackingNumber: 'TRK-FIN24' });
    await returnsService.transitionReturn(ret.id, 'RECEIVED', merchantCaller);
    await returnsService.transitionReturn(ret.id, 'INSPECTED', merchantCaller, { condition: 'GOOD' });

    const current = await pool.query(
      `SELECT payment_record_id, requested_refund_minor, buyer_id FROM return_requests WHERE id = $1`,
      [ret.id],
    );
    const paymentId = current.rows[0].payment_record_id;
    const orphanRefundId = randomUUID();
    await pool.query(
      `INSERT INTO refunds (id, payment_record_id, order_id, idempotency_key, amount_minor, currency, status, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, 'SYP', 'REQUESTED', 'PRODUCT_NOT_AS_DESCRIBED', $6)`,
      [orphanRefundId, paymentId, orderId, `return-refund:${ret.id}`, Number(current.rows[0].requested_refund_minor), buyerA],
    );

    await expect(
      returnsService.transitionReturn(ret.id, 'REFUND_PENDING', merchantCaller),
    ).rejects.toThrow(/idempotency key was already used for a different request/i);

    const state = await pool.query(`SELECT status FROM return_requests WHERE id = $1`, [ret.id]);
    const refund = await pool.query(`SELECT return_request_id FROM refunds WHERE id = $1`, [orphanRefundId]);
    expect(state.rows[0].status).toBe('INSPECTED');
    expect(refund.rows[0].return_request_id).toBeNull();
  }, 60_000);

  it('FIN-DSH-25: orphan return refund with a different reason is not reused or linked', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const items = await pool.query(`SELECT id FROM order_items WHERE order_id = $1`, [orderId]);
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER' as const, activeOrg: orgA };
    const ret = await returnsService.createReturnRequest({
      subOrderId: orderId,
      reason: 'PRODUCT_NOT_AS_DESCRIBED',
      lines: [{ orderItemId: items.rows[0].id, quantity: 1 }],
    }, buyerCaller);
    await returnsService.transitionReturn(ret.id, 'MERCHANT_APPROVED', merchantCaller);
    await returnsService.transitionReturn(ret.id, 'BUYER_SHIPPED', buyerCaller, { trackingNumber: 'TRK-FIN25' });
    await returnsService.transitionReturn(ret.id, 'RECEIVED', merchantCaller);
    await returnsService.transitionReturn(ret.id, 'INSPECTED', merchantCaller, { condition: 'GOOD' });

    const current = await pool.query(
      `SELECT payment_record_id, requested_refund_minor FROM return_requests WHERE id = $1`,
      [ret.id],
    );
    const orphanRefundId = randomUUID();
    await pool.query(
      `INSERT INTO refunds (id, payment_record_id, order_id, idempotency_key, amount_minor, currency, status, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, 'SYP', 'REQUESTED', 'CUSTOMER_REQUEST', $6)`,
      [orphanRefundId, current.rows[0].payment_record_id, orderId, `return-refund:${ret.id}`, Number(current.rows[0].requested_refund_minor), buyerA],
    );

    await expect(
      returnsService.transitionReturn(ret.id, 'REFUND_PENDING', merchantCaller),
    ).rejects.toThrow(/idempotency key was already used for a different request/i);

    const state = await pool.query(`SELECT status FROM return_requests WHERE id = $1`, [ret.id]);
    const refund = await pool.query(`SELECT return_request_id FROM refunds WHERE id = $1`, [orphanRefundId]);
    expect(state.rows[0].status).toBe('INSPECTED');
    expect(refund.rows[0].return_request_id).toBeNull();
  }, 60_000);

  // ── FIN-DSH-23: Concurrent dispute resolution idempotency ───────

  it('FIN-DSH-23: concurrent identical dispute resolutions commit one resolution event and outbox message', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    const results = await Promise.allSettled([
      disputesService.resolveDispute(
        dispute.id, adminA, 'Approved after review', adminCaller,
        { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
      ),
      disputesService.resolveDispute(
        dispute.id, adminA, 'Approved after review', adminCaller,
        { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
      ),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);

    const state = await pool.query(
      `SELECT status, resolution FROM disputes WHERE id = $1`, [dispute.id],
    );
    expect(state.rows[0]).toEqual({
      status: 'RESOLVED',
      resolution: 'Approved after review',
    });

    const events = await pool.query(
      `SELECT count(*)::int AS count FROM dispute_events
       WHERE dispute_id = $1 AND event_type = 'RESOLVED'`,
      [dispute.id],
    );
    expect(events.rows[0].count).toBe(1);

    const outbox = await pool.query(
      `SELECT count(*)::int AS count FROM outbox_events
       WHERE aggregate_id = $1 AND event_type = 'dispute.resolved'`,
      [dispute.id],
    );
    expect(outbox.rows[0].count).toBe(1);

    const refunds = await pool.query(
      `SELECT count(*)::int AS count, count(*) FILTER (WHERE dispute_id = $1)::int AS linked
       FROM refunds WHERE order_id = $2`,
      [dispute.id, orderId],
    );
    expect(refunds.rows[0]).toEqual({ count: 1, linked: 1 });
  }, 90_000);

  // ── FIN-DSH-07: Simultaneous return + dispute refunds ────────────

  it('FIN-DSH-07: concurrent return-initiated and dispute-initiated refunds respect the cumulative cap', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);

    // Bring a return to INSPECTED so both refund sources fire simultaneously
    const itemsRes = await pool.query(`SELECT id FROM order_items WHERE order_id = $1`, [orderId]);
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER' as const, activeOrg: orgA };
    const ret = await returnsService.createReturnRequest({
      subOrderId: orderId,
      reason: 'PRODUCT_NOT_AS_DESCRIBED',
      lines: [{ orderItemId: itemsRes.rows[0].id, quantity: 2 }],
    }, buyerCaller);
    await returnsService.transitionReturn(ret.id, 'MERCHANT_APPROVED', merchantCaller);
    await returnsService.transitionReturn(ret.id, 'BUYER_SHIPPED', buyerCaller, { trackingNumber: 'TRK-FIN7' });
    await returnsService.transitionReturn(ret.id, 'RECEIVED', merchantCaller);
    await returnsService.transitionReturn(ret.id, 'INSPECTED', merchantCaller, { condition: 'GOOD' });

    const returnRefundMinor = Number(
      (await pool.query(`SELECT requested_refund_minor FROM return_requests WHERE id = $1`, [ret.id])).rows[0].requested_refund_minor,
    );

    const results = await Promise.allSettled([
      returnsService.transitionReturn(ret.id, 'REFUND_PENDING', merchantCaller),
      disputesService.resolveDispute(
        dispute.id, adminA, 'Concurrent dispute refund', adminCaller,
        { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
      ),
    ]);

    const refundsRes = await pool.query(
      `SELECT idempotency_key, amount_minor::int AS amt FROM refunds WHERE order_id = $1`, [orderId],
    );
    // No duplicate rows per source
    const keys = refundsRes.rows.map((r: any) => r.idempotency_key);
    expect(new Set(keys).size).toBe(keys.length);

    // Cumulative cap invariant: total ≤ confirmed amount (3450)
    const total = refundsRes.rows.reduce((s: number, r: any) => s + r.amt, 0);
    expect(total).toBeLessThanOrEqual(3450);

    const okCount = results.filter(r => r.status === 'fulfilled').length;
    if (returnRefundMinor + 1000 <= 3450) {
      // Both fit under the cap: FOR UPDATE serializes and both must succeed
      expect(okCount).toBe(2);
      expect(refundsRes.rows.length).toBe(2);
      expect(total).toBe(returnRefundMinor + 1000);
    } else {
      // Over cap: exactly one committed; the other rejected with the cap error
      expect(okCount).toBe(1);
      expect(refundsRes.rows.length).toBe(1);
      const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      expect(String(failed.reason?.message)).toMatch(/exceeds refundable/);
    }
  }, 60_000);

  // ── FIN-DSH-08: Concurrent approveRefund + calculateSettlement ───

  it('FIN-DSH-08: concurrent refund approval and settlement calculation produce one internally consistent settlement', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const dispute = await openDispute(orderId);
    await disputesService.resolveDispute(
      dispute.id, adminA, 'Refund pending while settlement runs', adminCaller,
      { amountMinor: 1000, reason: 'PRODUCT_NOT_AS_DESCRIBED' },
    );
    const refundId = (await pool.query(`SELECT id FROM refunds WHERE order_id = $1`, [orderId])).rows[0].id;

    await Promise.allSettled([
      paymentsService.approveRefund(refundId, adminA, adminCaller),
      paymentsService.calculateSettlement(orderId, adminA, adminCaller),
    ]);

    const settlements = await pool.query(
      `SELECT gross_minor::int AS gross, refund_minor::int AS refund, commission_minor::int AS comm, fee_minor::int AS fee, net_minor::int AS net, status
       FROM settlement_records WHERE sub_order_id = $1`, [orderId],
    );
    // Unique active-settlement index must hold under the race
    expect(settlements.rows.length).toBe(1);

    const s = settlements.rows[0];
    expect(s.status).toBe('CALCULATED');
    // Internal consistency: net = gross − refunds − commission − fees
    expect(s.net).toBe(s.gross - s.refund - s.comm - s.fee);
    // Either the refund was captured or not — but the row must be self-consistent
    expect([0, 1000]).toContain(s.refund);
  }, 60_000);


  // ── FIN-DSH-11: Concurrent partial refund approvals serialize ────

  it('FIN-DSH-11: concurrent partial refund approvals leave a fully refunded payment in REFUNDED state', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };

    const [first, second] = await Promise.all([
      paymentsService.requestRefund(paymentId, 1725, 'CUSTOMER_REQUEST', buyerA, buyerCaller, {
        idempotencyKey: `fin-approve-a-${randomUUID()}`,
      }),
      paymentsService.requestRefund(paymentId, 1725, 'CUSTOMER_REQUEST', buyerA, buyerCaller, {
        idempotencyKey: `fin-approve-b-${randomUUID()}`,
      }),
    ]);

    const approved = await Promise.all([
      paymentsService.approveRefund(first.refundId, adminA, adminCaller),
      paymentsService.approveRefund(second.refundId, adminA, adminCaller),
    ]);
    expect(approved.map(refund => refund.status)).toEqual(['SUCCEEDED', 'SUCCEEDED']);

    const payment = await pool.query(
      `SELECT status FROM payment_records WHERE id = $1`, [paymentId],
    );
    expect(payment.rows[0].status).toBe('REFUNDED');

    const total = await pool.query(
      `SELECT count(*)::int AS count, COALESCE(SUM(amount_minor), 0)::int AS total
       FROM refunds WHERE payment_record_id = $1 AND status = 'SUCCEEDED'`,
      [paymentId],
    );
    expect(total.rows[0]).toEqual({ count: 2, total: 3450 });
  }, 60_000);

  // ── FIN-DSH-12: Refund request idempotency ────────────────────────

  it('FIN-DSH-12: concurrent retries with the same refund idempotency key reuse one request', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    const idempotencyKey = `fin-refund-idem-${randomUUID()}`;

    const [first, retry] = await Promise.all([
      paymentsService.requestRefund(paymentId, 3450, 'CUSTOMER_REQUEST', buyerA, buyerCaller, { idempotencyKey }),
      paymentsService.requestRefund(paymentId, 3450, 'CUSTOMER_REQUEST', buyerA, buyerCaller, { idempotencyKey }),
    ]);

    expect(retry.refundId).toBe(first.refundId);
    expect(retry.status).toBe('REQUESTED');

    const rows = await pool.query(
      `SELECT count(*)::int AS count FROM refunds WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    expect(rows.rows[0].count).toBe(1);

    await expect(
      paymentsService.requestRefund(paymentId, 1000, 'CUSTOMER_REQUEST', buyerA, buyerCaller, { idempotencyKey }),
    ).rejects.toThrow(/idempotency key was already used/i);
  }, 60_000);

  // ── FIN-DSH-13: Settlement calculation idempotency ───────────────

  it('FIN-DSH-13: concurrent settlement calculations reuse one payable settlement', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);

    const [first, retry] = await Promise.all([
      paymentsService.calculateSettlement(orderId, adminA, adminCaller),
      paymentsService.calculateSettlement(orderId, adminA, adminCaller),
    ]);

    expect(retry.id).toBe(first.id);
    expect(first.status).toBe('CALCULATED');

    const rows = await pool.query(
      `SELECT count(*)::int AS count FROM settlement_records WHERE sub_order_id = $1`,
      [orderId],
    );
    expect(rows.rows[0].count).toBe(1);

    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;
    const history = await pool.query(
      `SELECT count(*)::int AS count FROM payment_events
       WHERE payment_record_id = $1 AND event_type = 'PAYMENT_SETTLEMENT_CALCULATED'`,
      [paymentId],
    );
    expect(history.rows[0].count).toBe(1);

    const events = await pool.query(
      `SELECT count(*)::int AS count FROM outbox_events
       WHERE aggregate_id = $1 AND event_type = 'payment.settlement_calculated'`,
      [paymentId],
    );
    expect(events.rows[0].count).toBe(1);
  }, 60_000);

  // ── FIN-DSH-14: Paid settlement cannot be recalculated ────────────

  it('FIN-DSH-14: recalculation after PAID is rejected without creating another payable record', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const settlement = await paymentsService.calculateSettlement(orderId, adminA, adminCaller);
    const paid = await paymentsService.markSettlementPaid(settlement.id, adminA, adminCaller);
    expect(paid.status).toBe('PAID');

    await expect(
      paymentsService.calculateSettlement(orderId, adminA, adminCaller),
    ).rejects.toThrow(/settlement already exists in PAID status/i);

    const rows = await pool.query(
      `SELECT status, count(*)::int AS count FROM settlement_records
       WHERE sub_order_id = $1 GROUP BY status`,
      [orderId],
    );
    expect(rows.rows).toEqual([{ status: 'PAID', count: 1 }]);
  }, 60_000);

  // ── FIN-DSH-15: No settlement before payment confirmation ───────

  it('FIN-DSH-15: refuses to calculate settlement while payment awaits confirmation', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    await pool.query(
      `UPDATE payment_records SET status = 'AWAITING_PAYMENT', confirmed_amount_minor = NULL
       WHERE order_id = $1`,
      [orderId],
    );

    await expect(
      paymentsService.calculateSettlement(orderId, adminA, adminCaller),
    ).rejects.toThrow(/cannot calculate settlement for payment in AWAITING_PAYMENT status/i);

    const rows = await pool.query(
      `SELECT count(*)::int AS count FROM settlement_records WHERE sub_order_id = $1`,
      [orderId],
    );
    expect(rows.rows[0].count).toBe(0);
  }, 60_000);

  // ── FIN-DSH-16: Minor-unit amount validation ────────────────────

  it('FIN-DSH-16: rejects fractional or non-positive verification, COD and refund amounts', async () => {
    const verifyOrderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    await pool.query(
      `UPDATE payment_records SET status = 'AWAITING_VERIFICATION' WHERE order_id = $1`,
      [verifyOrderId],
    );
    const verifyPaymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [verifyOrderId],
    )).rows[0].id;
    await expect(
      paymentsService.verifyPayment(verifyPaymentId, 'CONFIRMED', adminA, adminCaller, { verifiedAmountMinor: 1.5 }),
    ).rejects.toThrow(/positive safe integer in minor units/i);
    const verifyState = await pool.query(
      `SELECT status FROM payment_records WHERE id = $1`, [verifyPaymentId],
    );
    expect(verifyState.rows[0].status).toBe('AWAITING_VERIFICATION');

    const codOrderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    await pool.query(
      `UPDATE payment_records SET payment_method = 'CASH_ON_DELIVERY', status = 'AWAITING_PAYMENT'
       WHERE order_id = $1`,
      [codOrderId],
    );
    const codPaymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [codOrderId],
    )).rows[0].id;
    const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER' as const, activeOrg: orgA };
    await expect(
      paymentsService.confirmCash(codPaymentId, merchantA, merchantCaller, { amountCollectedMinor: 0 }),
    ).rejects.toThrow(/positive safe integer in minor units/i);
    const codState = await pool.query(
      `SELECT status FROM payment_records WHERE id = $1`, [codPaymentId],
    );
    expect(codState.rows[0].status).toBe('AWAITING_PAYMENT');

    const refundOrderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const refundPaymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [refundOrderId],
    )).rows[0].id;
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    await expect(
      paymentsService.requestRefund(refundPaymentId, 1.25, 'CUSTOMER_REQUEST', buyerA, buyerCaller),
    ).rejects.toThrow(/positive safe integer in minor units/i);
  }, 90_000);

  // ── FIN-DSH-21: Partial refund order payment projection ──────────

  it('FIN-DSH-21: partial refund approval synchronizes order payment status without changing fulfillment', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    const refund = await paymentsService.requestRefund(
      paymentId, 1000, 'CUSTOMER_REQUEST', buyerA, buyerCaller,
      { idempotencyKey: `fin-order-projection-partial-${randomUUID()}` },
    );

    const approved = await paymentsService.approveRefund(refund.refundId, adminA, adminCaller);
    expect(approved.status).toBe('SUCCEEDED');

    const state = await pool.query(
      `SELECT o.status, o.payment_status, p.status AS payment_record_status
       FROM orders o JOIN payment_records p ON p.order_id = o.id WHERE o.id = $1`,
      [orderId],
    );
    expect(state.rows[0]).toEqual({
      status: 'DELIVERED',
      payment_status: 'PARTIALLY_REFUNDED',
      payment_record_status: 'PARTIALLY_REFUNDED',
    });
  }, 60_000);

  // ── FIN-DSH-22: Full refund order payment projection ──────────────

  it('FIN-DSH-22: full refund approval synchronizes order payment status without changing fulfillment', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;
    const buyerCaller = { sub: buyerA, role: 'BUYER' as const, activeOrg: orgA };
    const refund = await paymentsService.requestRefund(
      paymentId, 3450, 'CUSTOMER_REQUEST', buyerA, buyerCaller,
      { idempotencyKey: `fin-order-projection-full-${randomUUID()}` },
    );

    const approved = await paymentsService.approveRefund(refund.refundId, adminA, adminCaller);
    expect(approved.status).toBe('SUCCEEDED');

    const state = await pool.query(
      `SELECT o.status, o.payment_status, p.status AS payment_record_status
       FROM orders o JOIN payment_records p ON p.order_id = o.id WHERE o.id = $1`,
      [orderId],
    );
    expect(state.rows[0]).toEqual({
      status: 'DELIVERED',
      payment_status: 'REFUNDED',
      payment_record_status: 'REFUNDED',
    });
  }, 60_000);

  // ── FIN-DSH-18: COD order/payment projection consistency ─────────

  it('FIN-DSH-18: confirms the order payment projection without rewinding its fulfillment status', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    await pool.query(
      `UPDATE orders SET status = 'DELIVERED', payment_status = 'AWAITING_PAYMENT' WHERE id = $1`,
      [orderId],
    );
    await pool.query(
      `UPDATE payment_records
       SET payment_method = 'CASH_ON_DELIVERY', status = 'AWAITING_PAYMENT', confirmed_amount_minor = NULL
       WHERE order_id = $1`,
      [orderId],
    );
    const paymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [orderId],
    )).rows[0].id;
    const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER' as const, activeOrg: orgA };

    const payment = await paymentsService.confirmCash(
      paymentId,
      merchantA,
      merchantCaller,
      { amountCollectedMinor: 3450 },
    );

    expect(payment.status).toBe('CONFIRMED');
    const order = await pool.query(
      `SELECT status, payment_status FROM orders WHERE id = $1`,
      [orderId],
    );
    expect(order.rows[0]).toEqual({
      status: 'DELIVERED',
      payment_status: 'CONFIRMED',
    });
    const event = await pool.query(
      `SELECT event_type, from_status, to_status
       FROM payment_events
       WHERE payment_record_id = $1 AND event_type = 'PAYMENT_CONFIRMED'`,
      [paymentId],
    );
    expect(event.rows).toHaveLength(1);
  }, 60_000);

  // ── FIN-DSH-17: Settlement payment transition history and outbox ──

  it('FIN-DSH-17: concurrent settlement pay attempts persist one PAID event and one outbox event', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const settlement = await paymentsService.calculateSettlement(orderId, adminA, adminCaller);

    const results = await Promise.allSettled([
      paymentsService.markSettlementPaid(settlement.id, adminA, adminCaller, {
        paymentReference: 'BANK-REF-FIN-17',
        notes: 'Manual settlement transfer confirmed',
      }),
      paymentsService.markSettlementPaid(settlement.id, adminA, adminCaller, {
        paymentReference: 'BANK-REF-FIN-17',
        notes: 'Duplicate concurrent request',
      }),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);

    const paid = await pool.query(
      `SELECT status, payment_reference FROM settlement_records WHERE id = $1`,
      [settlement.id],
    );
    expect(paid.rows).toEqual([{ status: 'PAID', payment_reference: 'BANK-REF-FIN-17' }]);

    const paymentId = (await pool.query(
      `SELECT payment_record_id FROM settlement_records WHERE id = $1`,
      [settlement.id],
    )).rows[0].payment_record_id;

    const history = await pool.query(
      `SELECT event_type, from_status, to_status, amount_minor::int AS amount, actor_id
       FROM payment_events
       WHERE payment_record_id = $1 AND event_type = 'PAYMENT_SETTLEMENT_PAID'`,
      [paymentId],
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({
      event_type: 'PAYMENT_SETTLEMENT_PAID',
      from_status: 'CALCULATED',
      to_status: 'PAID',
      amount: settlement.netMinor,
      actor_id: adminA,
    });

    const outbox = await pool.query(
      `SELECT event_type, payload->>'settlementId' AS settlement_id
       FROM outbox_events
       WHERE aggregate_id = $1 AND event_type = 'payment.settlement_paid'`,
      [paymentId],
    );
    expect(outbox.rows).toEqual([{
      event_type: 'payment.settlement_paid',
      settlement_id: settlement.id,
    }]);
  }, 60_000);


  // ── FIN-DSH-19: Missing breakdown blocks payment confirmation ───

  it('FIN-DSH-19: missing financial breakdown rolls back manual and COD payment confirmation', async () => {
    const verifyOrderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const verifyPaymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [verifyOrderId],
    )).rows[0].id as string;
    await pool.query(
      `UPDATE payment_records SET status = 'AWAITING_VERIFICATION' WHERE id = $1`,
      [verifyPaymentId],
    );
    await pool.query(
      `DELETE FROM order_financial_breakdown WHERE order_id = $1`,
      [verifyOrderId],
    );

    await expect(
      paymentsService.verifyPayment(verifyPaymentId, 'CONFIRMED', adminA, adminCaller),
    ).rejects.toThrow(/financial breakdown is missing/i);

    const verifyState = await pool.query(
      `SELECT status FROM payment_records WHERE id = $1`, [verifyPaymentId],
    );
    expect(verifyState.rows[0].status).toBe('AWAITING_VERIFICATION');

    const codOrderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const codPaymentId = (await pool.query(
      `SELECT id FROM payment_records WHERE order_id = $1`, [codOrderId],
    )).rows[0].id as string;
    await pool.query(
      `UPDATE payment_records
       SET payment_method = 'CASH_ON_DELIVERY', status = 'AWAITING_PAYMENT'
       WHERE id = $1`,
      [codPaymentId],
    );
    await pool.query(
      `DELETE FROM order_financial_breakdown WHERE order_id = $1`,
      [codOrderId],
    );

    const merchantCaller = { sub: merchantA, role: 'MERCHANT_OWNER' as const, activeOrg: orgA };
    await expect(
      paymentsService.confirmCash(codPaymentId, merchantA, merchantCaller, { amountCollectedMinor: 3450 }),
    ).rejects.toThrow(/financial breakdown is missing/i);

    const codState = await pool.query(
      `SELECT status FROM payment_records WHERE id = $1`, [codPaymentId],
    );
    expect(codState.rows[0].status).toBe('AWAITING_PAYMENT');

    const confirmedEvents = await pool.query(
      `SELECT count(*)::int AS count FROM payment_events
       WHERE payment_record_id IN ($1, $2) AND event_type = 'PAYMENT_CONFIRMED'`,
      [verifyPaymentId, codPaymentId],
    );
    expect(confirmedEvents.rows[0].count).toBe(0);

    const confirmationOutbox = await pool.query(
      `SELECT count(*)::int AS count FROM outbox_events
       WHERE aggregate_id IN ($1, $2) AND event_type = 'payment.confirmed'`,
      [verifyPaymentId, codPaymentId],
    );
    expect(confirmationOutbox.rows[0].count).toBe(0);
  }, 90_000);

  // ── FIN-DSH-09: Refund after settlement PAID ─────────────────────

  it('FIN-DSH-09: refund succeeding after settlement is PAID creates an ADJUSTMENT and preserves the paid record', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);

    const pendingRet = await advanceReturnToRefundPending(
      returnsService, pool, orderId, 2, buyerA, merchantA, orgA,
    );
    const refundId = pendingRet.refundId as string;
    const refundMinor = Number(
      (await pool.query(`SELECT amount_minor::int AS amt FROM refunds WHERE id = $1`, [refundId])).rows[0].amt,
    );

    // Settlement calculated and PAID while the refund is still REQUESTED
    const settlement = await paymentsService.calculateSettlement(orderId, adminA, adminCaller);
    const paidSettlement = await paymentsService.markSettlementPaid(settlement.id, adminA, adminCaller);
    expect(paidSettlement.status).toBe('PAID');

    // Now the refund succeeds and the return completes
    await paymentsService.approveRefund(refundId, adminA, adminCaller);
    const refunded = await returnsService.transitionReturn(pendingRet.id, 'REFUNDED', adminCaller);
    expect(refunded).toBeDefined();
    expect(refunded!.status).toBe('REFUNDED');

    const rows = await pool.query(
      `SELECT status, gross_minor::int AS gross, refund_minor::int AS refund, net_minor::int AS net
       FROM settlement_records WHERE sub_order_id = $1 ORDER BY created_at`, [orderId],
    );
    expect(rows.rows.length).toBe(2);

    const paid = rows.rows.find((r: any) => r.status === 'PAID')!;
    const adjustment = rows.rows.find((r: any) => r.status === 'ADJUSTMENT')!;

    // Original paid settlement untouched (financial immutability)
    expect(paid.refund).toBe(0);
    // Adjustment carries the full refund as a negative net
    expect(adjustment.refund).toBe(refundMinor);
    expect(adjustment.gross).toBe(0);
    expect(adjustment.net).toBe(-refundMinor);

    // Return event + outbox recorded once
    const evts = await pool.query(
      `SELECT count(*)::int AS n FROM return_request_events WHERE return_request_id = $1 AND event_type = 'REFUNDED'`,
      [pendingRet.id],
    );
    expect(evts.rows[0].n).toBe(1);
    const obx = await pool.query(
      `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'return.refunded'`,
      [pendingRet.id],
    );
    expect(obx.rows[0].n).toBe(1);
  }, 90_000);

  // ── FIN-DSH-24: Refund adjustment vs concurrent settlement payment ─

  it('FIN-DSH-24: preserves the paid settlement and creates an adjustment when refund completion races payment', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    const pendingRet = await advanceReturnToRefundPending(
      returnsService, pool, orderId, 1, buyerA, merchantA, orgA,
    );
    const refundId = pendingRet.refundId as string;
    const refundMinor = Number(
      (await pool.query(`SELECT amount_minor FROM refunds WHERE id = $1`, [refundId])).rows[0].amount_minor,
    );
    const settlement = await paymentsService.calculateSettlement(orderId, adminA, adminCaller);
    const original = {
      gross: settlement.grossMinor,
      refund: settlement.refundMinor,
      commission: settlement.commissionMinor,
      fee: settlement.feeMinor,
      net: settlement.netMinor,
    };

    await paymentsService.approveRefund(refundId, adminA, adminCaller);

    const lockClient = await pool.connect();
    let transition: Promise<any> | undefined;
    try {
      await lockClient.query('BEGIN');
      await lockClient.query(
        `SELECT id FROM settlement_records WHERE id = $1 FOR UPDATE`,
        [settlement.id],
      );

      transition = returnsService.transitionReturn(pendingRet.id, 'REFUNDED', adminCaller);

      let waitingForSettlementLock = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const activity = await pool.query(
          `SELECT count(*)::int AS count
           FROM pg_stat_activity
           WHERE pid <> $1
             AND wait_event_type = 'Lock'
             AND query ILIKE '%settlement_records%'`,
          [lockClient.processID],
        );
        if (activity.rows[0].count > 0) {
          waitingForSettlementLock = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waitingForSettlementLock).toBe(true);

      await lockClient.query(
        `UPDATE settlement_records SET status = 'PAID', paid_at = now() WHERE id = $1`,
        [settlement.id],
      );
      await lockClient.query('COMMIT');
    } catch (error) {
      await lockClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      lockClient.release();
    }

    const refundedReturn = await transition;
    expect(refundedReturn.status).toBe('REFUNDED');

    const paidSettlement = await pool.query(
      `SELECT status, gross_minor::int AS gross, refund_minor::int AS refund,
              commission_minor::int AS commission, fee_minor::int AS fee, net_minor::int AS net
       FROM settlement_records WHERE id = $1`,
      [settlement.id],
    );
    expect(paidSettlement.rows).toEqual([{ status: 'PAID', ...original }]);

    const adjustments = await pool.query(
      `SELECT status, refund_minor::int AS refund, net_minor::int AS net
       FROM settlement_records
       WHERE sub_order_id = $1 AND status = 'ADJUSTMENT'`,
      [orderId],
    );
    expect(adjustments.rows).toEqual([{
      status: 'ADJUSTMENT',
      refund: refundMinor,
      net: -refundMinor,
    }]);
  }, 60_000);


  // ── FIN-DSH-25: Adjustment currency follows original settlement ──

  it('FIN-DSH-25: post-refund adjustment preserves the original settlement currency', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);
    await pool.query(
      `UPDATE payment_records SET currency = 'USD' WHERE order_id = $1`,
      [orderId],
    );

    const pendingRet = await advanceReturnToRefundPending(
      returnsService, pool, orderId, 1, buyerA, merchantA, orgA,
    );
    const refundId = pendingRet.refundId as string;
    const settlement = await paymentsService.calculateSettlement(orderId, adminA, adminCaller);
    expect(settlement.currency).toBe('USD');

    await paymentsService.markSettlementPaid(settlement.id, adminA, adminCaller, {
      paymentReference: 'USD-SETTLEMENT-FIN-25',
    });
    await paymentsService.approveRefund(refundId, adminA, adminCaller);
    await returnsService.transitionReturn(pendingRet.id, 'REFUNDED', adminCaller);

    const adjustment = await pool.query(
      `SELECT currency, status FROM settlement_records
       WHERE sub_order_id = $1 AND status = 'ADJUSTMENT'`,
      [orderId],
    );
    expect(adjustment.rows).toEqual([{ currency: 'USD', status: 'ADJUSTMENT' }]);
  }, 60_000);

  // ── FIN-DSH-10: Rollback under a losing REFUNDED race ────────────

  it('FIN-DSH-10: concurrent REFUNDED transitions roll back the loser — single event, single settlement debit', async () => {
    const orderId = await createDeliveredOrder(pool, ordersService, buyerA, merchantA, storeA, variantA, offerA, orgA);

    const pendingRet = await advanceReturnToRefundPending(
      returnsService, pool, orderId, 2, buyerA, merchantA, orgA,
    );
    const refundId = pendingRet.refundId as string;
    const refundMinor = Number(
      (await pool.query(`SELECT amount_minor::int AS amt FROM refunds WHERE id = $1`, [refundId])).rows[0].amt,
    );

    // Pre-create an in-place-updatable settlement, then succeed the refund
    await paymentsService.calculateSettlement(orderId, adminA, adminCaller);
    await paymentsService.approveRefund(refundId, adminA, adminCaller);

    const results = await Promise.allSettled([
      returnsService.transitionReturn(pendingRet.id, 'REFUNDED', adminCaller),
      returnsService.transitionReturn(pendingRet.id, 'REFUNDED', adminCaller),
    ]);

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const conflicted = results.filter(
      r => r.status === 'rejected' && /already changed|not been approved|cannot transition/i.test(String((r as any).reason?.message)),
    ).length;
    expect(ok).toBe(1);
    expect(conflicted).toBe(1);

    // Loser transaction rolled back: exactly one REFUNDED event and one outbox row
    const evts = await pool.query(
      `SELECT count(*)::int AS n FROM return_request_events WHERE return_request_id = $1 AND event_type = 'REFUNDED'`,
      [pendingRet.id],
    );
    expect(evts.rows[0].n).toBe(1);
    const obx = await pool.query(
      `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'return.refunded'`,
      [pendingRet.id],
    );
    expect(obx.rows[0].n).toBe(1);

    // Settlement debited exactly once (in-place update, not doubled)
    const s = await pool.query(
      `SELECT refund_minor::int AS refund, net_minor::int AS net, gross_minor::int AS gross, commission_minor::int AS comm, fee_minor::int AS fee
       FROM settlement_records WHERE sub_order_id = $1`, [orderId],
    );
    expect(s.rows.length).toBe(1);
    expect(s.rows[0].refund).toBe(refundMinor);
    expect(s.rows[0].net).toBe(s.rows[0].gross - s.rows[0].refund - s.rows[0].comm - s.rows[0].fee);

    // Final persisted return state
    const ret = await pool.query(
      `SELECT status, actual_refund_minor::int AS actual FROM return_requests WHERE id = $1`, [pendingRet.id],
    );
    expect(ret.rows[0].status).toBe('REFUNDED');
    expect(ret.rows[0].actual).toBe(refundMinor);
  }, 90_000);
});
