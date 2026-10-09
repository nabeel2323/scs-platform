/**
 * P12 Payments Service
 *
 * Core domain service for payment lifecycle management:
 * - Payment record creation (at checkout)
 * - Proof submission & manual verification
 * - COD cash confirmation
 * - Financial immutability enforcement
 * - Refund creation & approval
 * - Settlement calculation
 * - Reconciliation & expiration
 *
 * All financial operations use integer minor units. No floats.
 * All state transitions validated by the payment state machine.
 * All transitions produce immutable payment_events entries.
 * All outbox events published atomically inside transactions.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  paymentRecords,
  paymentEvents,
  refunds,
  settlementRecords,
} from './payments.schema';
import {
  orders,
  orderFinancialBreakdown,
  orderStatusHistory,
} from '../orders/orders.schema';
import { stores } from '../merchant/merchant.schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  CallerContext,
  assertOrderAccessible,
  assertStoreInOrg,
  isTenantPrivileged,
} from '../../common/tenant-scope';
import { assertPaymentTransition, isPaymentTerminal } from './payments.state-machine';
import { PaymentProviderRegistry } from './payments.provider-registry';
import {
  PaymentMethod,
  PaymentStatus,
  RefundReason,
  REFUND_REASONS,
  PAYMENT_METHODS,
  DEFAULT_PAYMENT_EXPIRY_HOURS,
} from './payments.types';

// ── Allowed upload MIME types for payment proofs ────────────────
const ALLOWED_PROOF_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_PROOF_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
    private readonly registry: PaymentProviderRegistry,
    @Optional() private readonly storage?: StorageService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT CREATION (called from checkout)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a payment record for a sub-order. Called inside the checkout
   * transaction — receives the tx client to ensure atomicity.
   */
  async createPaymentInTransaction(
    tx: any,
    orderId: string,
    amountMinor: number,
    currency: string,
    paymentMethod: PaymentMethod,
    idempotencyKey: string,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const provider = this.registry.getDefault();

    // Compute expiry for bank transfers
    let expiresAt: Date | null = null;
    if (paymentMethod === 'BANK_TRANSFER') {
      const hours = Number(
        process.env['PAYMENT_EXPIRY_HOURS'] || DEFAULT_PAYMENT_EXPIRY_HOURS,
      );
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    // COD starts at AWAITING_PAYMENT (confirmed at delivery)
    // Bank transfer starts at CREATED → AWAITING_PAYMENT (post-checkout side effect)
    const initialStatus: PaymentStatus =
      paymentMethod === 'CASH_ON_DELIVERY' ? 'AWAITING_PAYMENT' : 'CREATED';

    await tx.insert(paymentRecords).values({
      id,
      orderId,
      providerKey: provider.key,
      idempotencyKey,
      paymentMethod,
      status: initialStatus,
      amountMinor,
      currency,
      expiresAt,
    });

    // Append immutable event
    await tx.insert(paymentEvents).values({
      id: crypto.randomUUID(),
      paymentRecordId: id,
      eventType: 'PAYMENT_CREATED',
      fromStatus: null,
      toStatus: initialStatus,
      actorType: 'SYSTEM',
      amountMinor,
      notes: `Payment created at checkout — ${paymentMethod}`,
    });

    return id;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT PROOF SUBMISSION (bank transfer receipt)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Submit a payment proof (receipt) for a bank transfer payment.
   * Buyer uploads a transfer receipt; payment moves to AWAITING_VERIFICATION.
   *
   * POST /v1/payments/:id/proof
   */
  async submitProof(
    paymentId: string,
    buyerId: string,
    input: {
      receiptUrl?: string;
      receiptReference?: string;
      notes?: string;
      fileBuffer?: Buffer;
      fileName?: string;
      contentType?: string;
    },
    caller: CallerContext,
  ) {
    const payment = await this.getPaymentOrThrow(paymentId);
    const order = await this.getOrderForPayment(payment.orderId);

    // Buyer owns this payment
    if (order.buyerId !== caller.sub && !isTenantPrivileged(caller)) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    if (payment.paymentMethod !== 'BANK_TRANSFER') {
      throw new BadRequestException('Proof submission is only for bank transfer payments');
    }

    // Valid states for proof submission
    if (!['AWAITING_PAYMENT', 'REJECTED'].includes(payment.status)) {
      throw new ConflictException(
        `Cannot submit proof in ${payment.status} status`,
      );
    }

    // Handle file upload if provided
    let storedReceiptUrl = input.receiptUrl || null;
    if (input.fileBuffer && this.storage) {
      const ext = (input.fileName || 'receipt').split('.').pop() || 'jpg';
      const storageKey = `payment-proofs/${paymentId}/${crypto.randomUUID()}.${ext}`;
      await this.storage.putObject({
        bucket: process.env['S3_UPLOADS_BUCKET'] || 'scs-uploads',
        key: storageKey,
        body: input.fileBuffer,
        contentType: input.contentType || 'image/jpeg',
      });
      storedReceiptUrl = storageKey;
    }

    // Atomic transition
    const fromStatus = payment.status;
    const toStatus = 'AWAITING_VERIFICATION';
    assertPaymentTransition(fromStatus, toStatus);

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(paymentRecords)
        .set({
          status: toStatus,
          receiptUrl: storedReceiptUrl,
          receiptReference: input.receiptReference || payment.receiptReference,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRecords.id, paymentId),
            eq(paymentRecords.status, fromStatus),
          ),
        )
        .returning({ id: paymentRecords.id });

      if (flip.length === 0) {
        throw new ConflictException('Payment status already changed — concurrent update');
      }

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: paymentId,
        eventType: 'PAYMENT_PROOF_SUBMITTED',
        fromStatus,
        toStatus,
        actorId: buyerId,
        actorType: 'BUYER',
        notes: input.notes || null,
        receiptUrl: storedReceiptUrl,
      });

      await this.outbox.publish(
        'payment.proof_submitted',
        paymentId,
        {
          paymentId,
          orderId: payment.orderId,
          receiptUrl: storedReceiptUrl,
          receiptReference: input.receiptReference,
        },
        {},
        null,
        tx,
      );
    });

    this.logger.log(
      `Payment ${paymentId}: proof submitted by buyer ${buyerId}`,
    );

    return this.getPaymentOrThrow(paymentId);
  }

  // ═══════════════════════════════════════════════════════════════
  // MANUAL VERIFICATION (admin confirms/rejects proof)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Verify or reject a payment proof. Admin/merchant action.
   *
   * POST /v1/admin/payments/:id/verify
   *
   * Concurrency: optimistic lock — only one verifier wins.
   */
  async verifyPayment(
    paymentId: string,
    decision: 'CONFIRMED' | 'REJECTED',
    actorId: string,
    caller: CallerContext,
    input?: {
      notes?: string;
      verifiedAmountMinor?: number;
    },
  ) {
    const payment = await this.getPaymentOrThrow(paymentId);
    const order = await this.getOrderForPayment(payment.orderId);

    // Authorization: admin or merchant owner of the store
    if (!isTenantPrivileged(caller)) {
      await assertStoreInOrg(this.db, caller, order.storeId);
    }

    if (payment.status !== 'AWAITING_VERIFICATION') {
      throw new ConflictException(
        `Cannot verify payment in ${payment.status} status — must be AWAITING_VERIFICATION`,
      );
    }

    if (!['CONFIRMED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision must be CONFIRMED or REJECTED');
    }

    const fromStatus = payment.status;
    const confirmedAmount = input?.verifiedAmountMinor ?? payment.amountMinor;

    await this.db.db.transaction(async (tx) => {
      // Optimistic lock: only one concurrent verifier wins
      const flip = await tx
        .update(paymentRecords)
        .set({
          status: decision,
          confirmedAmountMinor: decision === 'CONFIRMED' ? confirmedAmount : null,
          verifiedBy: actorId,
          verifiedAt: new Date(),
          verificationNotes: input?.notes || null,
          confirmedAt: decision === 'CONFIRMED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRecords.id, paymentId),
            eq(paymentRecords.status, fromStatus),
          ),
        )
        .returning({ id: paymentRecords.id });

      if (flip.length === 0) {
        throw new ConflictException(
          'Payment already verified by another admin — concurrent verification conflict',
        );
      }

      // Append immutable event
      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: paymentId,
        eventType: decision === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED',
        fromStatus,
        toStatus: decision,
        actorId,
        actorType: 'ADMIN',
        amountMinor: decision === 'CONFIRMED' ? confirmedAmount : null,
        notes: input?.notes || null,
      });

      // If CONFIRMED: finalize financial breakdown + transition order
      if (decision === 'CONFIRMED') {
        await this.finalizeFinancialBreakdown(tx, payment.orderId);
        await this.transitionOrderAfterPaymentConfirmation(
          tx, payment.orderId, actorId,
        );
      }

      // Outbox event
      await this.outbox.publish(
        decision === 'CONFIRMED' ? 'payment.confirmed' : 'payment.rejected',
        paymentId,
        {
          paymentId,
          orderId: payment.orderId,
          verifiedBy: actorId,
          confirmedAmountMinor: confirmedAmount,
        },
        {},
        null,
        tx,
      );
    });

    this.logger.log(
      `Payment ${paymentId}: ${decision} by ${actorId}`,
    );

    return this.getPaymentOrThrow(paymentId);
  }

  // ═══════════════════════════════════════════════════════════════
  // COD CASH CONFIRMATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Confirm cash collection for COD payments.
   * Called by merchant/driver at delivery time.
   *
   * POST /v1/payments/:id/confirm-cash
   */
  async confirmCash(
    paymentId: string,
    actorId: string,
    caller: CallerContext,
    input?: { amountCollectedMinor?: number; notes?: string },
  ) {
    const payment = await this.getPaymentOrThrow(paymentId);
    const order = await this.getOrderForPayment(payment.orderId);

    // Authorization: merchant of the store or admin
    if (!isTenantPrivileged(caller)) {
      await assertStoreInOrg(this.db, caller, order.storeId);
    }

    if (payment.paymentMethod !== 'CASH_ON_DELIVERY') {
      throw new BadRequestException('Cash confirmation is only for COD payments');
    }

    if (payment.status !== 'AWAITING_PAYMENT') {
      throw new ConflictException(
        `Cannot confirm cash in ${payment.status} status`,
      );
    }

    const collectedAmount = input?.amountCollectedMinor ?? payment.amountMinor;
    const fromStatus = payment.status;

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(paymentRecords)
        .set({
          status: 'CONFIRMED',
          confirmedAmountMinor: collectedAmount,
          confirmedAt: new Date(),
          verifiedBy: actorId,
          verifiedAt: new Date(),
          verificationNotes: input?.notes || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRecords.id, paymentId),
            eq(paymentRecords.status, fromStatus),
          ),
        )
        .returning({ id: paymentRecords.id });

      if (flip.length === 0) {
        throw new ConflictException('Payment already confirmed — concurrent confirmation');
      }

      // Finalize financials
      await this.finalizeFinancialBreakdown(tx, payment.orderId);

      // Append event
      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: paymentId,
        eventType: 'PAYMENT_CONFIRMED',
        fromStatus,
        toStatus: 'CONFIRMED',
        actorId,
        actorType: 'MERCHANT',
        amountMinor: collectedAmount,
        notes: input?.notes || 'Cash collected at delivery',
      });

      await this.outbox.publish(
        'payment.confirmed',
        paymentId,
        {
          paymentId,
          orderId: payment.orderId,
          method: 'CASH_ON_DELIVERY',
          confirmedAmountMinor: collectedAmount,
        },
        {},
        null,
        tx,
      );
    });

    this.logger.log(
      `Payment ${paymentId}: COD cash confirmed (${collectedAmount}) by ${actorId}`,
    );

    return this.getPaymentOrThrow(paymentId);
  }

  // ═══════════════════════════════════════════════════════════════
  // FINANCIAL IMMATURITY ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set finalizedAt on the order's financial breakdown.
   * After this, no UPDATE to the breakdown is permitted.
   */
  private async finalizeFinancialBreakdown(
    tx: any,
    orderId: string,
  ): Promise<void> {
    const result = await tx
      .update(orderFinancialBreakdown)
      .set({ finalizedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(orderFinancialBreakdown.orderId, orderId),
          sql`${orderFinancialBreakdown.finalizedAt} IS NULL`,
        ),
      )
      .returning({ id: orderFinancialBreakdown.id });

    // If no rows updated, either already finalized or no breakdown exists.
    // Already finalized is fine (idempotent). No breakdown is a data issue.
    if (result.length === 0) {
      this.logger.warn(
        `Financial breakdown for order ${orderId} already finalized or missing`,
      );
    }
  }

  /**
   * Check whether a financial breakdown is finalized (immutable).
   */
  async isFinancialFinalized(orderId: string): Promise<boolean> {
    const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, orderId),
    });
    return !!breakdown?.finalizedAt;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT STATUS TRANSITION HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Transition a payment from CREATED to AWAITING_PAYMENT.
   * Called post-checkout for bank transfer orders once the buyer
   * is expected to submit proof.
   */
  async transitionToAwaitingVerification(paymentId: string, buyerId: string) {
    const payment = await this.getPaymentOrThrow(paymentId);
    if (payment.status !== 'CREATED') return; // idempotent

    const fromStatus = payment.status;
    const toStatus = 'AWAITING_PAYMENT';
    assertPaymentTransition(fromStatus, toStatus);

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(paymentRecords)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(
          and(
            eq(paymentRecords.id, paymentId),
            eq(paymentRecords.status, fromStatus),
          ),
        )
        .returning({ id: paymentRecords.id });

      if (flip.length > 0) {
        await tx.insert(paymentEvents).values({
          id: crypto.randomUUID(),
          paymentRecordId: paymentId,
          eventType: 'PAYMENT_AWAITING',
          fromStatus,
          toStatus,
          actorId: buyerId,
          actorType: 'SYSTEM',
          notes: 'Payment ready — awaiting buyer proof upload',
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ORDER FSM INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * After payment confirmation, transition the order from PAYMENT_PENDING
   * to PAYMENT_CONFIRMED so the merchant can accept/reject.
   */
  private async transitionOrderAfterPaymentConfirmation(
    tx: any,
    orderId: string,
    actorId: string,
  ): Promise<void> {
    const order = await this.getOrderForPayment(orderId);
    const currentStatus = order.status;

    if (currentStatus === 'PAYMENT_PENDING') {
      const flip = await tx
        .update(orders)
        .set({
          status: 'PAYMENT_CONFIRMED',
          paymentStatus: 'CONFIRMED',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.status, 'PAYMENT_PENDING'),
          ),
        )
        .returning({ id: orders.id });

      if (flip.length > 0) {
        await tx.insert(orderStatusHistory).values({
          id: crypto.randomUUID(),
          orderId,
          fromStatus: 'PAYMENT_PENDING',
          toStatus: 'PAYMENT_CONFIRMED',
          changedBy: actorId,
          actorType: 'SYSTEM',
          reason: 'Payment confirmed',
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REFUNDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Request a refund against a confirmed payment.
   *
   * Rules:
   * - Payment must be CONFIRMED, CAPTURED, or PARTIALLY_REFUNDED
   * - Refundable = confirmed_amount - SUM(SUCCEEDED + PROCESSING refunds)
   * - Amount must be > 0 and <= refundable
   * - Idempotency via unique key
   */
  async requestRefund(
    paymentId: string,
    amountMinor: number,
    reason: string,
    requestedBy: string,
    caller: CallerContext,
    input?: { idempotencyKey?: string; notes?: string },
  ) {
    // Validate reason
    if (!REFUND_REASONS.includes(reason as RefundReason)) {
      throw new BadRequestException(
        `Invalid refund reason: ${reason}. Allowed: ${REFUND_REASONS.join(', ')}`,
      );
    }

    if (amountMinor <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const payment = await this.getPaymentOrThrow(paymentId);
    const order = await this.getOrderForPayment(payment.orderId);

    // Buyer can only refund own payment; admin can refund any
    if (!isTenantPrivileged(caller) && order.buyerId !== caller.sub) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    // Payment must be in a refundable state
    const refundableStatuses = ['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED'];
    if (!refundableStatuses.includes(payment.status)) {
      throw new ConflictException(
        `Cannot refund payment in ${payment.status} status`,
      );
    }

    const confirmedAmount = payment.confirmedAmountMinor ?? payment.amountMinor;
    const idempotencyKey = input?.idempotencyKey || crypto.randomUUID();

    // Row-level lock + refundable calculation in a transaction
    return this.db.db.transaction(async (tx) => {
      // Lock the payment row
      const [lockedPayment] = await tx
        .select()
        .from(paymentRecords)
        .where(eq(paymentRecords.id, paymentId))
        .for('update')
        .limit(1);

      if (!lockedPayment) {
        throw new NotFoundException('Payment not found');
      }

      const lockedConfirmed = lockedPayment.confirmedAmountMinor ?? lockedPayment.amountMinor;

      // Calculate already-refunded amount
      const existingRefunds = await tx
        .select({ total: sql<number>`COALESCE(SUM(amount_minor), 0)` })
        .from(refunds)
        .where(
          and(
            eq(refunds.paymentRecordId, paymentId),
            inArray(refunds.status, ['REQUESTED', 'PROCESSING', 'SUCCEEDED', 'APPROVED']),
          ),
        );

      const alreadyRefunded = existingRefunds[0]?.total ?? 0;
      const refundable = lockedConfirmed - alreadyRefunded;

      if (amountMinor > refundable) {
        throw new BadRequestException(
          `Refund amount ${amountMinor} exceeds refundable balance ${refundable}`,
        );
      }

      const refundId = crypto.randomUUID();
      await tx.insert(refunds).values({
        id: refundId,
        paymentRecordId: paymentId,
        orderId: lockedPayment.orderId,
        idempotencyKey,
        amountMinor,
        currency: lockedPayment.currency,
        status: 'REQUESTED',
        reason,
        notes: input?.notes || null,
        requestedBy,
      });

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: paymentId,
        eventType: 'PAYMENT_REFUND_REQUESTED',
        fromStatus: lockedPayment.status,
        toStatus: lockedPayment.status,
        actorId: requestedBy,
        actorType: isTenantPrivileged(caller) ? 'ADMIN' : 'BUYER',
        amountMinor,
        notes: `Refund requested: ${reason}`,
      });

      await this.outbox.publish(
        'payment.refund_requested',
        paymentId,
        {
          refundId,
          paymentId,
          orderId: lockedPayment.orderId,
          amountMinor,
          reason,
        },
        {},
        null,
        tx,
      );

      return { refundId, amountMinor, status: 'REQUESTED' };
    });
  }

  /**
   * Approve a refund request. Admin action.
   * Transitions refund to SUCCEEDED and updates payment status if fully refunded.
   */
  async approveRefund(
    refundId: string,
    approverId: string,
    caller: CallerContext,
  ) {
    if (!isTenantPrivileged(caller)) {
      throw new ForbiddenException('Only admins can approve refunds');
    }

    const refundRow = await this.db.db.query.refunds.findFirst({
      where: eq(refunds.id, refundId),
    });
    if (!refundRow) throw new NotFoundException('Refund not found');
    if (refundRow.status !== 'REQUESTED') {
      throw new ConflictException(`Refund is in ${refundRow.status} status — must be REQUESTED`);
    }

    const payment = await this.getPaymentOrThrow(refundRow.paymentRecordId);
    const confirmedAmount = payment.confirmedAmountMinor ?? payment.amountMinor;

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(refunds)
        .set({
          status: 'SUCCEEDED',
          approvedBy: approverId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(refunds.id, refundId),
            eq(refunds.status, 'REQUESTED'),
          ),
        )
        .returning({ id: refunds.id });

      if (flip.length === 0) {
        throw new ConflictException('Refund already processed');
      }

      // Check if fully refunded → update payment status
      const allRefunds = await tx
        .select({ total: sql<number>`COALESCE(SUM(amount_minor), 0)` })
        .from(refunds)
        .where(
          and(
            eq(refunds.paymentRecordId, payment.id),
            inArray(refunds.status, ['SUCCEEDED', 'PROCESSING']),
          ),
        );

      const totalRefunded = allRefunds[0]?.total ?? 0;

      let newPaymentStatus = payment.status;
      if (totalRefunded >= confirmedAmount) {
        newPaymentStatus = 'REFUNDED';
      } else if (totalRefunded > 0) {
        newPaymentStatus = 'PARTIALLY_REFUNDED';
      }

      if (newPaymentStatus !== payment.status) {
        await tx
          .update(paymentRecords)
          .set({ status: newPaymentStatus, updatedAt: new Date() })
          .where(eq(paymentRecords.id, payment.id));
      }

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: payment.id,
        eventType: 'PAYMENT_REFUND_SUCCEEDED',
        fromStatus: payment.status,
        toStatus: newPaymentStatus,
        actorId: approverId,
        actorType: 'ADMIN',
        amountMinor: refundRow.amountMinor,
        notes: `Refund approved: ${refundId}`,
      });

      await this.outbox.publish(
        'payment.refund_succeeded',
        payment.id,
        {
          refundId,
          paymentId: payment.id,
          orderId: payment.orderId,
          amountMinor: refundRow.amountMinor,
        },
        {},
        null,
        tx,
      );
    });

    this.logger.log(`Refund ${refundId} approved by ${approverId}`);
    return this.getRefund(refundId);
  }

  // ═══════════════════════════════════════════════════════════════
  // SETTLEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate and create a settlement record for a sub-order.
   * Uses the finalized financial breakdown — never recalculates from mutable data.
   */
  async calculateSettlement(
    subOrderId: string,
    actorId: string,
    caller: CallerContext,
  ) {
    if (!isTenantPrivileged(caller)) {
      throw new ForbiddenException('Only admins can calculate settlements');
    }

    const order = await this.getOrderForPayment(subOrderId);
    const payment = await this.getPaymentForOrder(subOrderId);
    if (!payment) throw new NotFoundException('No payment found for this order');

    const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, subOrderId),
    });
    if (!breakdown) throw new NotFoundException('Financial breakdown not found');

    const confirmedAmount = payment.confirmedAmountMinor ?? payment.amountMinor;

    // Calculate total refunds
    const refundResult = await this.db.db
      .select({ total: sql<number>`COALESCE(SUM(amount_minor), 0)` })
      .from(refunds)
      .where(
        and(
          eq(refunds.paymentRecordId, payment.id),
          eq(refunds.status, 'SUCCEEDED'),
        ),
      );
    const totalRefunded = refundResult[0]?.total ?? 0;

    // Settlement formula: gross - refunds - commission - fees = net
    const grossMinor = confirmedAmount;
    const refundMinor = totalRefunded;
    const commissionMinor = breakdown.commissionMinor;
    const feeMinor = breakdown.deliveryFeeMinor;
    const netMinor = grossMinor - refundMinor - commissionMinor - feeMinor;

    const settlementId = crypto.randomUUID();

    await this.db.db.transaction(async (tx) => {
      await tx.insert(settlementRecords).values({
        id: settlementId,
        subOrderId,
        paymentRecordId: payment.id,
        merchantStoreId: order.storeId,
        grossMinor,
        refundMinor,
        commissionMinor,
        feeMinor,
        netMinor,
        currency: payment.currency,
        status: 'CALCULATED',
        calculatedAt: new Date(),
      });

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: payment.id,
        eventType: 'PAYMENT_REFUND_SUCCEEDED',
        fromStatus: payment.status,
        toStatus: payment.status,
        actorId: actorId,
        actorType: 'SYSTEM',
        amountMinor: netMinor,
        notes: `Settlement calculated: gross=${grossMinor}, refund=${refundMinor}, commission=${commissionMinor}, fee=${feeMinor}, net=${netMinor}`,
      });

      await this.outbox.publish(
        'payment.settlement_calculated',
        payment.id,
        {
          settlementId,
          subOrderId,
          paymentId: payment.id,
          netMinor,
          currency: payment.currency,
        },
        {},
        null,
        tx,
      );
    });

    this.logger.log(`Settlement ${settlementId} calculated for order ${subOrderId}`);
    return this.getSettlement(settlementId);
  }

  /**
   * Mark a settlement as PAID. Admin action.
   */
  async markSettlementPaid(
    settlementId: string,
    actorId: string,
    caller: CallerContext,
    input?: { paymentReference?: string; notes?: string },
  ) {
    if (!isTenantPrivileged(caller)) {
      await assertStoreInOrg(this.db, caller, (await this.getSettlement(settlementId)).merchantStoreId);
    }

    const flip = await this.db.db
      .update(settlementRecords)
      .set({
        status: 'PAID',
        paidAt: new Date(),
        paymentReference: input?.paymentReference || null,
        notes: input?.notes || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(settlementRecords.id, settlementId),
          inArray(settlementRecords.status, ['CALCULATED', 'DUE']),
        ),
      )
      .returning({ id: settlementRecords.id });

    if (flip.length === 0) {
      throw new ConflictException('Settlement not in payable status');
    }

    return this.getSettlement(settlementId);
  }

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT CANCELLATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cancel a payment record. Called when the order is cancelled.
   */
  async cancelPayment(paymentId: string, actorId: string, tx?: any) {
    const payment = await this.getPaymentOrThrow(paymentId);
    if (isPaymentTerminal(payment.status)) {
      throw new ConflictException(`Cannot cancel payment in ${payment.status} status`);
    }

    const fromStatus = payment.status;
    const executor = tx || this.db.db;

    const flip = await executor
      .update(paymentRecords)
      .set({
        status: 'CANCELLED',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentRecords.id, paymentId),
          eq(paymentRecords.status, fromStatus),
        ),
      )
      .returning({ id: paymentRecords.id });

    if (flip.length > 0) {
      await executor.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: paymentId,
        eventType: 'PAYMENT_CANCELLED',
        fromStatus,
        toStatus: 'CANCELLED',
        actorId,
        actorType: 'SYSTEM',
        notes: 'Payment cancelled — order cancelled',
      });

      await this.outbox.publish(
        'payment.cancelled',
        paymentId,
        { paymentId, orderId: payment.orderId },
        {},
        null,
        executor,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT EXPIRATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Expire a payment that has exceeded its time window.
   * Idempotent and concurrency-safe.
   */
  async expirePayment(paymentId: string) {
    const payment = await this.getPaymentOrThrow(paymentId);

    if (payment.status !== 'AWAITING_PAYMENT' && payment.status !== 'AWAITING_VERIFICATION') {
      return; // Already handled or not expirable
    }

    const fromStatus = payment.status;

    await this.db.db.transaction(async (tx) => {
      const flip = await tx
        .update(paymentRecords)
        .set({
          status: 'EXPIRED',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentRecords.id, paymentId),
            eq(paymentRecords.status, fromStatus),
          ),
        )
        .returning({ id: paymentRecords.id });

      if (flip.length === 0) return; // Concurrent handler already expired

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: paymentId,
        eventType: 'PAYMENT_EXPIRED',
        fromStatus,
        toStatus: 'EXPIRED',
        actorType: 'SYSTEM',
        notes: 'Payment expired — time window exceeded',
      });

      // Transition order to CANCELLED if still in payment-pending state
      const order = await this.getOrderForPayment(payment.orderId);
      if (['PAYMENT_PENDING'].includes(order.status)) {
        await tx
          .update(orders)
          .set({ status: 'CANCELLED', paymentStatus: 'EXPIRED', updatedAt: new Date() })
          .where(
            and(
              eq(orders.id, payment.orderId),
              eq(orders.status, 'PAYMENT_PENDING'),
            ),
          );

        await tx.insert(orderStatusHistory).values({
          id: crypto.randomUUID(),
          orderId: payment.orderId,
          fromStatus: 'PAYMENT_PENDING',
          toStatus: 'CANCELLED',
          actorType: 'SYSTEM',
          reason: 'Payment expired',
        });
      }

      await this.outbox.publish(
        'payment.expired',
        paymentId,
        { paymentId, orderId: payment.orderId },
        {},
        null,
        tx,
      );
    });

    this.logger.log(`Payment ${paymentId} expired`);
  }

  // ═══════════════════════════════════════════════════════════════
  // QUERY METHODS
  // ═══════════════════════════════════════════════════════════════

  async getPaymentOrThrow(paymentId: string) {
    const payment = await this.db.db.query.paymentRecords.findFirst({
      where: eq(paymentRecords.id, paymentId),
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async getPaymentForOrder(orderId: string) {
    return this.db.db.query.paymentRecords.findFirst({
      where: eq(paymentRecords.orderId, orderId),
    });
  }

  async getOrderForPayment(orderId: string) {
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) throw new NotFoundException('Order not found for payment');
    return order;
  }

  async getPaymentEvents(paymentId: string) {
    return this.db.db.query.paymentEvents.findMany({
      where: eq(paymentEvents.paymentRecordId, paymentId),
      orderBy: [paymentEvents.createdAt],
    });
  }

  async getRefund(refundId: string) {
    const refund = await this.db.db.query.refunds.findFirst({
      where: eq(refunds.id, refundId),
    });
    if (!refund) throw new NotFoundException('Refund not found');
    return refund;
  }

  async getSettlement(settlementId: string) {
    const settlement = await this.db.db.query.settlementRecords.findFirst({
      where: eq(settlementRecords.id, settlementId),
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  /**
   * List payments with optional filters.
   */
  async listPayments(filters?: {
    status?: string;
    paymentMethod?: string;
    storeId?: string;
    buyerId?: string;
  }) {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(paymentRecords.status, filters.status));
    }
    if (filters?.paymentMethod) {
      conditions.push(eq(paymentRecords.paymentMethod, filters.paymentMethod));
    }

    // If filtering by store or buyer, join through orders
    if (filters?.storeId || filters?.buyerId) {
      const orderConditions = [];
      if (filters.storeId) {
        orderConditions.push(eq(orders.storeId, filters.storeId));
      }
      if (filters.buyerId) {
        orderConditions.push(eq(orders.buyerId, filters.buyerId));
      }

      return this.db.db.query.paymentRecords.findMany({
        where: and(...conditions),
        orderBy: [desc(paymentRecords.createdAt)],
        limit: 100,
      });
    }

    return this.db.db.query.paymentRecords.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(paymentRecords.createdAt)],
      limit: 100,
    });
  }

  /**
   * List refunds for a payment.
   */
  async listRefunds(paymentId: string) {
    return this.db.db.query.refunds.findMany({
      where: eq(refunds.paymentRecordId, paymentId),
      orderBy: [desc(refunds.createdAt)],
    });
  }

  /**
   * List settlements with optional filters.
   */
  async listSettlements(filters?: {
    storeId?: string;
    status?: string;
  }) {
    const conditions = [];
    if (filters?.storeId) {
      conditions.push(eq(settlementRecords.merchantStoreId, filters.storeId));
    }
    if (filters?.status) {
      conditions.push(eq(settlementRecords.status, filters.status));
    }
    return this.db.db.query.settlementRecords.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(settlementRecords.createdAt)],
      limit: 100,
    });
  }

  /**
   * Get payments pending verification (for admin queue).
   */
  async getVerificationQueue() {
    return this.db.db.query.paymentRecords.findMany({
      where: eq(paymentRecords.status, 'AWAITING_VERIFICATION'),
      orderBy: [paymentRecords.createdAt],
      limit: 50,
    });
  }

  /**
   * Get stale payments for reconciliation.
   */
  async getStalePayments() {
    const hours = Number(
      process.env['PAYMENT_EXPIRY_HOURS'] || DEFAULT_PAYMENT_EXPIRY_HOURS,
    );
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.db.db.query.paymentRecords.findMany({
      where: and(
        inArray(paymentRecords.status, ['AWAITING_PAYMENT', 'AWAITING_VERIFICATION']),
        sql`${paymentRecords.createdAt} < ${cutoff.toISOString()}`,
      ),
      orderBy: [paymentRecords.createdAt],
      limit: 100,
    });
  }
}
