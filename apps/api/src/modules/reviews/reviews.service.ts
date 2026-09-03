import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { reviews, trustSnapshots } from './reviews.schema';
import { orders } from '../orders/orders.schema';
import { eq, and, desc, sql, avg, count } from 'drizzle-orm';
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

    // Check if reviewer is a participant
    if (order['buyerId'] !== input.reviewerId && order['storeId'] !== input.reviewerId) {
      throw new BadRequestException('Only order participants can review');
    }

    // Check for existing review (unique constraint)
    const existing = await this.db.db.query.reviews.findFirst({
      where: and(
        eq(reviews.orderId, input.orderId),
        eq(reviews.reviewerId, input.reviewerId),
        eq(reviews.subjectId, input.subjectId),
        eq(reviews.subjectType, input.subjectType),
      ),
    });
    if (existing) throw new ConflictException('Review already exists for this subject');

    const id = crypto.randomUUID();
    await this.db.db.insert(reviews).values({
      id,
      orderId: input.orderId,
      reviewerId: input.reviewerId,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      rating: input.rating,
      title: input.title || null,
      body: input.body || null,
      dimensions: input.dimensions || {},
    });

    // Recompute trust score for the subject
    await this.recomputeTrust(input.subjectId, input.subjectType);

    // Emit event
    await this.outbox.publish('review.created', id, {
      reviewId: id,
      orderId: input.orderId,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
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

  async getReviewsByOrder(orderId: string) {
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
  subjectType: string;
  rating: number;
  title?: string;
  body?: string;
  dimensions?: Record<string, unknown>;
}
