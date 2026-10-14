/**
 * P13 Returns Service — buyer-initiated return lifecycle.
 *
 * 12-state FSM:
 *   REQUESTED → MERCHANT_APPROVED → BUYER_SHIPPED → RECEIVED → INSPECTED → REFUND_PENDING → REFUNDED
 *   Plus: MERCHANT_REJECTED, CANCELLED, EXPIRED, REJECTED_AFTER_INSPECTION, REFUND_FAILED
 *
 * Key invariants:
 * - One active return per sub-order (partial unique index)
 * - Refund amount includes proportional VAT (prices are VAT-exclusive)
 * - Cumulative refund cap enforced by P12 FOR UPDATE locking
 * - Inventory restoration atomic with inspection transition
 * - Financial breakdown NEVER mutated (P12 immutability)
 * - All transitions logged to return_request_events (append-only)
 * - Outbox events emitted inside same transaction as state transition
 */
import { Injectable, NotFoundException, BadRequestException,
  ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import {
  returnRequests, returnRequestItems, returnRequestEvents,
} from './returns.schema';
import { commissionReversals } from './financial.schema';
import { orders, orderItems, orderFinancialBreakdown } from '../orders/orders.schema';
import { paymentRecords, refunds, settlementRecords } from '../payments/payments.schema';
import { shipments } from '../orders/shipment.schema';
import { inventoryItems, stockMovements } from '../inventory/inventory.schema';
import {
  CallerContext, assertOrderAccessible, assertStoreInOrg,
  assertStoreMember, isTenantPrivileged,
} from '../../common/tenant-scope';
import { PaymentsService } from '../payments/payments.service';
import { BusinessCalendarService } from './business-calendar.service';
import { CommissionReversalService } from './commission-reversal.service';
import { SettlementAdjustmentService } from './settlement-adjustment.service';
import { REFUND_REASONS, RefundReason } from '../payments/payments.types';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

/** Configurable return window (days from delivery). */
const RETURN_WINDOW_DAYS = Number(process.env['RETURN_WINDOW_DAYS'] ?? 14);

/** Merchant response SLA (hours). */
const MERCHANT_SLA_HOURS = 72;

/** Return conditions vocabulary (matches M7.3-C). */
const RETURN_CONDITIONS = new Set(['GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE']);
const WRITEOFF_CONDITIONS = new Set(['DAMAGED', 'DEFECTIVE', 'UNSALEABLE']);

/** Terminal states — no outgoing transitions. */
const TERMINAL_STATES = new Set([
  'REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED',
  'EXPIRED', 'REJECTED_AFTER_INSPECTION',
]);

/** Supported responsibility categories for return classification. */
export const RESPONSIBILITY_CATEGORIES = new Set([
  'MERCHANT', 'BUYER_REMORSE', 'PLATFORM', 'CARRIER_DAMAGE',
]);

/** Categories that trigger commission reversal (BD-P13-RESPONSIBILITY). */
const REVERSAL_CATEGORIES = new Set(['MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE']);

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  /** Locked FSM transition map. */
  private static readonly TRANSITIONS: Record<string, string[]> = {
    REQUESTED:                 ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'ESCALATED'],
    MERCHANT_APPROVED:         ['BUYER_SHIPPED', 'CANCELLED'],
    BUYER_SHIPPED:             ['RECEIVED'],
    RECEIVED:                  ['INSPECTED'],
    INSPECTED:                 ['REFUND_PENDING', 'REJECTED_AFTER_INSPECTION'],
    REFUND_PENDING:            ['REFUNDED', 'REFUND_FAILED'],
    REFUND_FAILED:             ['REFUND_PENDING'],
    REFUNDED:                  [],
    MERCHANT_REJECTED:         [],
    CANCELLED:                 [],
    EXPIRED:                   [],
    REJECTED_AFTER_INSPECTION: [],
    ESCALATED:                 ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED'],
  };

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
    private readonly payments: PaymentsService,
    private readonly calendar: BusinessCalendarService,
    private readonly commissionReversal: CommissionReversalService,
    private readonly settlementAdj: SettlementAdjustmentService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // CREATE RETURN REQUEST
  // ═══════════════════════════════════════════════════════════════

  async createReturnRequest(input: CreateReturnInput, caller: CallerContext) {
    // BD-P13-REASON-001: return reasons use the existing REFUND_REASONS vocabulary
    // from payments.types.ts — otherwise the later REFUND_PENDING hand-off to
    // P12 requestRefund would reject the reason and strand the return.
    if (!REFUND_REASONS.includes(input.reason as RefundReason)) {
      throw new BadRequestException(
        `Invalid return reason: ${input.reason}. Allowed: ${REFUND_REASONS.join(', ')}`,
      );
    }

    // 1. Authorization: buyer owns the order
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, input.subOrderId),
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== caller.sub) {
      throw new ForbiddenException('You can only create returns for your own orders');
    }

    // 2. Eligibility: order status must be DELIVERED or COMPLETED
    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
      throw new BadRequestException(
        `Returns require DELIVERED or COMPLETED status, order is ${order.status}`,
      );
    }

    // 3. Payment eligibility: CONFIRMED, CAPTURED, or PARTIALLY_REFUNDED
    const payment = await this.db.db.query.paymentRecords.findFirst({
      where: eq(paymentRecords.orderId, input.subOrderId),
    });
    if (!payment) throw new NotFoundException('No payment found for this order');
    if (!['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      throw new BadRequestException(
        `Payment status ${payment.status} is not eligible for returns`,
      );
    }

    // 4. Return window: check shipment deliveredAt
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.orderId, input.subOrderId),
    });
    const deliveredAt = shipment?.deliveredAt
      ? new Date(shipment.deliveredAt)
      : new Date(order.updatedAt);
    const windowEnd = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      throw new BadRequestException(`Return window (${RETURN_WINDOW_DAYS} days) has expired`);
    }

    // 5. Validate line items
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('At least one return line is required');
    }

    const orderItemList = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, input.subOrderId),
    });
    const orderItemById = new Map(orderItemList.map(i => [i.id, i]));

    // Calculate refund amount and validate quantities
    let totalRefundMinor = 0;
    const resolvedLines: Array<{
      orderItemId: string; quantity: number; unitPriceMinor: number;
    }> = [];

    // Get financial breakdown for discount ratio and VAT
    const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, input.subOrderId),
    });
    const productsMinor = breakdown?.productsMinor ?? order.subtotalMinor;
    const discountMinor = breakdown?.discountMinor ?? order.discountMinor;
    const discountRatio = productsMinor > 0 ? discountMinor / productsMinor : 0;
    const vatRate = productsMinor > 0
      ? (breakdown?.taxMinor ?? order.taxMinor) / (productsMinor - discountMinor)
      : 0;

    // Check cumulative returned quantities
    const priorReturns = await this.getCumulativeReturnedQuantities(input.subOrderId);

    for (const line of input.lines) {
      const orderItem = orderItemById.get(line.orderItemId);
      if (!orderItem) {
        throw new BadRequestException(`Order item ${line.orderItemId} not found in this order`);
      }
      if (line.quantity < 1 || line.quantity > orderItem.quantity) {
        throw new BadRequestException(
          `Return quantity must be between 1 and ${orderItem.quantity} for item ${line.orderItemId}`,
        );
      }

      // Cumulative cap: previously returned + this request <= ordered
      const priorReturned = priorReturns.get(line.orderItemId) ?? 0;
      if (priorReturned + line.quantity > orderItem.quantity) {
        throw new ConflictException(
          `Cumulative return quantity would exceed ordered quantity for item ${line.orderItemId}`,
        );
      }

      // Calculate line refund: unit_price × qty, then apply discount ratio, then add VAT
      const lineGrossMinor = orderItem.unitPriceMinor * line.quantity;
      const lineDiscountMinor = Math.round(lineGrossMinor * discountRatio);
      const lineNetMinor = lineGrossMinor - lineDiscountMinor;
      const lineTaxMinor = Math.round(lineNetMinor * vatRate);
      const lineRefundMinor = lineNetMinor + lineTaxMinor;

      totalRefundMinor += lineRefundMinor;
      resolvedLines.push({
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        unitPriceMinor: orderItem.unitPriceMinor,
      });
    }

    // Full-return delivery fee refund
    const isFullReturn = input.lines.length === orderItemList.length &&
      input.lines.every(l => {
        const oi = orderItemById.get(l.orderItemId)!;
        const prior = priorReturns.get(l.orderItemId) ?? 0;
        return prior + l.quantity === oi.quantity;
      });

    if (isFullReturn) {
      const deliveryFeeMinor = breakdown?.deliveryFeeMinor ?? order.deliveryFeeMinor ?? 0;
      // Delivery fee is pre-VAT; add VAT
      const deliveryRefundMinor = deliveryFeeMinor + Math.round(deliveryFeeMinor * vatRate);
      totalRefundMinor += deliveryRefundMinor;
    }

    // Phase 3 §3.4: Delivery-fee exception for partial returns
    // If the buyer requests a delivery-fee refund on a partial return
    // (e.g., carrier damage), the fee is NOT auto-included. Instead,
    // a settlement adjustment is created for dual-approval review.
    let deliveryFeeExceptionAdjustmentId: string | null = null;
    if (!isFullReturn && input.deliveryFeeException) {
      const deliveryFeeMinor = breakdown?.deliveryFeeMinor ?? order.deliveryFeeMinor ?? 0;
      if (deliveryFeeMinor > 0) {
        // The delivery-fee exception will be created as a settlement adjustment
        // after the return request is persisted (needs the return ID).
        // For now, record the intent.
        deliveryFeeExceptionAdjustmentId = 'PENDING';
      }
    }

    // Verify refund doesn't exceed confirmed payment
    const confirmedAmount = payment.confirmedAmountMinor ?? payment.amountMinor;
    const alreadyRefunded = await this.getCumulativeRefundedAmount(payment.id);
    if (totalRefundMinor > confirmedAmount - alreadyRefunded) {
      throw new BadRequestException(
        `Refund amount ${totalRefundMinor} exceeds remaining refundable amount ${confirmedAmount - alreadyRefunded}`,
      );
    }

    // 6. Check one active return per sub-order
    // ESCALATED is non-terminal and counts as active — preserves duplicate prevention.
    const activeReturn = await this.db.db.query.returnRequests.findFirst({
      where: and(
        eq(returnRequests.subOrderId, input.subOrderId),
        sql`${returnRequests.status} NOT IN ('REFUNDED','MERCHANT_REJECTED','CANCELLED','EXPIRED','REJECTED_AFTER_INSPECTION')`,
      ),
    });
    if (activeReturn) {
      throw new ConflictException('An active return request already exists for this order');
    }

    // 7. Create return request + items + event atomically
    const id = crypto.randomUUID();
    const idempotencyKey = input.idempotencyKey ||
      `return:${input.subOrderId}:${caller.sub}:${Date.now()}`;
    const expiresAt = new Date(Date.now() + MERCHANT_SLA_HOURS * 60 * 60 * 1000);

    await this.db.db.transaction(async (tx) => {
      await tx.insert(returnRequests).values({
        id,
        subOrderId: input.subOrderId,
        paymentRecordId: payment.id,
        buyerId: caller.sub,
        status: 'REQUESTED',
        reason: input.reason,
        description: input.description || null,
        evidenceUrls: input.evidenceUrls || [],
        requestedRefundMinor: totalRefundMinor,
        idempotencyKey,
        expiresAt,
      });

      for (const line of resolvedLines) {
        await tx.insert(returnRequestItems).values({
          id: crypto.randomUUID(),
          returnRequestId: id,
          orderItemId: line.orderItemId,
          quantity: line.quantity,
        });
      }

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(),
        returnRequestId: id,
        eventType: 'REQUESTED',
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorId: caller.sub,
        actorType: 'BUYER',
        notes: input.description || null,
      });

      await this.outbox.publish('return.requested', id, {
        returnRequestId: id,
        subOrderId: input.subOrderId,
        buyerId: caller.sub,
        reason: input.reason,
        requestedRefundMinor: totalRefundMinor,
      }, {}, null, tx);
    });

    this.logger.log(`Return request ${id} created for order ${input.subOrderId}`);

    // Phase 3 §3.4: Create delivery-fee settlement adjustment for partial-return exceptions.
    // This is done AFTER the return transaction so the return ID is available.
    if (deliveryFeeExceptionAdjustmentId === 'PENDING' && input.deliveryFeeException) {
      try {
        const deliveryFeeMinor = breakdown?.deliveryFeeMinor ?? order.deliveryFeeMinor ?? 0;
        const deliveryRefundMinor = deliveryFeeMinor + Math.round(deliveryFeeMinor * vatRate);
        const adj = await this.settlementAdj.createAdjustment({
          subOrderId: input.subOrderId,
          returnRequestId: id,
          adjustmentType: 'DELIVERY_FEE_EXCEPTION',
          amountMinor: deliveryRefundMinor,
          currency: 'SYP',
          reason: `Delivery-fee exception for partial return: ${input.deliveryFeeException.reason}`,
          notes: input.deliveryFeeException.reason,
        }, caller.sub);
        deliveryFeeExceptionAdjustmentId = adj.id;
        this.logger.log(
          `Delivery-fee exception adjustment ${adj.id} created for return ${id}: ` +
          `${deliveryRefundMinor} SYP (requires dual approval)`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to create delivery-fee exception adjustment for return ${id}: ${err?.message}`,
        );
        deliveryFeeExceptionAdjustmentId = null;
      }
    }

    return this.getReturnRequest(id);
  }

  // ═══════════════════════════════════════════════════════════════
  // FSM TRANSITIONS
  // ═══════════════════════════════════════════════════════════════

  async transitionReturn(
    returnId: string,
    newStatus: string,
    caller: CallerContext,
    input?: TransitionInput,
  ) {
    const ret = await this.getReturnRequest(returnId);
    const currentStatus = ret.status;

    // Validate transition
    const allowed = ReturnsService.TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new ConflictException(
        `Cannot transition from ${currentStatus} to ${newStatus}`,
      );
    }

    // Authorization per transition
    await this.assertTransitionAuthorized(ret, newStatus, caller);

    // Execute transition
    switch (newStatus) {
      case 'MERCHANT_APPROVED':
        return this.merchantApprove(ret, caller, input);
      case 'MERCHANT_REJECTED':
        return this.merchantReject(ret, caller, input);
      case 'CANCELLED':
        return this.cancelReturn(ret, caller);
      case 'BUYER_SHIPPED':
        return this.buyerShipped(ret, caller, input);
      case 'RECEIVED':
        return this.merchantReceived(ret, caller);
      case 'INSPECTED':
        return this.inspectReturn(ret, caller, input);
      case 'REJECTED_AFTER_INSPECTION':
        return this.rejectAfterInspection(ret, caller, input);
      case 'REFUND_PENDING':
        return this.createRefundRequest(ret, caller);
      case 'REFUNDED':
        return this.markRefunded(ret);
      case 'REFUND_FAILED':
        return this.markRefundFailed(ret, input);
      case 'EXPIRED':
        return this.expireReturn(ret, caller);
      case 'ESCALATED':
        return this.escalateReturn(ret.id);
      default:
        throw new BadRequestException(`Unknown status: ${newStatus}`);
    }
  }

  // ── Merchant Approve ──────────────────────────────────────────

  private async merchantApprove(ret: any, caller: CallerContext, input?: TransitionInput) {
    await this.flipReturnStatus(ret.id, ret.status, 'MERCHANT_APPROVED', caller, 'MERCHANT', input?.notes);
    this.logger.log(`Return ${ret.id} approved by merchant`);
    return this.getReturnRequest(ret.id);
  }

  // ── Merchant Reject ───────────────────────────────────────────

  private async merchantReject(ret: any, caller: CallerContext, input?: TransitionInput) {
    if (!input?.notes) {
      throw new BadRequestException('Rejection reason is required');
    }
    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({ status: 'MERCHANT_REJECTED', merchantNotes: input.notes, updatedAt: new Date() })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'MERCHANT_REJECTED', fromStatus: ret.status, toStatus: 'MERCHANT_REJECTED',
        actorId: caller.sub, actorType: 'MERCHANT', notes: input.notes,
      });
      await this.outbox.publish('return.rejected', ret.id, {
        returnRequestId: ret.id, reason: input.notes,
      }, {}, null, tx);
    });
    return this.getReturnRequest(ret.id);
  }

  // ── Buyer Cancel ──────────────────────────────────────────────

  private async cancelReturn(ret: any, caller: CallerContext) {
    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'CANCELLED', fromStatus: ret.status, toStatus: 'CANCELLED',
        actorId: caller.sub, actorType: 'BUYER',
      });
      await this.outbox.publish('return.cancelled', ret.id, {
        returnRequestId: ret.id,
      }, {}, null, tx);
    });
    return this.getReturnRequest(ret.id);
  }

  // ── Buyer Shipped ─────────────────────────────────────────────

  private async buyerShipped(ret: any, caller: CallerContext, input?: TransitionInput) {
    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({
          status: 'BUYER_SHIPPED',
          shippingTrackingNumber: input?.trackingNumber || null,
          shippingNotes: input?.notes || null,
          updatedAt: new Date(),
        })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'BUYER_SHIPPED', fromStatus: ret.status, toStatus: 'BUYER_SHIPPED',
        actorId: caller.sub, actorType: 'BUYER',
        notes: input?.trackingNumber ? `Tracking: ${input.trackingNumber}` : null,
      });
      await this.outbox.publish('return.shipped', ret.id, {
        returnRequestId: ret.id, trackingNumber: input?.trackingNumber,
      }, {}, null, tx);
    });
    return this.getReturnRequest(ret.id);
  }

  // ── Merchant Received ─────────────────────────────────────────

  private async merchantReceived(ret: any, caller: CallerContext) {
    await this.flipReturnStatus(ret.id, ret.status, 'RECEIVED', caller, 'MERCHANT');
    return this.getReturnRequest(ret.id);
  }

  // ── Inspect (with inventory restoration) ──────────────────────

  private async inspectReturn(ret: any, caller: CallerContext, input?: TransitionInput) {
    if (!input?.condition || !RETURN_CONDITIONS.has(input.condition)) {
      throw new BadRequestException(`Invalid inspection condition: ${input?.condition}`);
    }

    const lines = await this.db.db.query.returnRequestItems.findMany({
      where: eq(returnRequestItems.returnRequestId, ret.id),
    });

    // Resolve inventory items for each line
    const orderItemsList = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, ret.subOrderId),
    });
    const orderItemById = new Map(orderItemsList.map(i => [i.id, i]));

    // Find the inventory items (by variant → warehouse)
    const invItems = await this.db.db.query.inventoryItems.findMany({
      where: sql`1=1`,  // load all; filter below
    });

    await this.db.db.transaction(async (tx) => {
      // Flip status
      const flip = await tx
        .update(returnRequests)
        .set({
          status: 'INSPECTED',
          inspectionCondition: input.condition,
          inspectionNotes: input.notes || null,
          inspectedBy: caller.sub,
          inspectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      // Update line conditions
      for (const line of lines) {
        const oi = orderItemById.get(line.orderItemId);
        if (!oi) continue;

        // Find matching inventory item (variant + any warehouse for this store)
        const invItem = invItems.find(inv => inv.variantId === oi.variantId);

        await tx.update(returnRequestItems)
          .set({ condition: input.condition, inventoryItemId: invItem?.id || null, updatedAt: new Date() })
          .where(eq(returnRequestItems.id, line.id));

        // Inventory restoration
        if (invItem) {
          await this.restoreInventory(tx, invItem.id, line.quantity, input.condition!, caller.sub, ret.id);
        }
      }

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'INSPECTED', fromStatus: ret.status, toStatus: 'INSPECTED',
        actorId: caller.sub, actorType: 'MERCHANT',
        notes: `Condition: ${input.condition}${input.notes ? `. ${input.notes}` : ''}`,
        metadata: { condition: input.condition },
      });

      await this.outbox.publish('return.inspected', ret.id, {
        returnRequestId: ret.id, condition: input.condition,
      }, {}, null, tx);

      // Emit inventory_restored event if condition is GOOD
      if (input.condition === 'GOOD') {
        await this.outbox.publish('return.inventory_restored', ret.id, {
          returnRequestId: ret.id, condition: input.condition,
        }, {}, null, tx);
      }
    });

    this.logger.log(`Return ${ret.id} inspected: ${input.condition}`);
    return this.getReturnRequest(ret.id);
  }

  // ── Reject After Inspection ───────────────────────────────────

  private async rejectAfterInspection(ret: any, caller: CallerContext, input?: TransitionInput) {
    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({
          status: 'REJECTED_AFTER_INSPECTION',
          inspectionNotes: input?.notes || null,
          updatedAt: new Date(),
        })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'REJECTED_AFTER_INSPECTION', fromStatus: ret.status,
        toStatus: 'REJECTED_AFTER_INSPECTION',
        actorId: caller.sub, actorType: 'MERCHANT', notes: input?.notes,
      });
      await this.outbox.publish('return.rejected_after_inspection', ret.id, {
        returnRequestId: ret.id,
      }, {}, null, tx);
    });
    return this.getReturnRequest(ret.id);
  }

  // ── Create Refund Request (REFUND_PENDING) ────────────────────

  private async createRefundRequest(ret: any, _caller: CallerContext) {
    const idempotencyKey = `return-refund:${ret.id}`;

    // Recovery path: if a prior attempt committed the refund but failed before
    // flipping the return to REFUND_PENDING, reuse it instead of hitting the
    // unique idempotency-key constraint (which would strand the return).
    const existingRefund = await this.db.db.query.refunds.findFirst({
      where: eq(refunds.idempotencyKey, idempotencyKey),
    });

    const refund = existingRefund
      ? {
          refundId: existingRefund.id,
          amountMinor: Number(existingRefund.amountMinor),
          status: existingRefund.status,
        }
      : await this.payments.requestRefund(
          // P12 requestRefund creates the refund with FOR UPDATE cumulative locking
          ret.paymentRecordId,
          Number(ret.requestedRefundMinor),
          ret.reason,
          ret.buyerId,
          { sub: ret.buyerId, role: 'SYSTEM' },  // system-initiated
          { idempotencyKey, notes: `Return ${ret.id}` },
        );

    await this.db.db.transaction(async (tx) => {
      // Link refund to return request
      await tx.update(refunds)
        .set({ returnRequestId: ret.id })
        .where(eq(refunds.id, refund.refundId));

      const flip = await tx
        .update(returnRequests)
        .set({ status: 'REFUND_PENDING', refundId: refund.refundId, updatedAt: new Date() })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'REFUND_PENDING', fromStatus: ret.status, toStatus: 'REFUND_PENDING',
        actorId: null, actorType: 'SYSTEM',
        notes: `Refund ${refund.refundId} created for ${ret.requestedRefundMinor}`,
      });
      await this.outbox.publish('return.refund_pending', ret.id, {
        returnRequestId: ret.id, refundId: refund.refundId,
        amountMinor: ret.requestedRefundMinor,
      }, {}, null, tx);
    });

    return this.getReturnRequest(ret.id);
  }

  // ── Mark Refunded ─────────────────────────────────────────────

  private async markRefunded(ret: any) {
    // Called after P12 approveRefund succeeds
    const refundRow = ret.refundId
      ? await this.db.db.query.refunds.findFirst({ where: eq(refunds.id, ret.refundId) })
      : null;

    if (!refundRow || refundRow.status !== 'SUCCEEDED') {
      throw new ConflictException('Refund has not been approved/succeeded yet');
    }

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({
          status: 'REFUNDED',
          actualRefundMinor: refundRow.amountMinor,
          updatedAt: new Date(),
        })
        .where(and(eq(returnRequests.id, ret.id), eq(returnRequests.status, ret.status)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: ret.id,
        eventType: 'REFUNDED', fromStatus: ret.status, toStatus: 'REFUNDED',
        actorId: null, actorType: 'SYSTEM',
        notes: `Refund ${refundRow.id} succeeded for ${refundRow.amountMinor}`,
      });

      // Settlement adjustment (Phase 3: includes commission reversal calculation)
      await this.adjustSettlement(tx, ret, refundRow.amountMinor);

      // Phase 3: Post commission reversal to the dedicated ledger (same tx)
      const respCat = ret.responsibilityCategory;
      if (respCat && REVERSAL_CATEGORIES.has(respCat)) {
        await this.commissionReversal.processCommissionReversal(
          ret.id, respCat, null, tx,
        );
      } else if (!respCat) {
        this.logger.warn(
          `Return ${ret.id} refunded without responsibility category — ` +
          'commission reversal skipped. Ensure inspection or escalation sets the category.',
        );
      }

      await this.outbox.publish('return.refunded', ret.id, {
        returnRequestId: ret.id, refundId: refundRow.id,
        amountMinor: refundRow.amountMinor,
      }, {}, null, tx);
    });

    return this.getReturnRequest(ret.id);
  }

  // ── Mark Refund Failed ────────────────────────────────────────

  private async markRefundFailed(ret: any, input?: TransitionInput) {
    await this.flipReturnStatus(ret.id, ret.status, 'REFUND_FAILED', 
      { sub: ret.buyerId, role: 'SYSTEM' } as CallerContext, 'SYSTEM', input?.notes);
    return this.getReturnRequest(ret.id);
  }

  // ── Expire Return ─────────────────────────────────────────────

  private async expireReturn(ret: any, caller: CallerContext) {
    await this.flipReturnStatus(ret.id, ret.status, 'EXPIRED', caller, 'SYSTEM',
      'Merchant SLA exceeded');
    return this.getReturnRequest(ret.id);
  }

  // ═══════════════════════════════════════════════════════════════
  // ESCALATION (P13 Phase 2)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Escalate a REQUESTED return whose merchant SLA has expired.
   * Called by the ReturnExpirationWorker. Transitions to ESCALATED
   * instead of EXPIRED. Computes and persists the admin review deadline.
   */
  async escalateReturn(returnId: string) {
    const ret = await this.db.db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });
    if (!ret) throw new NotFoundException('Return request not found');
    if (ret.status !== 'REQUESTED') return; // already processed — idempotent

    // Calculate admin review deadline using business calendar
    const escalatedAt = new Date();
    let escalationDeadline: Date;
    try {
      escalationDeadline = await this.calendar.addBusinessDays(escalatedAt, 3);
    } catch (err: any) {
      // Calendar misconfiguration — log but do not silently expire
      this.logger.error(
        `Cannot calculate escalation deadline for ${returnId}: ${err?.message}. ` +
        'Business calendar may be missing or misconfigured.',
      );
      throw err; // Let the worker retry; do not leave request in false-completed state
    }

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({
          status: 'ESCALATED',
          escalatedAt,
          escalationDeadline,
          updatedAt: new Date(),
        })
        .where(and(
          eq(returnRequests.id, returnId),
          eq(returnRequests.status, 'REQUESTED'),
        ))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) return; // concurrent transition — idempotent

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(),
        returnRequestId: returnId,
        eventType: 'ESCALATED',
        fromStatus: 'REQUESTED',
        toStatus: 'ESCALATED',
        actorId: null,
        actorType: 'SYSTEM',
        notes: `Merchant SLA exceeded. Admin review deadline: ${escalationDeadline.toISOString()}`,
        metadata: { escalatedAt: escalatedAt.toISOString(), escalationDeadline: escalationDeadline.toISOString() },
      });

      await this.outbox.publish('return.escalated', returnId, {
        returnRequestId: returnId,
        escalatedAt: escalatedAt.toISOString(),
        escalationDeadline: escalationDeadline.toISOString(),
      }, {}, null, tx);
    });

    this.logger.log(`Return ${returnId} escalated to admin review`);
    return this.getReturnRequest(returnId);
  }

  /**
   * Resolve an ESCALATED return request via admin action.
   * Maps APPROVE → MERCHANT_APPROVED, REJECT → MERCHANT_REJECTED, CANCEL → CANCELLED.
   */
  async resolveEscalation(
    returnId: string,
    action: 'APPROVE' | 'REJECT' | 'CANCEL',
    responsibilityCategory: string | null,
    caller: CallerContext,
    notes?: string,
  ) {
    const ret = await this.db.db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });
    if (!ret) throw new NotFoundException('Return request not found');
    if (ret.status !== 'ESCALATED') {
      throw new ConflictException(
        `Cannot resolve return in status ${ret.status}; only ESCALATED returns can be resolved`,
      );
    }

    // Validate responsibility category
    if (responsibilityCategory && !RESPONSIBILITY_CATEGORIES.has(responsibilityCategory)) {
      throw new BadRequestException(
        `Invalid responsibility category: ${responsibilityCategory}. ` +
        `Allowed: ${[...RESPONSIBILITY_CATEGORIES].join(', ')}`,
      );
    }

    const targetStatus = {
      APPROVE: 'MERCHANT_APPROVED',
      REJECT: 'MERCHANT_REJECTED',
      CANCEL: 'CANCELLED',
    }[action];

    const resolvedAt = new Date();

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({
          status: targetStatus,
          responsibilityCategory: responsibilityCategory || null,
          resolvedBy: caller.sub,
          resolvedAt,
          updatedAt: new Date(),
        })
        .where(and(
          eq(returnRequests.id, returnId),
          eq(returnRequests.status, 'ESCALATED'),
        ))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(),
        returnRequestId: returnId,
        eventType: `ADMIN_${action}`,
        fromStatus: 'ESCALATED',
        toStatus: targetStatus,
        actorId: caller.sub,
        actorType: 'ADMIN',
        notes: notes || `Admin resolved escalated return: ${action}`,
        metadata: {
          action,
          responsibilityCategory: responsibilityCategory || null,
          resolvedAt: resolvedAt.toISOString(),
        },
      });

      await this.outbox.publish(
        `return.admin_${action.toLowerCase()}`,
        returnId,
        {
          returnRequestId: returnId,
          action,
          responsibilityCategory: responsibilityCategory || null,
          resolvedBy: caller.sub,
        },
        {}, null, tx,
      );
    });

    this.logger.log(`Escalated return ${returnId} resolved: ${action} by ${caller.sub}`);
    return this.getReturnRequest(returnId);
  }

  // ═══════════════════════════════════════════════════════════════
  // INVENTORY RESTORATION
  // ═══════════════════════════════════════════════════════════════

  private async restoreInventory(
    tx: any, invItemId: string, quantity: number,
    condition: string, performedBy: string | null, returnRequestId: string,
  ) {
    // FOR UPDATE lock on inventory row
    const [locked] = await tx
      .select({ qtyOnHand: inventoryItems.qtyOnHand, qtyReserved: inventoryItems.qtyReserved })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, invItemId))
      .for('update');

    if (!locked) return;  // no inventory item found; skip

    const isWriteoff = WRITEOFF_CONDITIONS.has(condition);

    // Step 1: RELEASE reservation (qty_reserved ↓)
    const newReserved = Math.max(0, locked.qtyReserved - quantity);
    await tx.update(inventoryItems)
      .set({ qtyReserved: newReserved, updatedAt: new Date() })
      .where(eq(inventoryItems.id, invItemId));

    await tx.insert(stockMovements).values({
      id: crypto.randomUUID(),
      inventoryItemId: invItemId,
      movementType: 'RELEASE',
      quantity,
      referenceType: 'RETURN_REQUEST',
      referenceId: returnRequestId,
      performedBy,
      reason: `Return request reservation released (${condition})`,
    });

    // Step 2: For GOOD condition, increment qty_on_hand (RETURN movement)
    if (!isWriteoff) {
      await tx.update(inventoryItems)
        .set({ qtyOnHand: sql`${inventoryItems.qtyOnHand} + ${quantity}`, updatedAt: new Date() })
        .where(eq(inventoryItems.id, invItemId));

      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        inventoryItemId: invItemId,
        movementType: 'RETURN',
        quantity,
        referenceType: 'RETURN_REQUEST',
        referenceId: returnRequestId,
        performedBy,
        reason: `Return item restored as sellable (${condition})`,
      });
    } else {
      // Write-off: ADJUST-out (qty_on_hand ↓)
      await tx.update(inventoryItems)
        .set({ qtyOnHand: sql`GREATEST(${inventoryItems.qtyOnHand} - ${quantity}, 0)`, updatedAt: new Date() })
        .where(eq(inventoryItems.id, invItemId));

      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        inventoryItemId: invItemId,
        movementType: 'ADJUST',
        quantity: -quantity,
        referenceType: 'RETURN_REQUEST',
        referenceId: returnRequestId,
        performedBy,
        reason: `Write-off of ${condition} returned item`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SETTLEMENT ADJUSTMENT
  // ═══════════════════════════════════════════════════════════════

  private async adjustSettlement(tx: any, ret: any, refundAmountMinor: number) {
    // Find existing settlement for this sub-order
    const settlement = await tx.query.settlementRecords.findFirst({
      where: eq(settlementRecords.subOrderId, ret.subOrderId),
    });

    if (!settlement) return;  // no settlement yet; next calculateSettlement picks up refund

    // ── Phase 3: Calculate proportional commission reversal ──────────
    // The ADJUSTMENT settlement must reflect the commission credit so that
    // net = gross - refund - commission - fee + reversal is correct.
    let commissionReversalMinor = 0;
    const category = ret.responsibilityCategory;

    if (category && REVERSAL_CATEGORIES.has(category)) {
      const breakdown = await tx.query.orderFinancialBreakdown.findFirst({
        where: eq(orderFinancialBreakdown.orderId, ret.subOrderId),
      });
      if (breakdown && breakdown.commissionMinor > 0) {
        const originalCommission = breakdown.commissionMinor;
        const orderNetGoods = breakdown.productsMinor - breakdown.discountMinor;

        if (orderNetGoods > 0) {
          // Load return items to compute the net-goods basis for this return
          const items = await tx.query.returnRequestItems.findMany({
            where: eq(returnRequestItems.returnRequestId, ret.id),
          });
          if (items.length > 0) {
            const orderItemIds = items.map((i: any) => i.orderItemId);
            const orderItemRows = await tx.query.orderItems.findMany({
              where: sql`${orderItems.id} IN (${sql.join(orderItemIds.map((id: string) => sql`${id}`), sql`, `)})`,
            });
            const orderItemMap: Map<string, any> = new Map(orderItemRows.map((oi: any) => [oi.id, oi]));

            const returnNetGoods = items.reduce((sum: number, item: any) => {
              const oi = orderItemMap.get(item.orderItemId);
              if (!oi) return sum;
              return sum + (Number(oi.unitPriceMinor) * item.quantity);
            }, 0);

            if (returnNetGoods > 0) {
              // Cumulative-target proportional reversal, capped at remaining
              const existingReversals = await tx
                .select({ total: sql<number>`COALESCE(SUM(reversal_minor), 0)` })
                .from(commissionReversals)
                .innerJoin(returnRequests, eq(commissionReversals.returnRequestId, returnRequests.id))
                .where(eq(returnRequests.subOrderId, ret.subOrderId));
              const alreadyReversed = existingReversals[0]?.total ?? 0;
              const remaining = originalCommission - alreadyReversed;

              let raw = Math.floor((originalCommission * returnNetGoods) / orderNetGoods);
              raw = Math.min(raw, remaining);
              commissionReversalMinor = Math.max(0, raw);
            }
          }
        }
      }
    }

    if (['PENDING', 'CALCULATED'].includes(settlement.status)) {
      // Update in place — reduce commission by the reversal amount
      const newRefundMinor = (settlement.refundMinor ?? 0) + refundAmountMinor;
      const newCommissionMinor = settlement.commissionMinor - commissionReversalMinor;
      const newNetMinor = settlement.grossMinor - newRefundMinor - newCommissionMinor - settlement.feeMinor;
      await tx.update(settlementRecords)
        .set({
          refundMinor: newRefundMinor,
          commissionMinor: newCommissionMinor,
          netMinor: newNetMinor,
          updatedAt: new Date(),
        })
        .where(eq(settlementRecords.id, settlement.id));
    } else if (['PAID', 'DUE'].includes(settlement.status)) {
      // Look up store ID from the order (use tx for consistency)
      const orderRow = await tx.query.orders.findFirst({
        where: eq(orders.id, ret.subOrderId), columns: { storeId: true },
      });
      // Create ADJUSTMENT settlement with commission reversal
      // net = commissionReversal - refund (the merchant gets commission credit minus the refund debit)
      await tx.insert(settlementRecords).values({
        id: crypto.randomUUID(),
        subOrderId: ret.subOrderId,
        paymentRecordId: ret.paymentRecordId,
        merchantStoreId: orderRow?.storeId ?? ret.storeId ?? '',
        grossMinor: 0,
        refundMinor: refundAmountMinor,
        commissionMinor: commissionReversalMinor,
        feeMinor: 0,
        netMinor: commissionReversalMinor - refundAmountMinor,
        currency: 'SYP',
        status: 'ADJUSTMENT',
        calculatedAt: new Date(),
        notes: `Post-refund adjustment for return ${ret.id}` +
          (commissionReversalMinor > 0
            ? ` (commission reversed: ${commissionReversalMinor}, category: ${category})`
            : ''),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTHORIZATION
  // ═══════════════════════════════════════════════════════════════

  private async assertTransitionAuthorized(ret: any, newStatus: string, caller: CallerContext) {
    switch (newStatus) {
      case 'CANCELLED':
      case 'BUYER_SHIPPED':
        if (ret.buyerId !== caller.sub && !isTenantPrivileged(caller)) {
          throw new ForbiddenException('Only the buyer can perform this action');
        }
        break;
      case 'MERCHANT_APPROVED':
      case 'MERCHANT_REJECTED':
      case 'RECEIVED':
      case 'INSPECTED':
      case 'REJECTED_AFTER_INSPECTION':
        if (!isTenantPrivileged(caller)) {
          const order = await this.db.db.query.orders.findFirst({
            where: eq(orders.id, ret.subOrderId), columns: { storeId: true },
          });
          if (!order) {
            throw new ForbiddenException('Cannot verify store ownership for this return');
          }
          await assertStoreInOrg(this.db, caller, order.storeId);
          await assertStoreMember(this.db, caller, order.storeId);
        }
        break;
      case 'EXPIRED':
        if (!isTenantPrivileged(caller)) {
          throw new ForbiddenException('Only admins can expire returns');
        }
        break;
      case 'ESCALATED':
        // System transition — triggered by worker, no caller authorization needed
        break;
      case 'REFUND_PENDING':
      case 'REFUNDED':
      case 'REFUND_FAILED':
        // System transitions — no caller authorization needed
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private async flipReturnStatus(
    id: string, currentStatus: string, newStatus: string,
    caller: CallerContext, actorType: string, notes?: string,
  ) {
    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(returnRequests)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(eq(returnRequests.id, id), eq(returnRequests.status, currentStatus)))
        .returning({ id: returnRequests.id });
      if (flip.length === 0) throw new ConflictException('Return status already changed');

      await tx.insert(returnRequestEvents).values({
        id: crypto.randomUUID(), returnRequestId: id,
        eventType: newStatus, fromStatus: currentStatus, toStatus: newStatus,
        actorId: caller.sub, actorType, notes: notes || null,
      });

      await this.outbox.publish(`return.${newStatus.toLowerCase()}`, id, {
        returnRequestId: id,
      }, {}, null, tx);
    });
  }

  private async getCumulativeReturnedQuantities(subOrderId: string): Promise<Map<string, number>> {
    const result = await this.db.db
      .select({
        orderItemId: returnRequestItems.orderItemId,
        totalQty: sql<string>`COALESCE(SUM(${returnRequestItems.quantity}), 0)::int`,
      })
      .from(returnRequestItems)
      .innerJoin(returnRequests, eq(returnRequestItems.returnRequestId, returnRequests.id))
      .where(and(
        eq(returnRequests.subOrderId, subOrderId),
        // BD-P13-QTY-003: only effective returns consume quantity — cancelled,
        // rejected, expired and inspection-rejected requests release it again.
        inArray(returnRequests.status, [
          'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
          'INSPECTED', 'REFUND_PENDING', 'REFUNDED', 'ESCALATED',
        ]),
      ))
      .groupBy(returnRequestItems.orderItemId);

    return new Map(result.map(r => [r.orderItemId, Number(r.totalQty)]));
  }

  private async getCumulativeRefundedAmount(paymentRecordId: string): Promise<number> {
    const result = await this.db.db
      .select({ total: sql<string>`COALESCE(SUM(${refunds.amountMinor}), 0)::int` })
      .from(refunds)
      .where(and(
        eq(refunds.paymentRecordId, paymentRecordId),
        inArray(refunds.status, ['SUCCEEDED', 'PROCESSING', 'REQUESTED']),
      ));
    return Number(result[0]?.total ?? 0);
  }

  async getReturnRequest(id: string, caller?: CallerContext) {
    const ret = await this.db.db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, id),
    });
    if (!ret) throw new NotFoundException('Return request not found');

    // Authorization: buyer owns it, merchant is store member, or privileged role
    if (caller && !isTenantPrivileged(caller)) {
      if (ret.buyerId !== caller.sub) {
        // Not the buyer — check if merchant is member of the return's store
        const order = await this.db.db.query.orders.findFirst({
          where: eq(orders.id, ret.subOrderId), columns: { storeId: true },
        });
        if (!order) throw new ForbiddenException('You do not have access to this return');
        await assertStoreInOrg(this.db, caller, order.storeId);
        await assertStoreMember(this.db, caller, order.storeId);
      }
    }

    const items = await this.db.db.query.returnRequestItems.findMany({
      where: eq(returnRequestItems.returnRequestId, id),
    });
    const events = await this.db.db.query.returnRequestEvents.findMany({
      where: eq(returnRequestEvents.returnRequestId, id),
      orderBy: [returnRequestEvents.createdAt],
    });
    return { ...ret, items, events };
  }

  async listReturnsForBuyer(buyerId: string, status?: string) {
    const conditions = [eq(returnRequests.buyerId, buyerId)];
    if (status) conditions.push(eq(returnRequests.status, status));
    return this.db.db.query.returnRequests.findMany({
      where: and(...conditions),
      orderBy: [desc(returnRequests.createdAt)],
    });
  }

  async listReturnsForStore(storeId: string, caller: CallerContext, status?: string) {
    // Verify caller is authorized for this specific store
    if (!isTenantPrivileged(caller)) {
      await assertStoreInOrg(this.db, caller, storeId);
      await assertStoreMember(this.db, caller, storeId);
    }

    const subOrders = await this.db.db.query.orders.findMany({
      where: eq(orders.storeId, storeId),
      columns: { id: true },
    });
    const subOrderIds = subOrders.map(o => o.id);
    if (subOrderIds.length === 0) return [];

    const conditions = [inArray(returnRequests.subOrderId, subOrderIds)];
    if (status) conditions.push(eq(returnRequests.status, status));
    return this.db.db.query.returnRequests.findMany({
      where: and(...conditions),
      orderBy: [desc(returnRequests.createdAt)],
    });
  }

  async listAllReturns(status?: string) {
    if (!status) return this.db.db.query.returnRequests.findMany({
      orderBy: [desc(returnRequests.createdAt)],
    });
    return this.db.db.query.returnRequests.findMany({
      where: eq(returnRequests.status, status),
      orderBy: [desc(returnRequests.createdAt)],
    });
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreateReturnInput {
  subOrderId: string;
  reason: string;
  description?: string;
  evidenceUrls?: string[];
  idempotencyKey?: string;
  lines: Array<{ orderItemId: string; quantity: number }>;
  /** Phase 3 §3.4: request delivery-fee refund on partial return (requires dual approval). */
  deliveryFeeException?: { reason: string; isCarrierDamage?: boolean };
}

export interface TransitionInput {
  notes?: string;
  condition?: string;
  trackingNumber?: string;
}
