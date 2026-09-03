import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { promotions, promotionRedemptions } from './promotions.schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Promotions service — create, validate, redeem promotions.
 *
 * Types: PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED
 * Scope: STORE, CATEGORY, PRODUCT, VARIANT
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly db: DatabaseService) {}

  async createPromotion(input: CreatePromotionInput) {
    const id = crypto.randomUUID();
    await this.db.db.insert(promotions).values({
      id,
      storeId: input.storeId,
      code: input.code?.toUpperCase() || null,
      name: input.name,
      description: input.description || null,
      promoType: input.promoType,
      scope: input.scope || 'STORE',
      scopeId: input.scopeId || null,
      discountValue: input.discountValue,
      minOrderMinor: input.minOrderMinor || 0,
      maxDiscountMinor: input.maxDiscountMinor || null,
      maxRedemptions: input.maxRedemptions || null,
      perUserLimit: input.perUserLimit || 1,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });

    return this.getPromotion(id);
  }

  async getPromotion(id: string) {
    const promo = await this.db.db.query.promotions.findFirst({
      where: eq(promotions.id, id),
    });
    if (!promo) throw new NotFoundException('Promotion not found');
    return promo;
  }

  async listByStore(storeId: string) {
    return this.db.db.query.promotions.findMany({
      where: eq(promotions.storeId, storeId),
      orderBy: [desc(promotions.createdAt)],
    });
  }

  async listActive(storeId: string) {
    const now = new Date();
    const results = await this.db.db.query.promotions.findMany({
      where: and(
        eq(promotions.storeId, storeId),
        eq(promotions.isActive, true),
      ),
    });

    // Filter by date range in-memory (Drizzle doesn't support complex date comparisons easily)
    return results.filter(p =>
      new Date(p['startsAt']) <= now && new Date(p['endsAt']) >= now
    );
  }

  async findByCode(storeId: string, code: string) {
    const promo = await this.db.db.query.promotions.findFirst({
      where: and(
        eq(promotions.storeId, storeId),
        eq(promotions.code, code.toUpperCase()),
        eq(promotions.isActive, true),
      ),
    });
    if (!promo) throw new NotFoundException('Promo code not found or expired');

    const now = new Date();
    if (new Date(promo['startsAt']) > now || new Date(promo['endsAt']) < now) {
      throw new BadRequestException('Promo code is not currently active');
    }

    return promo;
  }

  async updatePromotion(id: string, input: UpdatePromotionInput) {
    await this.getPromotion(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates['name'] = input.name;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;
    if (input.startsAt !== undefined) updates['startsAt'] = input.startsAt;
    if (input.endsAt !== undefined) updates['endsAt'] = input.endsAt;
    if (input.maxRedemptions !== undefined) updates['maxRedemptions'] = input.maxRedemptions;

    await this.db.db.update(promotions).set(updates).where(eq(promotions.id, id));
    return this.getPromotion(id);
  }

  /**
   * Calculate discount for a given cart total and promotion.
   */
  calculateDiscount(promo: any, cartTotalMinor: number): number {
    if (cartTotalMinor < (promo['minOrderMinor'] || 0)) return 0;

    let discount = 0;
    switch (promo['promoType']) {
      case 'PERCENT':
        discount = Math.round(cartTotalMinor * promo['discountValue'] / 100);
        break;
      case 'FIXED':
        discount = promo['discountValue'];
        break;
      case 'QTY_DISCOUNT':
        discount = promo['discountValue'];
        break;
      case 'TIME_LIMITED':
        discount = Math.round(cartTotalMinor * promo['discountValue'] / 100);
        break;
      default:
        discount = 0;
    }

    // Apply max discount cap
    if (promo['maxDiscountMinor'] && discount > promo['maxDiscountMinor']) {
      discount = promo['maxDiscountMinor'];
    }

    return Math.min(discount, cartTotalMinor); // can't exceed cart total
  }

  async redeemPromotion(promoId: string, userId: string, orderId: string | null, discountMinor: number) {
    const promo = await this.getPromotion(promoId);

    // Check max redemptions
    if (promo['maxRedemptions'] && promo['redemptionCount'] >= promo['maxRedemptions']) {
      throw new BadRequestException('Promotion has reached maximum redemptions');
    }

    // Check per-user limit
    const userRedemptions = await this.db.db.query.promotionRedemptions.findMany({
      where: and(
        eq(promotionRedemptions.promotionId, promoId),
        eq(promotionRedemptions.userId, userId),
      ),
    });

    if (promo['perUserLimit'] && userRedemptions.length >= promo['perUserLimit']) {
      throw new BadRequestException('You have already used this promotion the maximum number of times');
    }

    // Record redemption
    const redemptionId = crypto.randomUUID();
    await this.db.db.insert(promotionRedemptions).values({
      id: redemptionId,
      promotionId: promoId,
      userId,
      orderId: orderId || null,
      codeUsed: promo['code'],
      discountMinor,
    });

    // Increment redemption count
    await this.db.db
      .update(promotions)
      .set({ redemptionCount: promo['redemptionCount'] + 1, updatedAt: new Date() })
      .where(eq(promotions.id, promoId));

    return { redemptionId, discountMinor };
  }

  /**
   * List nearby active offers.
   * Note: PostGIS distance query requires PostGIS extension.
   * Fallback: returns all active promotions, limited.
   */
  async listNearbyOffers(params: { lat?: number; lng?: number; radiusKm?: number; limit?: number }) {
    const now = new Date();
    const results = await this.db.db.query.promotions.findMany({
      where: eq(promotions.isActive, true),
      orderBy: [desc(promotions.createdAt)],
    });

    // Filter by date range
    const active = results.filter(p =>
      new Date(p['startsAt']) <= now && new Date(p['endsAt']) >= now
    );

    // TODO: When PostGIS is available, filter by distance using lat/lng/radiusKm
    // For now, return all active promotions up to limit
    return active.slice(0, params.limit || 20);
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreatePromotionInput {
  storeId: string;
  code?: string;
  name: string;
  description?: string;
  promoType: string;
  scope?: string;
  scopeId?: string;
  discountValue: number;
  minOrderMinor?: number;
  maxDiscountMinor?: number;
  maxRedemptions?: number;
  perUserLimit?: number;
  startsAt: Date;
  endsAt: Date;
}

export interface UpdatePromotionInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  startsAt?: Date;
  endsAt?: Date;
  maxRedemptions?: number;
}
