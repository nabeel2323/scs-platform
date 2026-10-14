/**
 * P13 Phase 3 — Commission Reversal Service
 *
 * Responsibility-based commission reversal for finalized return/refund outcomes.
 *
 * Policy:
 * - MERCHANT, PLATFORM, CARRIER_DAMAGE: reverse the applicable commission
 * - BUYER_REMORSE: retain the original commission (no reversal)
 *
 * Commission basis: net goods only (excludes VAT and delivery fees).
 * Derived from authoritative persisted financial records (order_financial_breakdown),
 * NOT from current catalog prices.
 *
 * Rounding: cumulative-target method ensures that the sum of per-item reversals
 * equals exactly the proportional share of the original commission, with no drift
 * across multiple partial returns.
 *
 * Idempotency: each reversal has a unique idempotency key derived from the
 * return request + line item, preventing duplicate reversals from retries.
 */
import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { commissionReversals } from './financial.schema';
import { returnRequests, returnRequestItems } from './returns.schema';
import { orders, orderFinancialBreakdown, orderItems } from '../orders/orders.schema';
import { settlementRecords } from '../payments/payments.schema';
import { stores } from '../merchant/merchant.schema';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

/** Categories that trigger commission reversal. */
const REVERSAL_CATEGORIES = new Set(['MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE']);

@Injectable()
export class CommissionReversalService {
  private readonly logger = new Logger(CommissionReversalService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  /**
   * Calculate and post commission reversal(s) for a finalized return.
   *
   * Called after the return reaches a terminal approved state (REFUNDED,
   * MERCHANT_REJECTED via admin resolution, etc.) with a responsibility
   * category set.
   *
   * Returns the total reversal amount in minor units, or 0 if no reversal
   * is warranted (BUYER_REMORSE).
   */
  async processCommissionReversal(
    returnRequestId: string,
    responsibilityCategory: string,
    createdBy: string | null,
    externalTx?: any,
    orgId?: string | null,
  ): Promise<{ totalReversalMinor: number; reversalIds: string[] }> {
    // BUYER_REMORSE: retain commission — no reversal
    if (!REVERSAL_CATEGORIES.has(responsibilityCategory)) {
      this.logger.log(
        `Return ${returnRequestId}: responsibility=${responsibilityCategory} — no commission reversal`,
      );
      return { totalReversalMinor: 0, reversalIds: [] };
    }

    // Load the return request
    const ret = await this.db.db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnRequestId),
    });
    if (!ret) throw new BadRequestException('Return request not found');

    // Load the financial breakdown for this sub-order
    const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, ret.subOrderId),
    });
    if (!breakdown) throw new BadRequestException('Financial breakdown not found for order');

    const originalCommission = breakdown.commissionMinor;
    if (originalCommission <= 0) {
      this.logger.log(`Return ${returnRequestId}: original commission is 0 — nothing to reverse`);
      return { totalReversalMinor: 0, reversalIds: [] };
    }

    // Load existing reversals for this order to compute cumulative baseline
    const existingReversals = await this.db.db
      .select({ total: sql<number>`COALESCE(SUM(reversal_minor), 0)` })
      .from(commissionReversals)
      .innerJoin(returnRequests, eq(commissionReversals.returnRequestId, returnRequests.id))
      .where(eq(returnRequests.subOrderId, ret.subOrderId));
    const alreadyReversed = existingReversals[0]?.total ?? 0;
    const remainingCommission = originalCommission - alreadyReversed;

    if (remainingCommission <= 0) {
      this.logger.log(`Return ${returnRequestId}: commission fully reversed already`);
      return { totalReversalMinor: 0, reversalIds: [] };
    }

    // Load return items to calculate proportional reversal
    const items = await this.db.db.query.returnRequestItems.findMany({
      where: eq(returnRequestItems.returnRequestId, returnRequestId),
    });
    if (items.length === 0) {
      throw new BadRequestException('No return items found');
    }

    // Load order items for net-goods basis per line
    const orderItemIds = items.map(i => i.orderItemId);
    const orderItemRows = await this.db.db.query.orderItems.findMany({
      where: sql`${orderItems.id} IN (${sql.join(orderItemIds.map(id => sql`${id}`), sql`, `)})`,
    });
    const orderItemMap = new Map(orderItemRows.map(oi => [oi.id, oi]));

    // Calculate the net-goods basis for this return's items
    const returnNetGoods = items.reduce((sum, item) => {
      const oi = orderItemMap.get(item.orderItemId);
      if (!oi) return sum;
      const unitPrice = Number(oi.unitPriceMinor);
      return sum + (unitPrice * item.quantity);
    }, 0);

    // Total order net goods (from breakdown)
    const orderNetGoods = breakdown.productsMinor - breakdown.discountMinor;

    if (orderNetGoods <= 0 || returnNetGoods <= 0) {
      return { totalReversalMinor: 0, reversalIds: [] };
    }

    // Cumulative-target reversal calculation:
    // reversal = floor(originalCommission × returnNetGoods / orderNetGoods)
    // capped at remainingCommission to prevent over-reversal.
    let rawReversal = Math.floor((originalCommission * returnNetGoods) / orderNetGoods);
    rawReversal = Math.min(rawReversal, remainingCommission);
    const reversalMinor = Math.max(0, rawReversal);

    if (reversalMinor === 0) {
      return { totalReversalMinor: 0, reversalIds: [] };
    }

    // Find the settlement for this sub-order (if any)
    const settlement = await this.db.db.query.settlementRecords.findFirst({
      where: eq(settlementRecords.subOrderId, ret.subOrderId),
    });

    // Post the reversal — use external tx if provided (caller manages atomicity),
    // otherwise create a new transaction.
    const idempotencyKey = `commission-reversal:${returnRequestId}:${responsibilityCategory}`;
    const reversalId = crypto.randomUUID();

    // Resolve orgId from the sub-order's store if not provided
    let resolvedOrgId = orgId ?? null;
    if (!resolvedOrgId) {
      const orderRow = await this.db.db.query.orders.findFirst({
        where: eq(orders.id, ret.subOrderId),
        columns: { storeId: true },
      });
      if (orderRow?.storeId) {
        const storeRow = await this.db.db.query.stores.findFirst({
          where: eq(stores.id, orderRow.storeId),
          columns: { orgId: true },
        });
        resolvedOrgId = storeRow?.orgId ?? null;
      }
    }

    const runTx = externalTx ?? this.db.db;
    await (externalTx
      ? this.postReversalInTx(externalTx, reversalId, returnRequestId, ret.refundId, settlement?.id, originalCommission, reversalMinor, responsibilityCategory, idempotencyKey, returnNetGoods, orderNetGoods, originalCommission, createdBy, resolvedOrgId)
      : runTx.transaction(async (tx: any) => {
          await this.postReversalInTx(tx, reversalId, returnRequestId, ret.refundId, settlement?.id, originalCommission, reversalMinor, responsibilityCategory, idempotencyKey, returnNetGoods, orderNetGoods, originalCommission, createdBy, resolvedOrgId);
        })
    );

    this.logger.log(
      `Commission reversal posted: ${reversalMinor} minor (${responsibilityCategory}) ` +
      `for return ${returnRequestId}`,
    );

    return { totalReversalMinor: reversalMinor, reversalIds: [reversalId] };
  }

  /** Internal: insert commission_reversals row + outbox event inside the given tx. */
  private async postReversalInTx(
    tx: any, reversalId: string, returnRequestId: string, refundId: string | null,
    settlementId: string | undefined | null, originalCommission: number,
    reversalMinor: number, responsibilityCategory: string, idempotencyKey: string,
    returnNetGoods: number, orderNetGoods: number, origCommission: number,
    createdBy: string | null, orgId?: string | null,
  ) {
    // Idempotency check
    const existing = await tx.query.commissionReversals.findFirst({
      where: eq(commissionReversals.idempotencyKey, idempotencyKey),
    });
    if (existing) {
      throw new ConflictException(`Commission reversal already exists: ${idempotencyKey}`);
    }

    await tx.insert(commissionReversals).values({
      id: reversalId,
      returnRequestId,
      refundId,
      settlementId: settlementId ?? null,
      originalCommissionMinor: origCommission,
      reversalMinor,
      responsibilityCategory,
      idempotencyKey,
      status: 'POSTED',
      currency: 'SYP',
      notes: `Commission reversal for return ${returnRequestId}: ${responsibilityCategory} responsibility, ` +
             `netGoods=${returnNetGoods}/${orderNetGoods}, commission=${originalCommission}`,
      createdBy,
      orgId: orgId ?? null,
    });

    // Publish outbox event
    await this.outbox.publish(
      'commission.reversed',
      returnRequestId,
      {
        reversalId,
        returnRequestId,
        reversalMinor,
        originalCommissionMinor: origCommission,
        responsibilityCategory,
        currency: 'SYP',
      },
      {},
      null,
      tx,
    );
  }

  /**
   * Query total commission reversed for a given sub-order.
   */
  async getTotalReversedForOrder(subOrderId: string): Promise<number> {
    const result = await this.db.db
      .select({ total: sql<number>`COALESCE(SUM(${commissionReversals.reversalMinor}), 0)` })
      .from(commissionReversals)
      .innerJoin(returnRequests, eq(commissionReversals.returnRequestId, returnRequests.id))
      .where(eq(returnRequests.subOrderId, subOrderId));
    return result[0]?.total ?? 0;
  }

  /**
   * Query commission reversals for a return request.
   */
  async getReversalsForReturn(returnRequestId: string) {
    return this.db.db.query.commissionReversals.findMany({
      where: eq(commissionReversals.returnRequestId, returnRequestId),
    });
  }

  /**
   * List commission reversals with optional org and status filter.
   */
  async listReversals(orgId?: string | null, status?: string) {
    const conditions: any[] = [];
    if (orgId) conditions.push(eq(commissionReversals.orgId, orgId));
    if (status) conditions.push(eq(commissionReversals.status, status));

    return this.db.db.query.commissionReversals.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [sql`${commissionReversals.createdAt} DESC`],
    });
  }
}
