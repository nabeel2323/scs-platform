import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { products, productModeration } from './catalog.schema';
import { merchantOffers, productOfferReviewState } from './catalog.offer.schema';
import { eq, and, isNull, isNotNull, sql, desc, asc } from 'drizzle-orm';
import { AuditService } from '../audit/index';
import crypto from 'node:crypto';

/**
 * P11 Product Governance Service — lifecycle state machine.
 *
 * Locked lifecycle:
 *   DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED
 *                                  └→ REJECTED → SUBMITTED (resubmit)
 *
 * Additional transitions:
 *   SUBMITTED → DRAFT (withdraw)
 *   APPROVED → UNDER_REVIEW (merchant edit)
 *   PUBLISHED → UNDER_REVIEW (merchant edit + unpublish + suspend offers)
 *   PUBLISHED → APPROVED (merchant unpublish)
 *   APPROVED → PUBLISHED (merchant publish)
 *
 * All transitions are atomic with optimistic locking and moderation ledger.
 */

/** Valid governance status values */
export type ProductGovernanceStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED';

/** Moderation action types (append-only ledger) */
export type ModerationAction =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'PUBLISHED'
  | 'UNPUBLISHED';

/** High-risk fields that trigger re-review when edited on APPROVED/PUBLISHED products */
export const HIGH_RISK_FIELDS = new Set([
  'title',
  'titleAr',
  'description',
  'descriptionAr',
  'categoryId',
  'brandId',
  'productTypeId',
  'gtin',
  'ean',
  'mpn',
  'images',
  // variants and typed attributes are checked separately
]);

export interface SubmitProductInput {
  productId: string;
  storeId: string;
  actorUserId: string;
  actorRole: string;
  clientUpdatedAt?: string;
}

export interface ModerateProductInput {
  productId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
  actorUserId: string;
  actorRole: string;
  clientUpdatedAt: string;
}

export interface PublishProductInput {
  productId: string;
  storeId: string;
  actorUserId: string;
  actorRole: string;
  clientUpdatedAt?: string;
}

@Injectable()
export class ProductGovernanceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
    private readonly audit: AuditService,
  ) {}

  // ── Merchant Submission ─────────────────────────────────────────

  /**
   * Submit a product for review.
   * DRAFT/REJECTED → SUBMITTED
   */
  async submitProduct(input: SubmitProductInput) {
    const { productId, storeId, actorUserId, actorRole, clientUpdatedAt } = input;

    // Verify product exists and belongs to the store
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    // Validate source status
    const currentStatus = product.status;
    if (currentStatus !== 'DRAFT' && currentStatus !== 'REJECTED') {
      throw new ConflictException({
        statusCode: 409,
        message: `Cannot submit product in ${currentStatus} status. Must be DRAFT or REJECTED.`,
        currentStatus,
      });
    }

    // Atomic conditional UPDATE with optimistic locking
    const now = new Date();
    const conditions = [
      eq(products.id, productId),
      eq(products.storeId, storeId),
      sql`${products.status} IN ('DRAFT', 'REJECTED')`,
      isNull(products.deletedAt),
    ];
    if (clientUpdatedAt) {
      const clientDate = new Date(clientUpdatedAt);
      if (isNaN(clientDate.getTime())) {
        throw new BadRequestException('Invalid updatedAt timestamp');
      }
      conditions.push(eq(products.updatedAt, clientDate));
    }

    return this.db.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(products)
        .set({
          status: 'SUBMITTED',
          submittedAt: now,
          updatedAt: now,
        })
        .where(and(...conditions))
        .returning({ id: products.id, status: products.status, updatedAt: products.updatedAt });

      if (!updated) {
        // Check if it's a concurrency conflict or a status issue
        const current = await tx.query.products.findFirst({
          where: eq(products.id, productId),
          columns: { id: true, status: true, updatedAt: true },
        });
        if (!current) throw new NotFoundException('Product not found');
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: current.status,
          currentUpdatedAt: current.updatedAt,
        });
      }

      // Append moderation ledger record
      await tx.insert(productModeration).values({
        id: crypto.randomUUID(),
        productId,
        action: 'SUBMITTED',
        fromStatus: currentStatus,
        toStatus: 'SUBMITTED',
        actorUserId,
        actorRole,
      });

      // Transactional outbox event
      await this.outbox.publish(
        'product.submitted',
        productId,
        { productId, storeId, submittedAt: now.toISOString() },
        {},
        null,
        tx,
      );

      return {
        id: productId,
        status: 'SUBMITTED',
        submittedAt: now,
        updatedAt: updated.updatedAt,
      };
    });
  }

  // ── Merchant Withdrawal ─────────────────────────────────────────

  /**
   * Withdraw a submitted product from review.
   * SUBMITTED → DRAFT
   */
  async withdrawProduct(input: SubmitProductInput) {
    const { productId, storeId, actorUserId, actorRole, clientUpdatedAt } = input;

    // Verify product exists and belongs to the store
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    if (product.status !== 'SUBMITTED') {
      throw new ConflictException({
        statusCode: 409,
        message: `Cannot withdraw product in ${product.status} status. Must be SUBMITTED.`,
        currentStatus: product.status,
      });
    }

    const now = new Date();
    const conditions = [
      eq(products.id, productId),
      eq(products.storeId, storeId),
      eq(products.status, 'SUBMITTED'),
      isNull(products.deletedAt),
    ];
    if (clientUpdatedAt) {
      const clientDate = new Date(clientUpdatedAt);
      if (isNaN(clientDate.getTime())) {
        throw new BadRequestException('Invalid updatedAt timestamp');
      }
      conditions.push(eq(products.updatedAt, clientDate));
    }

    return this.db.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(products)
        .set({
          status: 'DRAFT',
          updatedAt: now,
        })
        .where(and(...conditions))
        .returning({ id: products.id, status: products.status, updatedAt: products.updatedAt });

      if (!updated) {
        const current = await tx.query.products.findFirst({
          where: eq(products.id, productId),
          columns: { id: true, status: true, updatedAt: true },
        });
        if (!current) throw new NotFoundException('Product not found');
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: current.status,
          currentUpdatedAt: current.updatedAt,
        });
      }

      // Append moderation ledger record
      await tx.insert(productModeration).values({
        id: crypto.randomUUID(),
        productId,
        action: 'WITHDRAWN',
        fromStatus: 'SUBMITTED',
        toStatus: 'DRAFT',
        actorUserId,
        actorRole,
      });

      // Outbox event
      await this.outbox.publish(
        'product.withdrawn',
        productId,
        { productId, storeId, withdrawnAt: now.toISOString() },
        {},
        null,
        tx,
      );

      return {
        id: productId,
        status: 'DRAFT',
        updatedAt: updated.updatedAt,
      };
    });
  }

  // ── Admin Review Start ──────────────────────────────────────────

  /**
   * Start reviewing a submitted product.
   * SUBMITTED → UNDER_REVIEW (admin only)
   */
  async startReview(productId: string, actorUserId: string, actorRole: string, clientUpdatedAt?: string) {
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.status !== 'SUBMITTED') {
      throw new ConflictException({
        statusCode: 409,
        message: `Cannot start review on product in ${product.status} status. Must be SUBMITTED.`,
        currentStatus: product.status,
      });
    }

    const now = new Date();
    const conditions = [
      eq(products.id, productId),
      eq(products.status, 'SUBMITTED'),
      isNull(products.deletedAt),
    ];
    if (clientUpdatedAt) {
      const clientDate = new Date(clientUpdatedAt);
      if (isNaN(clientDate.getTime())) {
        throw new BadRequestException('Invalid updatedAt timestamp');
      }
      conditions.push(eq(products.updatedAt, clientDate));
    }

    return this.db.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(products)
        .set({
          status: 'UNDER_REVIEW',
          updatedAt: now,
        })
        .where(and(...conditions))
        .returning({ id: products.id, status: products.status, updatedAt: products.updatedAt });

      if (!updated) {
        const current = await tx.query.products.findFirst({
          where: eq(products.id, productId),
          columns: { id: true, status: true, updatedAt: true },
        });
        if (!current) throw new NotFoundException('Product not found');
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: current.status,
          currentUpdatedAt: current.updatedAt,
        });
      }

      // No moderation ledger entry for "start review" — it's not a terminal action
      // The approve/reject actions create the ledger entries

      return {
        id: productId,
        status: 'UNDER_REVIEW',
        updatedAt: updated.updatedAt,
      };
    });
  }

  // ── Admin Moderation (Approve/Reject) ───────────────────────────

  /**
   * Approve or reject a product under review.
   * UNDER_REVIEW → APPROVED | REJECTED
   */
  async moderateProduct(input: ModerateProductInput) {
    const { productId, decision, reason, actorUserId, actorRole, clientUpdatedAt } = input;

    // Validate rejection requires reason
    if (decision === 'REJECTED' && (!reason || reason.trim().length === 0)) {
      throw new BadRequestException('Rejection requires a reason');
    }
    if (reason && reason.length > 1000) {
      throw new BadRequestException('Reason must not exceed 1000 characters');
    }

    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');

    if (product.status !== 'UNDER_REVIEW') {
      throw new ConflictException({
        statusCode: 409,
        message: `Cannot moderate product in ${product.status} status. Must be UNDER_REVIEW.`,
        currentStatus: product.status,
      });
    }

    const clientDate = new Date(clientUpdatedAt);
    if (isNaN(clientDate.getTime())) {
      throw new BadRequestException('Invalid updatedAt timestamp');
    }

    const toStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const now = new Date();

    return this.db.db.transaction(async (tx) => {
      // D-2 FIX: Acquire row-level lock BEFORE any mutation.
      // This serializes concurrent moderator actions on the same product.
      const [locked] = await tx
        .select({ id: products.id, status: products.status, updatedAt: products.updatedAt })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .for('update');

      if (!locked) throw new NotFoundException('Product not found');

      // Re-validate status under lock
      if (locked.status !== 'UNDER_REVIEW') {
        throw new ConflictException({
          statusCode: 409,
          message: `Cannot moderate product in ${locked.status} status. Must be UNDER_REVIEW.`,
          currentStatus: locked.status,
        });
      }

      // Validate optimistic lock version under lock
      if (new Date(locked.updatedAt).getTime() !== clientDate.getTime()) {
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: locked.status,
          currentUpdatedAt: locked.updatedAt,
        });
      }

      const updatePayload: Record<string, unknown> = {
        status: toStatus,
        reviewedAt: now,
        reviewedBy: actorUserId,
        updatedAt: now,
      };
      if (decision === 'REJECTED') {
        updatePayload['rejectionReason'] = reason;
      }

      const [updated] = await tx
        .update(products)
        .set(updatePayload)
        .where(and(
          eq(products.id, productId),
          eq(products.status, 'UNDER_REVIEW'),
          eq(products.updatedAt, clientDate),
          isNull(products.deletedAt),
        ))
        .returning({ id: products.id, status: products.status, updatedAt: products.updatedAt });

      if (!updated) {
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: locked.status,
          currentUpdatedAt: locked.updatedAt,
        });
      }

      // Append moderation ledger record
      await tx.insert(productModeration).values({
        id: crypto.randomUUID(),
        productId,
        action: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        fromStatus: 'UNDER_REVIEW',
        toStatus,
        actorUserId,
        actorRole,
        reason: reason ?? null,
      });

      // D-3 FIX: Restore offers from snapshot on approval (per-offer restoration)
      if (decision === 'APPROVED') {
        await this.restoreOffersFromSnapshot(tx, productId);
      }

      // Outbox event
      const eventType = decision === 'APPROVED' ? 'product.approved' : 'product.rejected';
      await this.outbox.publish(
        eventType,
        productId,
        {
          productId,
          storeId: product.storeId,
          decision,
          reason,
          reviewedAt: now.toISOString(),
        },
        {},
        null,
        tx,
      );

      return {
        id: productId,
        status: toStatus,
        reviewedAt: now,
        reviewedBy: actorUserId,
        rejectionReason: decision === 'REJECTED' ? reason : null,
        updatedAt: updated.updatedAt,
      };
    });
  }

  // ── Merchant Publishing ─────────────────────────────────────────

  /**
   * Publish an approved product.
   * APPROVED → PUBLISHED
   */
  async publishProduct(input: PublishProductInput) {
    const { productId, storeId, actorUserId, actorRole, clientUpdatedAt } = input;

    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    if (product.status !== 'APPROVED') {
      throw new ConflictException({
        statusCode: 409,
        message: `Cannot publish product in ${product.status} status. Must be APPROVED.`,
        currentStatus: product.status,
      });
    }

    const now = new Date();
    const conditions = [
      eq(products.id, productId),
      eq(products.storeId, storeId),
      eq(products.status, 'APPROVED'),
      isNull(products.deletedAt),
    ];
    if (clientUpdatedAt) {
      const clientDate = new Date(clientUpdatedAt);
      if (isNaN(clientDate.getTime())) {
        throw new BadRequestException('Invalid updatedAt timestamp');
      }
      conditions.push(eq(products.updatedAt, clientDate));
    }

    return this.db.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(products)
        .set({
          status: 'PUBLISHED',
          publishedAt: now,
          updatedAt: now,
        })
        .where(and(...conditions))
        .returning({ id: products.id, status: products.status, updatedAt: products.updatedAt });

      if (!updated) {
        const current = await tx.query.products.findFirst({
          where: eq(products.id, productId),
          columns: { id: true, status: true, updatedAt: true },
        });
        if (!current) throw new NotFoundException('Product not found');
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: current.status,
          currentUpdatedAt: current.updatedAt,
        });
      }

      // Append moderation ledger record
      await tx.insert(productModeration).values({
        id: crypto.randomUUID(),
        productId,
        action: 'PUBLISHED',
        fromStatus: 'APPROVED',
        toStatus: 'PUBLISHED',
        actorUserId,
        actorRole,
      });

      // Outbox event
      await this.outbox.publish(
        'product.published',
        productId,
        { productId, storeId, publishedAt: now.toISOString() },
        {},
        null,
        tx,
      );

      return {
        id: productId,
        status: 'PUBLISHED',
        publishedAt: now,
        updatedAt: updated.updatedAt,
      };
    });
  }

  // ── Merchant Unpublishing ───────────────────────────────────────

  /**
   * Unpublish a published product (returns to APPROVED, no longer searchable).
   * PUBLISHED → APPROVED
   */
  async unpublishProduct(input: PublishProductInput) {
    const { productId, storeId, actorUserId, actorRole, clientUpdatedAt } = input;

    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId) {
      throw new ForbiddenException('Product does not belong to your store');
    }

    if (product.status !== 'PUBLISHED') {
      throw new ConflictException({
        statusCode: 409,
        message: `Cannot unpublish product in ${product.status} status. Must be PUBLISHED.`,
        currentStatus: product.status,
      });
    }

    const now = new Date();
    const conditions = [
      eq(products.id, productId),
      eq(products.storeId, storeId),
      eq(products.status, 'PUBLISHED'),
      isNull(products.deletedAt),
    ];
    if (clientUpdatedAt) {
      const clientDate = new Date(clientUpdatedAt);
      if (isNaN(clientDate.getTime())) {
        throw new BadRequestException('Invalid updatedAt timestamp');
      }
      conditions.push(eq(products.updatedAt, clientDate));
    }

    return this.db.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(products)
        .set({
          status: 'APPROVED',
          updatedAt: now,
        })
        .where(and(...conditions))
        .returning({ id: products.id, status: products.status, updatedAt: products.updatedAt });

      if (!updated) {
        const current = await tx.query.products.findFirst({
          where: eq(products.id, productId),
          columns: { id: true, status: true, updatedAt: true },
        });
        if (!current) throw new NotFoundException('Product not found');
        throw new ConflictException({
          statusCode: 409,
          message: 'CONFLICT',
          currentStatus: current.status,
          currentUpdatedAt: current.updatedAt,
        });
      }

      // Append moderation ledger record
      await tx.insert(productModeration).values({
        id: crypto.randomUUID(),
        productId,
        action: 'UNPUBLISHED',
        fromStatus: 'PUBLISHED',
        toStatus: 'APPROVED',
        actorUserId,
        actorRole,
      });

      // Outbox event
      await this.outbox.publish(
        'product.unpublished',
        productId,
        { productId, storeId, unpublishedAt: now.toISOString() },
        {},
        null,
        tx,
      );

      return {
        id: productId,
        status: 'APPROVED',
        updatedAt: updated.updatedAt,
      };
    });
  }

  // ── Edit Governance (Re-review Trigger) ─────────────────────────

  /**
   * Check if an edit to a product should trigger re-review.
   * Called by CatalogService.updateProduct() when product is APPROVED or PUBLISHED.
   *
   * Returns true if high-risk fields changed and re-review is needed.
   */
  async triggerReReviewIfNeeded(
    tx: any,
    productId: string,
    changedFields: Set<string>,
    hasVariantChanges: boolean,
    hasAttributeChanges: boolean,
    actorUserId: string,
    actorRole: string,
  ): Promise<{ triggered: boolean; fromStatus: string; toStatus: string }> {
    // Check if any high-risk field changed
    const hasHighRiskChange = Array.from(changedFields).some((f) => HIGH_RISK_FIELDS.has(f));
    const needsReReview = hasHighRiskChange || hasVariantChanges || hasAttributeChanges;

    if (!needsReReview) {
      return { triggered: false, fromStatus: '', toStatus: '' };
    }

    // Get current status
    const product = await tx.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { id: true, status: true, storeId: true },
    });

    if (!product) return { triggered: false, fromStatus: '', toStatus: '' };

    const fromStatus = product.status;

    // Only APPROVED and PUBLISHED trigger re-review
    if (fromStatus !== 'APPROVED' && fromStatus !== 'PUBLISHED') {
      return { triggered: false, fromStatus: '', toStatus: '' };
    }

    const now = new Date();

    // Transition to UNDER_REVIEW
    await tx
      .update(products)
      .set({
        status: 'UNDER_REVIEW',
        updatedAt: now,
      })
      .where(eq(products.id, productId));

    // If was PUBLISHED, snapshot + suspend offers and remove from search
    if (fromStatus === 'PUBLISHED') {
      const reviewCycleId = crypto.randomUUID();
      await this.snapshotAndSuspendOffersForProduct(tx, productId, reviewCycleId);
    }

    // Append moderation ledger
    await tx.insert(productModeration).values({
      id: crypto.randomUUID(),
      productId,
      action: 'SUBMITTED', // Re-review is like a re-submission
      fromStatus,
      toStatus: 'UNDER_REVIEW',
      actorUserId,
      actorRole,
      reason: 'Product edited — high-risk fields changed',
    });

    // Outbox event
    await this.outbox.publish(
      'product.rereview',
      productId,
      {
        productId,
        storeId: product.storeId,
        fromStatus,
        toStatus: 'UNDER_REVIEW',
        reason: 'high-risk field edit',
      },
      {},
      null,
      tx,
    );

    return { triggered: true, fromStatus, toStatus: 'UNDER_REVIEW' };
  }

  // ── Offer Snapshot/Suspension/Restoration (D-3 Fix) ─────────────

  /**
   * Snapshot each offer's current isAvailable state, then suspend all offers.
   * Called when PUBLISHED → UNDER_REVIEW due to high-risk edit.
   *
   * D-3 fix: Previously this blindly set isAvailable=false with no snapshot.
   * Now we persist each offer's pre-review state in product_offer_review_state
   * so restoration can be per-offer, not a blanket true.
   */
  async snapshotAndSuspendOffersForProduct(tx: any, productId: string, reviewCycleId: string) {
    // Fetch all current offers for this product
    const offers = await tx
      .select({ id: merchantOffers.id, isAvailable: merchantOffers.isAvailable })
      .from(merchantOffers)
      .where(eq(merchantOffers.productId, productId));

    // Snapshot each offer's current availability (idempotent via unique constraint)
    for (const offer of offers) {
      await tx
        .insert(productOfferReviewState)
        .values({
          id: crypto.randomUUID(),
          productId,
          offerId: offer.id,
          previousIsAvailable: offer.isAvailable,
          reviewCycleId,
        })
        .onConflictDoNothing({ target: [productOfferReviewState.offerId, productOfferReviewState.reviewCycleId] });
    }

    // Suspend all offers
    await tx
      .update(merchantOffers)
      .set({ isAvailable: false, updatedAt: new Date() })
      .where(eq(merchantOffers.productId, productId));
  }

  /**
   * Restore offer availability from snapshot after approval.
   * D-3 fix: Previously this blindly set all to true.
   * Now restores each offer to its pre-review isAvailable state.
   */
  async restoreOffersFromSnapshot(tx: any, productId: string) {
    // Find all unrestored snapshots for this product
    const snapshots = await tx
      .select({
        offerId: productOfferReviewState.offerId,
        previousIsAvailable: productOfferReviewState.previousIsAvailable,
      })
      .from(productOfferReviewState)
      .where(and(
        eq(productOfferReviewState.productId, productId),
        isNull(productOfferReviewState.restoredAt),
      ));

    // Restore each offer to its pre-review state
    for (const snap of snapshots) {
      await tx
        .update(merchantOffers)
        .set({ isAvailable: snap.previousIsAvailable, updatedAt: new Date() })
        .where(eq(merchantOffers.id, snap.offerId));
    }

    // Mark snapshots as restored
    if (snapshots.length > 0) {
      await tx
        .update(productOfferReviewState)
        .set({ restoredAt: new Date() })
        .where(and(
          eq(productOfferReviewState.productId, productId),
          isNull(productOfferReviewState.restoredAt),
        ));
    }
  }

  // ── Moderation History ──────────────────────────────────────────

  /**
   * Get the moderation history for a product (immutable, chronological).
   */
  async getModerationHistory(productId: string) {
    const product = await this.db.db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const history = await this.db.db
      .select()
      .from(productModeration)
      .where(eq(productModeration.productId, productId))
      .orderBy(asc(productModeration.createdAt));

    return {
      productId,
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorUserId: h.actorUserId,
        actorRole: h.actorRole,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
    };
  }

  // ── Moderation Queue ────────────────────────────────────────────

  /**
   * Get the moderation queue for admins.
   * Shows products in SUBMITTED or UNDER_REVIEW status.
   */
  async getModerationQueue(options: {
    status?: string;
    categoryId?: string;
    storeId?: string;
    limit?: number;
    offset?: number;
    sort?: string;
  }) {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const conditions = [
      isNull(products.deletedAt),
      sql`${products.status} IN ('SUBMITTED', 'UNDER_REVIEW')`,
    ];

    if (options.status) {
      conditions.push(eq(products.status, options.status));
    }
    if (options.categoryId) {
      conditions.push(eq(products.categoryId, options.categoryId));
    }
    if (options.storeId) {
      conditions.push(eq(products.storeId, options.storeId));
    }

    // Sorting
    let orderBy;
    switch (options.sort) {
      case 'createdAt_desc':
        orderBy = desc(products.createdAt);
        break;
      case 'title_asc':
        orderBy = asc(products.title);
        break;
      case 'createdAt_asc':
      default:
        orderBy = asc(products.createdAt);
        break;
    }

    const [items, countResult] = await Promise.all([
      this.db.db
        .select({
          id: products.id,
          title: products.title,
          titleAr: products.titleAr,
          status: products.status,
          storeId: products.storeId,
          categoryId: products.categoryId,
          slug: products.slug,
          images: products.images,
          submittedAt: products.submittedAt,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(and(...conditions)),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    };
  }

  // ── Import Governance Check ─────────────────────────────────────

  /**
   * Check if an import can modify a product.
   * Returns: 'allowed' | 'skip' | 're-review'
   *
   * - SUBMITTED/UNDER_REVIEW: skip (do not modify)
   * - PUBLISHED with high-risk field changes: re-review
   * - DRAFT/REJECTED/APPROVED: allowed
   */
  async checkImportEligibility(productId: string): Promise<{
    eligible: boolean;
    action: 'allowed' | 'skip' | 're-review';
    currentStatus: string;
  }> {
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      columns: { id: true, status: true },
    });

    if (!product) {
      return { eligible: true, action: 'allowed', currentStatus: 'NEW' };
    }

    const status = product.status;

    // Cannot modify products under review
    if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') {
      return { eligible: false, action: 'skip', currentStatus: status };
    }

    // PUBLISHED products can be modified but trigger re-review
    if (status === 'PUBLISHED') {
      return { eligible: true, action: 're-review', currentStatus: status };
    }

    // DRAFT, REJECTED, APPROVED can be modified
    return { eligible: true, action: 'allowed', currentStatus: status };
  }
}
