import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { priceLists, priceTiers } from './pricing.schema';
import { eq, and, desc, lte, gte, isNull, or } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Pricing service — price lists, tier management, price resolution.
 *
 * Price resolution: resolvePrice(variantId, listId, qty) → tier-based unit price.
 * Tiers are checked by qty range: min_qty <= qty < max_qty (or unlimited).
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  // ── Price Lists ──────────────────────────────────────────────

  async createPriceList(input: CreatePriceListInput) {
    const id = crypto.randomUUID();
    await this.db.db.insert(priceLists).values({
      id,
      storeId: input.storeId,
      name: input.name,
      currency: input.currency || 'SAR',
      channel: input.channel || 'B2B',
      audience: input.audience || 'PUBLIC',
      segmentId: input.segmentId || null,
      priority: input.priority || 0,
      validFrom: input.validFrom || null,
      validUntil: input.validUntil || null,
    });

    return this.getPriceList(id);
  }

  async getPriceList(id: string) {
    const list = await this.db.db.query.priceLists.findFirst({
      where: eq(priceLists.id, id),
    });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
  }

  async listPriceListsByStore(storeId: string) {
    return this.db.db.query.priceLists.findMany({
      where: eq(priceLists.storeId, storeId),
      orderBy: [desc(priceLists.priority)],
    });
  }

  async updatePriceList(id: string, input: UpdatePriceListInput) {
    await this.getPriceList(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates['name'] = input.name;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;
    if (input.priority !== undefined) updates['priority'] = input.priority;
    if (input.validFrom !== undefined) updates['validFrom'] = input.validFrom;
    if (input.validUntil !== undefined) updates['validUntil'] = input.validUntil;

    await this.db.db.update(priceLists).set(updates).where(eq(priceLists.id, id));

    await this.outbox.publish('pricing.price_list.updated', id, { priceListId: id });
    return this.getPriceList(id);
  }

  // ── Price Tiers ──────────────────────────────────────────────

  async addTier(priceListId: string, input: CreateTierInput) {
    await this.getPriceList(priceListId);
    const id = crypto.randomUUID();

    await this.db.db.insert(priceTiers).values({
      id,
      priceListId,
      variantId: input.variantId,
      minQty: input.minQty || 1,
      maxQty: input.maxQty || null,
      unitPriceMinor: input.unitPriceMinor,
    });

    await this.outbox.publish('pricing.price_list.updated', priceListId, {
      priceListId,
      variantId: input.variantId,
    });

    return this.getTier(id);
  }

  async getTier(id: string) {
    const tier = await this.db.db.query.priceTiers.findFirst({
      where: eq(priceTiers.id, id),
    });
    if (!tier) throw new NotFoundException('Price tier not found');
    return tier;
  }

  async listTiersByPriceList(priceListId: string) {
    return this.db.db.query.priceTiers.findMany({
      where: eq(priceTiers.priceListId, priceListId),
      orderBy: [priceTiers.variantId, priceTiers.minQty],
    });
  }

  async listTiersByVariant(variantId: string, priceListId?: string) {
    if (priceListId) {
      return this.db.db.query.priceTiers.findMany({
        where: and(
          eq(priceTiers.variantId, variantId),
          eq(priceTiers.priceListId, priceListId),
        ),
        orderBy: [priceTiers.minQty],
      });
    }
    return this.db.db.query.priceTiers.findMany({
      where: eq(priceTiers.variantId, variantId),
      orderBy: [priceTiers.priceListId, priceTiers.minQty],
    });
  }

  async updateTier(id: string, input: UpdateTierInput) {
    await this.getTier(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.minQty !== undefined) updates['minQty'] = input.minQty;
    if (input.maxQty !== undefined) updates['maxQty'] = input.maxQty;
    if (input.unitPriceMinor !== undefined) updates['unitPriceMinor'] = input.unitPriceMinor;

    await this.db.db.update(priceTiers).set(updates).where(eq(priceTiers.id, id));
    return this.getTier(id);
  }

  async removeTier(id: string) {
    await this.getTier(id);
    await this.db.db.delete(priceTiers).where(eq(priceTiers.id, id));
    return { success: true };
  }

  // ── Price Resolution ─────────────────────────────────────────

  /**
   * Resolve the unit price for a variant in a price list at a given quantity.
   * Finds the tier where min_qty <= qty AND (max_qty IS NULL OR qty < max_qty).
   */
  async resolvePrice(variantId: string, priceListId: string, qty: number): Promise<{ unitPriceMinor: number; tierId: string }> {
    const tiers = await this.db.db.query.priceTiers.findMany({
      where: and(
        eq(priceTiers.variantId, variantId),
        eq(priceTiers.priceListId, priceListId),
        lte(priceTiers.minQty, qty),
      ),
      orderBy: [desc(priceTiers.minQty)],
      limit: 1,
    });

    const tier = tiers[0];
    if (!tier) throw new BadRequestException('No matching price tier found');

    // Check max_qty constraint
    const maxQty = tier['maxQty'];
    if (maxQty !== null && maxQty !== undefined && qty >= maxQty) {
      throw new BadRequestException('Quantity exceeds maximum tier range');
    }

    return {
      unitPriceMinor: tier['unitPriceMinor'],
      tierId: tier['id'],
    };
  }

  /**
   * Get pricing for a product variant across all active price lists for a store.
   */
  async getProductPricing(variantId: string, storeId: string) {
    const lists = await this.db.db.query.priceLists.findMany({
      where: and(
        eq(priceLists.storeId, storeId),
        eq(priceLists.isActive, true),
      ),
      orderBy: [desc(priceLists.priority)],
    });

    const pricing: Array<{
      priceListId: string;
      name: string;
      channel: string;
      audience: string;
      currency: string;
      tiers: Array<{ minQty: number; maxQty: number | null; unitPriceMinor: number }>;
    }> = [];

    for (const list of lists) {
      const tiers = await this.listTiersByVariant(variantId, list['id']);
      if (tiers.length > 0) {
        pricing.push({
          priceListId: list['id'],
          name: list['name'],
          channel: list['channel'],
          audience: list['audience'],
          currency: list['currency'],
          tiers: tiers.map(t => ({
            minQty: t['minQty'],
            maxQty: t['maxQty'] ?? null,
            unitPriceMinor: t['unitPriceMinor'],
          })),
        });
      }
    }

    return pricing;
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreatePriceListInput {
  storeId: string;
  name: string;
  currency?: string;
  channel?: string;
  audience?: string;
  segmentId?: string;
  priority?: number;
  validFrom?: Date;
  validUntil?: Date;
}

export interface UpdatePriceListInput {
  name?: string;
  isActive?: boolean;
  priority?: number;
  validFrom?: Date;
  validUntil?: Date;
}

export interface CreateTierInput {
  variantId: string;
  minQty?: number;
  maxQty?: number;
  unitPriceMinor: number;
}

export interface UpdateTierInput {
  minQty?: number;
  maxQty?: number;
  unitPriceMinor?: number;
}
