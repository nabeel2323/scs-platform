import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { reviews, trustSnapshots } from './reviews.schema';
import { orders, orderItems } from '../orders/orders.schema';
import { productVariants } from '../catalog/catalog.schema';
import {
  CallerContext,
  assertStoreInOrg,
  assertStoreMember,
  isTenantPrivileged,
} from '../../common/tenant-scope';
import { eq, and, desc, avg, count, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Reviews service — order-gated reviews with trust score computation.
 *
 * - One review per subject per order (enforced by unique constraint)
 * - Only COMPLETED or DELIVERED orders can be reviewed
 * - Trust score recomputed on each new review
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  async createReview(input: CreateReviewInput) {
    // Verify order exists and is in reviewable state
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, input.orderId),
    });
    if (!order) throw new NotFoundException('Order not found');

    const reviewable = ['DELIVERED', 'COMPLETED'];
    if (!reviewable.includes(order['status'])) {
      throw new BadRequestException('Order must be DELIVERED or COMPLETED to review');
    }

    // Reviews are buyer-authored. A merchant/store ID is not a user identity.
    if (order['buyerId'] !== input.reviewerId) {
      throw new ForbiddenException('Only the buyer who placed the order can review it');
    }

    const subjectType = input.subjectType.trim().toUpperCase();
    if (subjectType === 'STORE') {
      if (order['storeId'] !== input.subjectId) {
        throw new BadRequestException('A store review must target the store on the order');
      }
    } else if (subjectType === 'PRODUCT') {
      const purchasedItems = await this.db.db.query.orderItems.findMany({
        where: eq(orderItems.orderId, input.orderId),
        columns: { variantId: true },
      });
      const purchasedVariantIds = purchasedItems.map((item) => item.variantId);
      if (purchasedVariantIds.length === 0) {
        throw new BadRequestException('The order contains no reviewable product lines');
      }
      const purchasedProduct = await this.db.db.query.productVariants.findFirst({
        where: and(
          inArray(productVariants.id, purchasedVariantIds),
          eq(productVariants.productId, input.subjectId),
        ),
        columns: { id: true },
      });
      if (!purchasedProduct) {
        throw new BadRequestException(
          'A product review must target a product included in the order',
        );
      }
    } else {
      throw new BadRequestException('subjectType must be STORE or PRODUCT');
    }

    // Check for existing review (unique constraint)
    const existing = await this.db.db.query.reviews.findFirst({
      where: and(
        eq(reviews.orderId, input.orderId),
        eq(reviews.reviewerId, input.reviewerId),
        eq(reviews.subjectId, input.subjectId),
        eq(reviews.subjectType, subjectType),
      ),
    });
    if (existing) throw new ConflictException('Review already exists for this subject');

    const id = crypto.randomUUID();
    await this.db.db.insert(reviews).values({
      id,
      orderId: input.orderId,
      reviewerId: input.reviewerId,
      subjectId: input.subjectId,
      subjectType,
      rating: input.rating,
      title: input.title || null,
      body: input.body || null,
      dimensions: input.dimensions || {},
    });

    // Recompute trust score for the subject
    await this.recomputeTrust(input.subjectId, subjectType);

    // Emit event
    await this.outbox.publish('review.created', id, {
      reviewId: id,
      orderId: input.orderId,
      subjectId: input.subjectId,
      subjectType,
      rating: input.rating,
    });

    return this.getReview(id);
  }

  async getReview(id: string) {
    const review = await this.db.db.query.reviews.findFirst({
      where: eq(reviews.id, id),
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async getReviewsBySubject(subjectId: string, subjectType: string) {
    return this.db.db.query.reviews.findMany({
      where: and(eq(reviews.subjectId, subjectId), eq(reviews.subjectType, subjectType)),
      orderBy: [desc(reviews.createdAt)],
    });
  }

  async getReviewsByOrder(orderId: string, caller: CallerContext) {
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { buyerId: true, storeId: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!isTenantPrivileged(caller) && order.buyerId !== caller.sub) {
      await assertStoreInOrg(this.db, caller, order.storeId);
      await assertStoreMember(this.db, caller, order.storeId);
    }

    return this.db.db.query.reviews.findMany({
      where: eq(reviews.orderId, orderId),
      orderBy: [desc(reviews.createdAt)],
    });
  }

  async getTrustSnapshot(entityId: string, entityType: string) {
    return this.db.db.query.trustSnapshots.findFirst({
      where: and(eq(trustSnapshots.entityId, entityId), eq(trustSnapshots.entityType, entityType)),
    });
  }

  // ── Trust Score Computation ──────────────────────────────────

  async recomputeTrust(entityId: string, entityType: string) {
    const result = await this.db.db
      .select({
        avgRating: avg(reviews.rating),
        totalReviews: count(reviews.id),
      })
      .from(reviews)
      .where(and(eq(reviews.subjectId, entityId), eq(reviews.subjectType, entityType)));

    const avgRating = result[0]?.avgRating || 0;
    const totalReviews = result[0]?.totalReviews || 0;

    // Compute trust score (0-100)
    // Formula: avgRating/5 * 60 + min(totalReviews/10, 1) * 20 + verifiedBadge * 20
    const ratingScore = (Number(avgRating) / 5) * 60;
    const volumeScore = Math.min(totalReviews / 10, 1) * 20;
    const badges: string[] = [];

    if (totalReviews >= 5 && Number(avgRating) >= 4) badges.push('VERIFIED');
    if (totalReviews >= 20 && Number(avgRating) >= 4.5) badges.push('TRUSTED');
    if (totalReviews >= 50) badges.push('TOP_RATED');

    const score = Math.round(ratingScore + volumeScore + (badges.length > 0 ? 20 : 0));

    // Upsert trust snapshot
    const existing = await this.db.db.query.trustSnapshots.findFirst({
      where: and(eq(trustSnapshots.entityId, entityId), eq(trustSnapshots.entityType, entityType)),
    });

    if (existing) {
      await this.db.db
        .update(trustSnapshots)
        .set({
          avgRating: String(avgRating),
          totalReviews,
          score: String(score),
          badges,
          computedAt: new Date(),
        })
        .where(eq(trustSnapshots.id, existing['id']));
    } else {
      await this.db.db.insert(trustSnapshots).values({
        id: crypto.randomUUID(),
        entityId,
        entityType,
        avgRating: String(avgRating),
        totalReviews,
        score: String(score),
        badges,
      });
    }

    return { entityId, entityType, avgRating, totalReviews, score, badges };
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreateReviewInput {
  orderId: string;
  reviewerId: string;
  subjectId: string;
  subjectType: 'STORE' | 'PRODUCT';
  rating: number;
  title?: string;
  body?: string;
  dimensions?: Record<string, unknown>;
}
