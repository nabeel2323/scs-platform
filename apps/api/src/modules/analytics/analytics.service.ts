import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { analyticsEvents } from '../audit/audit.schema';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Analytics service — event tracking, taxonomy, and domain event → analytics writer.
 *
 * Event taxonomy (Phase 1):
 * - search_performed: query, result_count, category
 * - product_viewed: product_id, store_id
 * - cart_item_added: variant_id, store_id, quantity
 * - cart_item_removed: variant_id, store_id
 * - checkout_started: cart_id, item_count, total_minor
 * - order_submitted: master_order_id, sub_order_count, total_minor
 * - order_accepted: order_id, store_id
 * - order_rejected: order_id, store_id, reason
 * - order_delivered: order_id, store_id
 * - review_created: order_id, rating, subject_type
 * - dispute_opened: order_id, dispute_id
 * - merchant_onboarded: org_id, store_id
 * - merchant_verified: store_id
 * - page_viewed: path, referrer
 * - filter_applied: filter_type, filter_value
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  // ── Client SDK track() ──────────────────────────────────────

  async track(input: TrackInput) {
    const id = crypto.randomUUID();
    await this.db.db.insert(analyticsEvents).values({
      id,
      eventType: input.eventType,
      userId: input.userId || null,
      orgId: input.orgId || null,
      sessionId: input.sessionId || null,
      properties: input.properties || {},
      device: input.device || null,
    });
    return { id, eventType: input.eventType, createdAt: new Date().toISOString() };
  }

  // ── Batch track (for client SDK) ────────────────────────────

  async trackBatch(events: TrackInput[]) {
    const rows = events.map((e) => ({
      id: crypto.randomUUID(),
      eventType: e.eventType,
      userId: e.userId || null,
      orgId: e.orgId || null,
      sessionId: e.sessionId || null,
      properties: e.properties || {},
      device: e.device || null,
    }));

    if (rows.length > 0) {
      await this.db.db.insert(analyticsEvents).values(rows);
    }

    return { count: rows.length };
  }

  // ── Domain Event Writers ────────────────────────────────────

  async writeOrderSubmitted(payload: { masterOrderId: string; buyerId: string; subOrderCount: number; totalMinor: number }) {
    return this.track({
      eventType: 'order_submitted',
      userId: payload.buyerId,
      properties: {
        master_order_id: payload.masterOrderId,
        sub_order_count: payload.subOrderCount,
        total_minor: payload.totalMinor,
      },
    });
  }

  async writeOrderAccepted(payload: { orderId: string; buyerId: string; storeId: string }) {
    return this.track({
      eventType: 'order_accepted',
      userId: payload.buyerId,
      properties: { order_id: payload.orderId, store_id: payload.storeId },
    });
  }

  async writeOrderRejected(payload: { orderId: string; buyerId: string; storeId: string; reason?: string }) {
    return this.track({
      eventType: 'order_rejected',
      userId: payload.buyerId,
      properties: { order_id: payload.orderId, store_id: payload.storeId, reason: payload.reason },
    });
  }

  async writeSearchPerformed(payload: { userId?: string; query: string; resultCount: number; category?: string }) {
    return this.track({
      eventType: 'search_performed',
      userId: payload.userId,
      properties: { query: payload.query, result_count: payload.resultCount, category: payload.category },
    });
  }

  async writeProductViewed(payload: { userId?: string; productId: string; storeId: string }) {
    return this.track({
      eventType: 'product_viewed',
      userId: payload.userId,
      properties: { product_id: payload.productId, store_id: payload.storeId },
    });
  }

  async writeCartItemAdded(payload: { userId?: string; variantId: string; storeId: string; quantity: number }) {
    return this.track({
      eventType: 'cart_item_added',
      userId: payload.userId,
      properties: { variant_id: payload.variantId, store_id: payload.storeId, quantity: payload.quantity },
    });
  }

  async writeCheckoutStarted(payload: { userId?: string; cartId: string; itemCount: number; totalMinor: number }) {
    return this.track({
      eventType: 'checkout_started',
      userId: payload.userId,
      properties: { cart_id: payload.cartId, item_count: payload.itemCount, total_minor: payload.totalMinor },
    });
  }

  async writeMerchantOnboarded(payload: { orgId: string; storeId: string }) {
    return this.track({
      eventType: 'merchant_onboarded',
      orgId: payload.orgId,
      properties: { store_id: payload.storeId },
    });
  }

  async writeMerchantVerified(payload: { storeId: string; orgId: string }) {
    return this.track({
      eventType: 'merchant_verified',
      orgId: payload.orgId,
      properties: { store_id: payload.storeId },
    });
  }

  async writeReviewCreated(payload: { userId: string; orderId: string; rating: number; subjectType: string }) {
    return this.track({
      eventType: 'review_created',
      userId: payload.userId,
      properties: { order_id: payload.orderId, rating: payload.rating, subject_type: payload.subjectType },
    });
  }

  async writeDisputeOpened(payload: { userId: string; orderId: string; disputeId: string }) {
    return this.track({
      eventType: 'dispute_opened',
      userId: payload.userId,
      properties: { order_id: payload.orderId, dispute_id: payload.disputeId },
    });
  }

  // ── Query Helpers ────────────────────────────────────────────

  async getEventCounts(from: string, to: string) {
    const dateFrom = new Date(from);
    const dateTo = new Date(to);

    return this.db.db.select({
      eventType: analyticsEvents.eventType,
      count: sql<number>`count(*)`,
    }).from(analyticsEvents)
      .where(and(
        gte(analyticsEvents.createdAt, dateFrom),
        lte(analyticsEvents.createdAt, dateTo),
      ))
      .groupBy(analyticsEvents.eventType);
  }

  async getUserActivity(userId: string, limit = 50) {
    return this.db.db.select().from(analyticsEvents)
      .where(eq(analyticsEvents.userId, userId))
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit);
  }
}

// ── Types ────────────────────────────────────────────────────────

export interface TrackInput {
  eventType: string;
  userId?: string;
  orgId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
  device?: string;
}
