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
import { paymentRecords, paymentEvents, refunds, settlementRecords, paymentProofUploadIntents } from './payments.schema';
import { orders, orderFinancialBreakdown, orderStatusHistory } from '../orders/orders.schema';
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
  isSupportedPaymentMethod,
  SUPPORTED_PAYMENT_METHODS,
  DEFAULT_PAYMENT_EXPIRY_HOURS,
} from './payments.types';

// ── Allowed upload MIME types for payment proofs ────────────────
const ALLOWED_PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_PROOF_SIZE = 10 * 1024 * 1024; // 10 MB
const PROOF_UPLOAD_STALE_MINUTES = 60;
const PROOF_UPLOAD_LEASE_MINUTES = 30;
const PROOF_CLEANUP_LEASE_MINUTES = 5;
const PROOF_CLEANUP_MAX_ATTEMPTS = 12;

function isStorageObjectNotFound(error: any): boolean {
  const status = error?.$metadata?.httpStatusCode;
  const code = error?.name || error?.Code || error?.code;
  return status === 404 || ['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(code);
}

function assertPositiveMinorAmount(amount: number, fieldName: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive safe integer in minor units`);
  }
}

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
    buyerId?: string,
  ): Promise<string> {
    if (!isSupportedPaymentMethod(paymentMethod)) {
      throw new BadRequestException(
        `Unsupported payment method: ${paymentMethod}. Supported methods: ${SUPPORTED_PAYMENT_METHODS.join(', ')}`,
      );
    }

    const id = crypto.randomUUID();
    const provider = this.registry.getDefault();

    // Compute expiry for bank transfers
    let expiresAt: Date | null = null;
    if (paymentMethod === 'BANK_TRANSFER') {
      const hours = Number(process.env['PAYMENT_EXPIRY_HOURS'] || DEFAULT_PAYMENT_EXPIRY_HOURS);
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    // COD begins in AWAITING_PAYMENT. Bank transfer is created as CREATED,
    // then advanced to AWAITING_PAYMENT inside the same checkout transaction.
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

    await this.outbox.publish('payment.created', id, {
      paymentId: id, orderId, paymentMethod, amountMinor, currency, status: initialStatus,
    }, {}, null, tx);

    // Bank-transfer payment gating is part of checkout persistence, not a
    // best-effort post-commit side effect. Preserve the CREATED → AWAITING_PAYMENT
    // history sequence while keeping both states and outbox records in checkout's tx.
    if (paymentMethod === 'BANK_TRANSFER') {
      await tx.update(paymentRecords)
        .set({ status: 'AWAITING_PAYMENT', updatedAt: new Date() })
        .where(eq(paymentRecords.id, id));
      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: id,
        eventType: 'PAYMENT_AWAITING',
        fromStatus: 'CREATED',
        toStatus: 'AWAITING_PAYMENT',
        actorId: buyerId ?? null,
        actorType: 'SYSTEM',
        notes: 'Bank transfer checkout — awaiting buyer proof upload',
      });
      await this.outbox.publish('payment.awaiting_payment', id, {
        paymentId: id, orderId, buyerId: buyerId ?? null,
        fromStatus: 'CREATED', toStatus: 'AWAITING_PAYMENT',
      }, {}, null, tx);
    }

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

    if (order.buyerId !== caller.sub && !isTenantPrivileged(caller)) {
      throw new ForbiddenException('You do not have access to this payment');
    }
    if (payment.paymentMethod !== 'BANK_TRANSFER') {
      throw new BadRequestException('Proof submission is only for bank transfer payments');
    }
    if (!['AWAITING_PAYMENT', 'REJECTED'].includes(payment.status)) {
      throw new ConflictException(`Cannot submit proof in ${payment.status} status`);
    }

    const previousReceiptUrl = payment.receiptUrl ?? null;
    const uploadsBucket = process.env['S3_UPLOADS_BUCKET'] || 'scs-uploads';
    const fromStatus = payment.status;
    const toStatus = 'AWAITING_VERIFICATION';
    assertPaymentTransition(fromStatus, toStatus);

    let storedReceiptUrl = input.receiptUrl || previousReceiptUrl;
    let newStorageKey: string | null = null;
    let uploadIntentId: string | null = null;
    let uploadLeaseOwner: string | null = null;

    if (input.fileBuffer) {
      if (!this.storage) {
        throw new BadRequestException('Payment proof storage is not configured');
      }
      if (input.fileBuffer.length === 0) {
        throw new BadRequestException('Payment proof file cannot be empty');
      }
      if (input.fileBuffer.length > MAX_PROOF_SIZE) {
        throw new BadRequestException('Payment proof exceeds the 10 MB upload limit');
      }
      const contentType = input.contentType || 'image/jpeg';
      if (!ALLOWED_PROOF_TYPES.has(contentType)) {
        throw new BadRequestException('Unsupported payment proof file type');
      }
      const rawExtension = input.fileName?.includes('.') ? input.fileName.split('.').pop() : 'jpg';
      const extension = (rawExtension || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
      newStorageKey = `payment-proofs/${paymentId}/${crypto.randomUUID()}.${extension}`;
      uploadIntentId = crypto.randomUUID();
      uploadLeaseOwner = `proof-upload-${crypto.randomUUID()}`;

      // The intent is durable before any object-store side effect. A process
      // crash at any later point is recoverable without listing the bucket.
      await this.db.db.insert(paymentProofUploadIntents).values({
        id: uploadIntentId,
        paymentRecordId: paymentId,
        storageBucket: uploadsBucket,
        storageKey: newStorageKey,
        contentType,
        sizeBytes: input.fileBuffer.length,
        status: 'UPLOADING',
        attemptCount: 0,
        leaseOwner: uploadLeaseOwner,
        leaseExpiresAt: new Date(Date.now() + PROOF_UPLOAD_LEASE_MINUTES * 60_000),
      });

      try {
        await this.storage.putObject({
          bucket: uploadsBucket,
          key: newStorageKey,
          body: input.fileBuffer,
          contentType,
        });
        const uploaded = await this.db.db.update(paymentProofUploadIntents)
          .set({
            status: 'UPLOADED',
            uploadedAt: new Date(),
            leaseExpiresAt: new Date(Date.now() + PROOF_UPLOAD_LEASE_MINUTES * 60_000),
            updatedAt: new Date(),
          })
          .where(and(
            eq(paymentProofUploadIntents.id, uploadIntentId),
            eq(paymentProofUploadIntents.status, 'UPLOADING'),
            eq(paymentProofUploadIntents.leaseOwner, uploadLeaseOwner),
          ))
          .returning({ id: paymentProofUploadIntents.id });

        if (uploaded.length !== 1) {
          // A stale cleanup claimant fenced this upload. Compensate the late
          // object write; if deletion fails, reopen the durable intent.
          try {
            await this.storage.deleteObject(uploadsBucket, newStorageKey);
            await this.db.db.update(paymentProofUploadIntents)
              .set({ status: 'CLEANED', leaseOwner: null, leaseExpiresAt: null, cleanedAt: new Date(), updatedAt: new Date() })
              .where(eq(paymentProofUploadIntents.id, uploadIntentId));
          } catch {
            await this.db.db.update(paymentProofUploadIntents)
              .set({ status: 'CLEANUP_PENDING', leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date(), lastErrorCode: 'LATE_UPLOAD_COMPENSATION_FAILED', updatedAt: new Date() })
              .where(eq(paymentProofUploadIntents.id, uploadIntentId));
          }
          throw new ConflictException('Payment proof upload lost its recovery lease; please retry');
        }
      } catch (uploadError) {
        // Do not delete directly here: the request may have been interrupted
        // after the object store accepted the upload. The durable sweeper will
        // verify the payment reference and object existence before cleanup.
        try {
          await this.db.db.update(paymentProofUploadIntents)
            .set({
              status: 'CLEANUP_PENDING',
              leaseOwner: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(),
              lastErrorCode: 'UPLOAD_OR_INTENT_UPDATE_FAILED',
              updatedAt: new Date(),
            })
            .where(and(
              eq(paymentProofUploadIntents.id, uploadIntentId),
              eq(paymentProofUploadIntents.status, 'UPLOADING'),
            ));
        } catch {
          // The original UPLOADING lease remains recoverable after its expiry.
        }
        throw uploadError;
      }
      storedReceiptUrl = newStorageKey;
    }

    try {
      await this.db.db.transaction(async (tx) => {
        const flip = await tx.update(paymentRecords)
          .set({
            status: toStatus,
            receiptUrl: storedReceiptUrl,
            receiptReference: input.receiptReference || payment.receiptReference,
            updatedAt: new Date(),
          })
          .where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.status, fromStatus)))
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
        await this.outbox.publish('payment.proof_submitted', paymentId, {
          paymentId,
          orderId: payment.orderId,
          receiptUrl: storedReceiptUrl,
          receiptReference: input.receiptReference,
        }, {}, null, tx);

        if (uploadIntentId && uploadLeaseOwner) {
          const committed = await tx.update(paymentProofUploadIntents)
            .set({
              status: 'COMMITTED',
              leaseOwner: null,
              leaseExpiresAt: null,
              nextAttemptAt: null,
              committedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(
              eq(paymentProofUploadIntents.id, uploadIntentId),
              eq(paymentProofUploadIntents.status, 'UPLOADED'),
              eq(paymentProofUploadIntents.leaseOwner, uploadLeaseOwner),
            ))
            .returning({ id: paymentProofUploadIntents.id });
          if (committed.length !== 1) {
            throw new ConflictException('Payment proof upload lease expired before commit; please retry');
          }
        }

        // Retire a prior managed proof durably in the same transaction as
        // replacing its payment-row reference. A process crash after commit
        // therefore cannot strand the previous object without a cleanup intent.
        const managedPrefix = `payment-proofs/${paymentId}/`;
        if (
          previousReceiptUrl &&
          previousReceiptUrl.startsWith(managedPrefix) &&
          previousReceiptUrl !== storedReceiptUrl
        ) {
          const [previousIntent] = await tx.select().from(paymentProofUploadIntents)
            .where(eq(paymentProofUploadIntents.storageKey, previousReceiptUrl))
            .limit(1);
          if (previousIntent) {
            if (previousIntent.status !== 'CLEANED') {
              await tx.update(paymentProofUploadIntents)
                .set({
                  status: 'CLEANUP_PENDING',
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  nextAttemptAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(paymentProofUploadIntents.id, previousIntent.id));
            }
          } else {
            await tx.insert(paymentProofUploadIntents).values({
              id: crypto.randomUUID(),
              paymentRecordId: paymentId,
              storageBucket: uploadsBucket,
              storageKey: previousReceiptUrl,
              contentType: 'application/octet-stream',
              sizeBytes: 0,
              status: 'CLEANUP_PENDING',
              attemptCount: 0,
              nextAttemptAt: new Date(),
            });
          }
        }
      });
    } catch (error) {
      if (uploadIntentId && newStorageKey && uploadLeaseOwner) {
        try {
          const [persisted] = await this.db.db.select({
            receiptUrl: paymentRecords.receiptUrl,
          }).from(paymentRecords).where(eq(paymentRecords.id, paymentId)).limit(1);

          // A commit can succeed while its acknowledgement is lost. Never
          // schedule deletion when the durable payment row references the key.
          if (persisted?.receiptUrl === newStorageKey) {
            return this.getPaymentOrThrow(paymentId);
          }

          await this.db.db.update(paymentProofUploadIntents)
            .set({
              status: 'CLEANUP_PENDING',
              leaseOwner: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(),
              lastErrorCode: 'PAYMENT_COMMIT_FAILED',
              updatedAt: new Date(),
            })
            .where(and(
              eq(paymentProofUploadIntents.id, uploadIntentId),
              eq(paymentProofUploadIntents.status, 'UPLOADED'),
              eq(paymentProofUploadIntents.leaseOwner, uploadLeaseOwner),
            ));
        } catch (cleanupError: any) {
          this.logger.warn(`Payment proof cleanup scheduling deferred for intent ${uploadIntentId}: ${cleanupError?.message || 'database verification failed'}`);
        }
      }
      throw error;
    }

    this.logger.log(`Payment ${paymentId}: proof submitted by buyer ${buyerId}`);
    return this.getPaymentOrThrow(paymentId);
  }

  /**
   * Recover stale proof uploads without bucket listing. Only durable intent
   * rows older than the grace period are eligible; each batch is claimed with
   * SKIP LOCKED and a fencing owner. No scheduler/worker is activated here.
   */
  async cleanupStaleProofUploads(batchSize = 25): Promise<{
    claimed: number;
    committed: number;
    cleaned: number;
    retried: number;
    failed: number;
  }> {
    if (!this.storage) {
      throw new BadRequestException('Payment proof storage is not configured');
    }
    const limit = Math.max(1, Math.min(100, Math.floor(batchSize) || 25));
    const workerId = `proof-cleanup-${crypto.randomUUID()}`;
    const claimed = await this.db.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id
          FROM payment_proof_upload_intents
          WHERE status IN ('UPLOADING', 'UPLOADED', 'CLEANUP_PENDING', 'CLEANING')
            AND created_at <= now() - make_interval(mins => ${PROOF_UPLOAD_STALE_MINUTES})
            AND (lease_expires_at IS NULL OR lease_expires_at <= now())
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          ORDER BY created_at, id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE payment_proof_upload_intents AS intent
        SET status = 'CLEANING',
            lease_owner = ${workerId},
            lease_expires_at = now() + make_interval(mins => ${PROOF_CLEANUP_LEASE_MINUTES}),
            attempt_count = attempt_count + 1,
            updated_at = now()
        FROM candidates
        WHERE intent.id = candidates.id
        RETURNING
          intent.id,
          intent.storage_bucket AS "storageBucket",
          intent.storage_key AS "storageKey",
          intent.attempt_count AS "attemptCount"
      `);
      return ((result as any).rows ?? []) as Array<{
        id: string;
        storageBucket: string;
        storageKey: string;
        attemptCount: number;
      }>;
    });

    const summary = { claimed: claimed.length, committed: 0, cleaned: 0, retried: 0, failed: 0 };
    for (const intent of claimed) {
      try {
        // Check every payment row, not only the intent's original payment:
        // a shared/misreferenced key must never be deleted while any payment uses it.
        const [paymentReference] = await this.db.db.select({
          id: paymentRecords.id,
        }).from(paymentRecords).where(eq(paymentRecords.receiptUrl, intent.storageKey)).limit(1);

        if (paymentReference) {
          await this.db.db.update(paymentProofUploadIntents)
            .set({
              status: 'COMMITTED', leaseOwner: null, leaseExpiresAt: null,
              nextAttemptAt: null, committedAt: new Date(), updatedAt: new Date(),
            })
            .where(and(
              eq(paymentProofUploadIntents.id, intent.id),
              eq(paymentProofUploadIntents.status, 'CLEANING'),
              eq(paymentProofUploadIntents.leaseOwner, workerId),
            ));
          summary.committed += 1;
          continue;
        }

        let objectExists = true;
        try {
          await this.storage.headObject(intent.storageBucket, intent.storageKey);
        } catch (storageError) {
          if (isStorageObjectNotFound(storageError)) {
            objectExists = false;
          } else {
            throw storageError;
          }
        }
        if (objectExists) {
          try {
            await this.storage.deleteObject(intent.storageBucket, intent.storageKey);
          } catch (storageError) {
            if (!isStorageObjectNotFound(storageError)) throw storageError;
          }
        }

        await this.db.db.update(paymentProofUploadIntents)
          .set({
            status: 'CLEANED', leaseOwner: null, leaseExpiresAt: null,
            nextAttemptAt: null, cleanedAt: new Date(), lastErrorCode: null, updatedAt: new Date(),
          })
          .where(and(
            eq(paymentProofUploadIntents.id, intent.id),
            eq(paymentProofUploadIntents.status, 'CLEANING'),
            eq(paymentProofUploadIntents.leaseOwner, workerId),
          ));
        summary.cleaned += 1;
      } catch {
        const terminal = intent.attemptCount >= PROOF_CLEANUP_MAX_ATTEMPTS;
        const backoffSeconds = Math.min(3600, 30 * (2 ** Math.min(intent.attemptCount - 1, 7)));
        await this.db.db.update(paymentProofUploadIntents)
          .set({
            status: terminal ? 'FAILED' : 'CLEANUP_PENDING',
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: terminal ? null : new Date(Date.now() + backoffSeconds * 1000),
            lastErrorCode: 'STORAGE_CLEANUP_FAILED',
            updatedAt: new Date(),
          })
          .where(and(
            eq(paymentProofUploadIntents.id, intent.id),
            eq(paymentProofUploadIntents.status, 'CLEANING'),
            eq(paymentProofUploadIntents.leaseOwner, workerId),
          ));
        if (terminal) summary.failed += 1;
        else summary.retried += 1;
      }
    }
    return summary;
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
    assertPositiveMinorAmount(confirmedAmount, 'Verified amount');

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
        .where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.status, fromStatus)))
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
        await this.transitionOrderAfterPaymentConfirmation(tx, payment.orderId, actorId);
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

    this.logger.log(`Payment ${paymentId}: ${decision} by ${actorId}`);

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
      throw new ConflictException(`Cannot confirm cash in ${payment.status} status`);
    }

    const collectedAmount = input?.amountCollectedMinor ?? payment.amountMinor;
    assertPositiveMinorAmount(collectedAmount, 'Collected amount');
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
        .where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.status, fromStatus)))
        .returning({ id: paymentRecords.id });

      if (flip.length === 0) {
        throw new ConflictException('Payment already confirmed — concurrent confirmation');
      }

      // Finalize financials and synchronize the denormalized order payment state.
      // COD orders are allowed to progress through fulfillment before collection,
      // so confirmation must not rewind their operational order status.
      await this.finalizeFinancialBreakdown(tx, payment.orderId);
      await tx
        .update(orders)
        .set({ paymentStatus: 'CONFIRMED', updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));

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

    this.logger.log(`Payment ${paymentId}: COD cash confirmed (${collectedAmount}) by ${actorId}`);

    return this.getPaymentOrThrow(paymentId);
  }

  // ═══════════════════════════════════════════════════════════════
  // FINANCIAL IMMATURITY ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set finalizedAt on the order's financial breakdown.
   * After this, no UPDATE to the breakdown is permitted.
   */
  private async finalizeFinancialBreakdown(tx: any, orderId: string): Promise<void> {
    // Lock and distinguish an already-finalized row from a missing financial
    // record. A missing breakdown must abort payment confirmation; otherwise
    // the payment could become CONFIRMED while settlement can never be built.
    const [breakdown] = await tx
      .select({
        id: orderFinancialBreakdown.id,
        finalizedAt: orderFinancialBreakdown.finalizedAt,
      })
      .from(orderFinancialBreakdown)
      .where(eq(orderFinancialBreakdown.orderId, orderId))
      .for('update')
      .limit(1);

    if (!breakdown) {
      throw new ConflictException(
        'Financial breakdown is missing; payment confirmation cannot proceed',
      );
    }

    // Finalization is intentionally idempotent for an existing immutable row.
    if (breakdown.finalizedAt) return;

    const result = await tx
      .update(orderFinancialBreakdown)
      .set({ finalizedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(orderFinancialBreakdown.id, breakdown.id),
          sql`${orderFinancialBreakdown.finalizedAt} IS NULL`,
        ),
      )
      .returning({ id: orderFinancialBreakdown.id });

    if (result.length === 0) {
      throw new ConflictException(
        'Financial breakdown changed during payment confirmation; retry the operation',
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
        .where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.status, fromStatus)))
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
        await this.outbox.publish('payment.awaiting_payment', paymentId, {
          paymentId, orderId: payment.orderId, buyerId, fromStatus, toStatus,
        }, {}, null, tx);
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
        .where(and(eq(orders.id, orderId), eq(orders.status, 'PAYMENT_PENDING')))
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

    assertPositiveMinorAmount(amountMinor, 'Refund amount');

    const payment = await this.getPaymentOrThrow(paymentId);
    const order = await this.getOrderForPayment(payment.orderId);

    // Buyer can only refund own payment; admin can refund any
    if (!isTenantPrivileged(caller) && order.buyerId !== caller.sub) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    // Use the caller key when supplied; a generated key preserves a unique
    // record for legacy callers that do not yet send an idempotency key.
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

      // Idempotency is checked under the payment lock before refundable-state
      // validation, so a retry remains safe even after the first request was
      // approved and the payment status changed.
      const [existingRefund] = await tx
        .select()
        .from(refunds)
        .where(eq(refunds.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingRefund) {
        if (
          existingRefund.paymentRecordId !== paymentId ||
          Number(existingRefund.amountMinor) !== amountMinor ||
          existingRefund.reason !== reason ||
          existingRefund.requestedBy !== requestedBy
        ) {
          throw new ConflictException('Refund idempotency key was already used for a different request');
        }
        return {
          refundId: existingRefund.id,
          amountMinor: existingRefund.amountMinor,
          status: existingRefund.status,
        };
      }

      const refundableStatuses = ['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED'];
      if (!refundableStatuses.includes(lockedPayment.status)) {
        throw new ConflictException(`Cannot refund payment in ${lockedPayment.status} status`);
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
      const [insertedRefund] = await tx
        .insert(refunds)
        .values({
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
        })
        .onConflictDoNothing()
        .returning({ id: refunds.id });

      // The payment lock serializes same-payment requests. This conflict path
      // additionally handles a key reused concurrently against another payment.
      if (!insertedRefund) {
        const [conflictingRefund] = await tx
          .select()
          .from(refunds)
          .where(eq(refunds.idempotencyKey, idempotencyKey))
          .limit(1);
        if (
          !conflictingRefund ||
          conflictingRefund.paymentRecordId !== paymentId ||
          Number(conflictingRefund.amountMinor) !== amountMinor ||
          conflictingRefund.reason !== reason ||
          conflictingRefund.requestedBy !== requestedBy
        ) {
          throw new ConflictException('Refund idempotency key was already used for a different request');
        }
        return {
          refundId: conflictingRefund.id,
          amountMinor: conflictingRefund.amountMinor,
          status: conflictingRefund.status,
        };
      }

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
  async approveRefund(refundId: string, approverId: string, caller: CallerContext) {
    if (!isTenantPrivileged(caller)) {
      throw new ForbiddenException('Only admins can approve refunds');
    }

    const refundSnapshot = await this.db.db.query.refunds.findFirst({
      where: eq(refunds.id, refundId),
    });
    if (!refundSnapshot) throw new NotFoundException('Refund not found');

    await this.db.db.transaction(async (tx) => {
      // Serialize all refund approvals for a payment on the same row lock used
      // by requestRefund. Without this, two partial approvals can both observe
      // only their own committed amount and leave a fully refunded payment
      // incorrectly marked PARTIALLY_REFUNDED.
      const [payment] = await tx
        .select()
        .from(paymentRecords)
        .where(eq(paymentRecords.id, refundSnapshot.paymentRecordId))
        .for('update')
        .limit(1);

      if (!payment) throw new NotFoundException('Payment not found');

      const [refundRow] = await tx
        .select()
        .from(refunds)
        .where(and(eq(refunds.id, refundId), eq(refunds.paymentRecordId, payment.id)))
        .limit(1);

      if (!refundRow) throw new NotFoundException('Refund not found');
      if (refundRow.status !== 'REQUESTED') {
        throw new ConflictException(`Refund is in ${refundRow.status} status — must be REQUESTED`);
      }

      const refundableStatuses = ['CONFIRMED', 'CAPTURED', 'PARTIALLY_REFUNDED'];
      if (!refundableStatuses.includes(payment.status)) {
        throw new ConflictException(`Cannot approve refund for payment in ${payment.status} status`);
      }

      const confirmedAmount = payment.confirmedAmountMinor ?? payment.amountMinor;
      const flip = await tx
        .update(refunds)
        .set({
          status: 'SUCCEEDED',
          approvedBy: approverId,
          updatedAt: new Date(),
        })
        .where(and(eq(refunds.id, refundId), eq(refunds.status, 'REQUESTED')))
        .returning({ id: refunds.id });

      if (flip.length === 0) {
        throw new ConflictException('Refund already processed');
      }

      // Recompute after acquiring the payment lock so concurrent approvals
      // contribute to one serialized total.
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

      // Keep the denormalized order projection in sync with the authoritative
      // payment state. Refunds never alter fulfillment/order status.
      await tx
        .update(orders)
        .set({ paymentStatus: newPaymentStatus, updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));

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
  async calculateSettlement(subOrderId: string, actorId: string, caller: CallerContext) {
    if (!isTenantPrivileged(caller)) {
      throw new ForbiddenException('Only admins can calculate settlements');
    }

    // Serialize settlement calculation with refund requests/approvals on the
    // same payment row. This also makes concurrent calculate calls observe
    // the first committed settlement instead of attempting a second payout.
    const result = await this.db.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, subOrderId))
        .limit(1);
      if (!order) throw new NotFoundException('Order not found');

      const [payment] = await tx
        .select()
        .from(paymentRecords)
        .where(eq(paymentRecords.orderId, subOrderId))
        .for('update')
        .limit(1);
      if (!payment) throw new NotFoundException('No payment found for this order');

      // Settlement is a distribution of confirmed funds, not an estimate of
      // the order amount. Never create a payable record before confirmation.
      const settlementEligibleStatuses = [
        'CONFIRMED',
        'CAPTURED',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
      ];
      if (!settlementEligibleStatuses.includes(payment.status)) {
        throw new ConflictException(
          `Cannot calculate settlement for payment in ${payment.status} status`,
        );
      }

      const [existingSettlement] = await tx
        .select()
        .from(settlementRecords)
        .where(and(
          eq(settlementRecords.subOrderId, subOrderId),
          eq(settlementRecords.paymentRecordId, payment.id),
        ))
        .orderBy(desc(settlementRecords.createdAt))
        .limit(1);

      if (existingSettlement) {
        if (['PENDING', 'CALCULATED', 'DUE'].includes(existingSettlement.status)) {
          return { settlement: existingSettlement, created: false };
        }
        // A paid settlement is immutable. Any subsequent refund or commercial
        // correction must use the explicit adjustment workflow, never a fresh
        // payable settlement calculation.
        throw new ConflictException(
          `Settlement already exists in ${existingSettlement.status} status; use the settlement adjustment workflow`,
        );
      }

      const breakdown = await tx.query.orderFinancialBreakdown.findFirst({
        where: eq(orderFinancialBreakdown.orderId, subOrderId),
      });
      if (!breakdown) throw new NotFoundException('Financial breakdown not found');

      const confirmedAmount = payment.confirmedAmountMinor ?? payment.amountMinor;
      assertPositiveMinorAmount(confirmedAmount, 'Confirmed payment amount');
      const refundResult = await tx
        .select({ total: sql<number>`COALESCE(SUM(amount_minor), 0)` })
        .from(refunds)
        .where(and(eq(refunds.paymentRecordId, payment.id), eq(refunds.status, 'SUCCEEDED')));
      const totalRefunded = refundResult[0]?.total ?? 0;

      // Settlement formula: gross - refunds - commission - fees = net
      const grossMinor = confirmedAmount;
      const refundMinor = totalRefunded;
      const commissionMinor = breakdown.commissionMinor;
      const feeMinor = breakdown.deliveryFeeMinor;
      const netMinor = grossMinor - refundMinor - commissionMinor - feeMinor;
      const settlementId = crypto.randomUUID();

      const [settlement] = await tx.insert(settlementRecords).values({
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
      }).returning();
      if (!settlement) {
        throw new Error('Settlement insert completed without returning a persisted record');
      }

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: payment.id,
        eventType: 'PAYMENT_SETTLEMENT_CALCULATED',
        fromStatus: payment.status,
        toStatus: payment.status,
        actorId,
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

      return { settlement, created: true };
    });

    if (result.created) {
      this.logger.log(`Settlement ${result.settlement.id} calculated for order ${subOrderId}`);
    }
    return result.settlement;
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
    const settlementSnapshot = await this.getSettlement(settlementId);
    if (!isTenantPrivileged(caller)) {
      await assertStoreInOrg(this.db, caller, settlementSnapshot.merchantStoreId);
    }

    await this.db.db.transaction(async (tx) => {
      // Lock the settlement row so concurrent pay attempts produce exactly
      // one terminal transition, immutable history row and outbox event.
      const [settlement] = await tx
        .select()
        .from(settlementRecords)
        .where(eq(settlementRecords.id, settlementId))
        .for('update')
        .limit(1);

      if (!settlement) throw new NotFoundException('Settlement not found');
      if (!['CALCULATED', 'DUE'].includes(settlement.status)) {
        throw new ConflictException('Settlement not in payable status');
      }

      const paidAt = new Date();
      const [updated] = await tx
        .update(settlementRecords)
        .set({
          status: 'PAID',
          paidAt,
          paymentReference: input?.paymentReference || null,
          notes: input?.notes || null,
          updatedAt: paidAt,
        })
        .where(
          and(
            eq(settlementRecords.id, settlementId),
            inArray(settlementRecords.status, ['CALCULATED', 'DUE']),
          ),
        )
        .returning({ id: settlementRecords.id });

      if (!updated) {
        throw new ConflictException('Settlement not in payable status');
      }

      await tx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentRecordId: settlement.paymentRecordId,
        eventType: 'PAYMENT_SETTLEMENT_PAID',
        fromStatus: settlement.status,
        toStatus: 'PAID',
        actorId,
        actorType: isTenantPrivileged(caller) ? 'ADMIN' : 'MERCHANT',
        amountMinor: settlement.netMinor,
        notes: input?.notes || 'Settlement marked as paid',
        metadata: {
          settlementId,
          paymentReference: input?.paymentReference || null,
        },
      });

      await this.outbox.publish(
        'payment.settlement_paid',
        settlement.paymentRecordId,
        {
          settlementId,
          subOrderId: settlement.subOrderId,
          paymentId: settlement.paymentRecordId,
          merchantStoreId: settlement.merchantStoreId,
          netMinor: settlement.netMinor,
          currency: settlement.currency,
          paymentReference: input?.paymentReference || null,
        },
        {},
        null,
        tx,
      );
    });

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
      .where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.status, fromStatus)))
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

    // COD is collected at delivery, so it must not expire merely because
    // the order has been awaiting collection for longer than the bank-transfer window.
    if (payment.paymentMethod === 'CASH_ON_DELIVERY') return;

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
        .where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.status, fromStatus)))
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
        const orderFlip = await tx
          .update(orders)
          .set({ status: 'CANCELLED', paymentStatus: 'EXPIRED', updatedAt: new Date() })
          .where(and(eq(orders.id, payment.orderId), eq(orders.status, 'PAYMENT_PENDING')))
          .returning({ id: orders.id });

        // A concurrent order lifecycle action can win after the read above.
        // Append cancellation history only when this transaction changed the row.
        if (orderFlip.length > 0) {
          await tx.insert(orderStatusHistory).values({
            id: crypto.randomUUID(),
            orderId: payment.orderId,
            fromStatus: 'PAYMENT_PENDING',
            toStatus: 'CANCELLED',
            actorType: 'SYSTEM',
            reason: 'Payment expired',
          });
        }
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

    // If filtering by store or buyer, resolve matching order IDs first.
    // The previous implementation constructed orderConditions but never
    // applied them, which silently widened a filtered request to all payments.
    if (filters?.storeId || filters?.buyerId) {
      const orderConditions = [];
      if (filters.storeId) {
        orderConditions.push(eq(orders.storeId, filters.storeId));
      }
      if (filters.buyerId) {
        orderConditions.push(eq(orders.buyerId, filters.buyerId));
      }

      const matchingOrders = await this.db.db.query.orders.findMany({
        where: and(...orderConditions),
        columns: { id: true },
      });
      const orderIds = matchingOrders.map((order) => order.id);
      if (orderIds.length === 0) return [];
      conditions.push(inArray(paymentRecords.orderId, orderIds));
    }

    return this.db.db.query.paymentRecords.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(paymentRecords.createdAt)],
      limit: 100,
    });
  }

  /**
   * List payments visible to an authenticated merchant.
   *
   * Scope is derived from the caller's active organization, matching the
   * platform's org-wide merchant order-read permission. A supplied storeId
   * narrows that scope and must belong to the active organization.
   */
  async listMerchantPayments(
    caller: CallerContext,
    filters?: { storeId?: string; status?: string; paymentMethod?: string },
  ) {
    if (isTenantPrivileged(caller)) {
      return this.listPayments(filters);
    }
    if (!caller.activeOrg) {
      throw new ForbiddenException('An active organization is required to view merchant payments');
    }
    if (filters?.storeId) {
      await assertStoreInOrg(this.db, caller, filters.storeId);
    }

    const conditions = [eq(stores.orgId, caller.activeOrg)];
    if (filters?.storeId) conditions.push(eq(stores.id, filters.storeId));
    if (filters?.status) conditions.push(eq(paymentRecords.status, filters.status));
    if (filters?.paymentMethod)
      conditions.push(eq(paymentRecords.paymentMethod, filters.paymentMethod));

    const rows = await this.db.db
      .select({ payment: paymentRecords })
      .from(paymentRecords)
      .innerJoin(orders, eq(paymentRecords.orderId, orders.id))
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(and(...conditions))
      .orderBy(desc(paymentRecords.createdAt))
      .limit(100);

    return rows.map((row) => row.payment);
  }

  /**
   * List settlements visible to an authenticated merchant.
   *
   * Scope is derived from the caller's active organization, matching the
   * platform's org-wide merchant settlement-read permission. A supplied storeId
   * narrows that scope and must belong to the active organization.
   */
  async listMerchantSettlements(
    caller: CallerContext,
    filters?: { storeId?: string; status?: string },
  ) {
    if (isTenantPrivileged(caller)) {
      return this.listSettlements(filters);
    }
    if (!caller.activeOrg) {
      throw new ForbiddenException(
        'An active organization is required to view merchant settlements',
      );
    }
    if (filters?.storeId) {
      await assertStoreInOrg(this.db, caller, filters.storeId);
    }

    const conditions = [eq(stores.orgId, caller.activeOrg)];
    if (filters?.storeId) conditions.push(eq(stores.id, filters.storeId));
    if (filters?.status) conditions.push(eq(settlementRecords.status, filters.status));

    const rows = await this.db.db
      .select({ settlement: settlementRecords })
      .from(settlementRecords)
      .innerJoin(stores, eq(settlementRecords.merchantStoreId, stores.id))
      .where(and(...conditions))
      .orderBy(desc(settlementRecords.createdAt))
      .limit(100);

    return rows.map((row) => row.settlement);
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
  async listSettlements(filters?: { storeId?: string; status?: string }) {
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
   * List refund requests awaiting an explicit admin decision.
   * The queue is read-only; approval remains a separate guarded action.
   */
  async getRequestedRefunds() {
    return this.db.db.query.refunds.findMany({
      where: eq(refunds.status, 'REQUESTED'),
      orderBy: [desc(refunds.createdAt)],
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
    const hours = Number(process.env['PAYMENT_EXPIRY_HOURS'] || DEFAULT_PAYMENT_EXPIRY_HOURS);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.db.db.query.paymentRecords.findMany({
      where: and(
        inArray(paymentRecords.status, ['AWAITING_PAYMENT', 'AWAITING_VERIFICATION']),
        sql`${paymentRecords.paymentMethod} IS DISTINCT FROM 'CASH_ON_DELIVERY'`,
        sql`${paymentRecords.createdAt} < ${cutoff.toISOString()}`,
      ),
      orderBy: [paymentRecords.createdAt],
      limit: 100,
    });
  }
}
