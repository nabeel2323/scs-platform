import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../audit/index';
import { merchantOffers, type OfferStatus } from './catalog.offer.schema';
import { products, productVariants } from './catalog.schema';
import { stores, warehouses } from '../merchant/merchant.schema';
import { priceLists } from '../pricing/pricing.schema';
import { orderItems } from '../orders/orders.schema';
import { eq, and, isNull, asc, desc, inArray, sql, count, gte, lt } from 'drizzle-orm';
import crypto from 'node:crypto';

const OFFER_STATUSES: ReadonlySet<OfferStatus> = new Set<OfferStatus>([
  'DRAFT', 'PROPOSED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'WITHDRAWN',
]);

/** Allowed status moves (§ offer lifecycle). Anything else is rejected. */
const TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  DRAFT: ['PROPOSED', 'WITHDRAWN'],
  PROPOSED: ['ACTIVE', 'REJECTED', 'WITHDRAWN'],
  ACTIVE: ['SUSPENDED', 'WITHDRAWN'],
  SUSPENDED: ['ACTIVE', 'WITHDRAWN'],
  REJECTED: ['PROPOSED', 'WITHDRAWN'],
  WITHDRAWN: [],
};

export interface CreateOfferInput {
  storeId: string;
  productId: string;
  variantId?: string | null;
  status?: 'DRAFT' | 'PROPOSED';
  currency?: string;
  basePriceMinor?: number | null;
  compareAtPriceMinor?: number | null;
  moq?: number;
  orderIncrement?: number | null;
  leadTimeDays?: number | null;
  isAvailable?: boolean;
  priceListId?: string | null;
  warehouseId?: string | null;
  externalRef?: string | null;
  proposedBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateOfferPricingInput {
  currency?: string;
  basePriceMinor?: number | null;
  compareAtPriceMinor?: number | null;
  moq?: number;
  orderIncrement?: number | null;
  leadTimeDays?: number | null;
  isAvailable?: boolean;
  priceListId?: string | null;
  warehouseId?: string | null;
}

/**
 * CatalogOfferService — merchant offers on canonical products (PHASE 4).
 *
 * Backend authoritative (§16, Rule 10): every write validates referential
 * integrity the schema can't express as a constraint — the variant belongs to
 * the product, the price list / warehouse belong to the SAME store as the offer,
 * a store holds at most one offer per (product-default | variant), and status
 * changes follow the governed lifecycle. This service only manages offer rows;
 * it does NOT yet touch the live cart/checkout/price resolver (that re-wiring is
 * the separate, approval-gated Phase 4b), so current purchase behaviour is
 * unchanged.
 */
@Injectable()
export class CatalogOfferService {
  constructor(
      private readonly db: DatabaseService,
      private readonly audit: AuditService,
    ) {}

  private async getOrThrow(id: string) {
    const offer = await this.db.db.query.merchantOffers.findFirst({
      where: eq(merchantOffers.id, id),
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  private assertTransition(from: string, to: OfferStatus) {
    if (!OFFER_STATUSES.has(from as OfferStatus) || !TRANSITIONS[from as OfferStatus].includes(to)) {
      throw new BadRequestException(`Illegal offer transition: ${from} → ${to}`);
    }
  }

  async createOffer(input: CreateOfferInput) {
    if (!input.storeId?.trim()) throw new BadRequestException('Offer requires a store');
    if (!input.productId?.trim()) throw new BadRequestException('Offer requires a product');
    const status = input.status ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PROPOSED') {
      throw new BadRequestException('A new offer may only start as DRAFT or PROPOSED');
    }
    const moq = input.moq ?? 1;
    if (moq < 1) throw new BadRequestException('MOQ must be at least 1');
    if (input.orderIncrement != null && input.orderIncrement < 1) {
      throw new BadRequestException('Order increment must be at least 1');
    }
    if (input.basePriceMinor != null && input.basePriceMinor < 0) {
      throw new BadRequestException('Base price cannot be negative');
    }

    const product = await this.db.db.query.products.findFirst({
      where: eq(products.id, input.productId),
    });
    if (!product) throw new NotFoundException('Product not found');

    if (input.variantId) {
      const variant = await this.db.db.query.productVariants.findFirst({
        where: and(
          eq(productVariants.id, input.variantId),
          eq(productVariants.productId, input.productId),
        ),
      });
      if (!variant) throw new BadRequestException('Variant does not belong to this product');
    }

    // Enforce one offer per (store, variant) or (store, product-default).
    const dupCond = input.variantId
      ? and(eq(merchantOffers.storeId, input.storeId), eq(merchantOffers.variantId, input.variantId))
      : and(
          eq(merchantOffers.storeId, input.storeId),
          eq(merchantOffers.productId, input.productId),
          isNull(merchantOffers.variantId),
        );
    const dup = await this.db.db.query.merchantOffers.findFirst({ where: dupCond });
    if (dup) {
      throw new ConflictException('This store already has an offer for the product/variant');
    }

    const id = crypto.randomUUID();
    await this.db.db.insert(merchantOffers).values({
      id,
      storeId: input.storeId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      status,
      currency: input.currency ?? 'SAR',
      basePriceMinor: input.basePriceMinor ?? null,
      compareAtPriceMinor: input.compareAtPriceMinor ?? null,
      moq,
      orderIncrement: input.orderIncrement ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      isAvailable: input.isAvailable ?? true,
      priceListId: input.priceListId ?? null,
      warehouseId: input.warehouseId ?? null,
      externalRef: input.externalRef ?? null,
      proposedBy: status === 'PROPOSED' ? input.proposedBy ?? null : null,
      metadata: input.metadata ?? {},
    });

    // PHASE 9: Audit — offer created
    await this.audit.record({
      actorType: 'MERCHANT',
      actorId: input.proposedBy ?? null,
      action: 'offer.created',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { storeId: input.storeId, productId: input.productId, status },
    });

    return this.getOffer(id);
  }

  async getOffer(id: string) {
    const offer = await this.getOrThrow(id);
    return offer;
  }

  async listOffersForProduct(productId: string, opts?: { status?: OfferStatus }) {
    const conditions = [eq(merchantOffers.productId, productId)];
    if (opts?.status) conditions.push(eq(merchantOffers.status, opts.status));
    return this.db.db.query.merchantOffers.findMany({
      where: and(...conditions),
      orderBy: [asc(merchantOffers.createdAt)],
    });
  }

  /**
   * PHASE 22: Buyer-facing "most popular seller" ranking for one canonical
   * product. Same aggregation primitive as the Phase 16 analytics (join
   * `order_items.offer_id` -> SUM(quantity) -> COUNT DISTINCT order_id), but
   * scoped to a single product and returned pre-sorted so the PDP "Other
   * Sellers" section can badge the top-ranked offer without another round-trip.
   *
   * Behaviour:
   * - Only ACTIVE offers are considered (a suspended/withdrawn offer cannot be
   *   bought, so ranking it would mislead the buyer).
   * - Ties on `unitsSold` are broken by `ordersCount`, then by lowest current
   *   price, then by earliest activation so the ordering is deterministic.
   * - Store display name is joined so the UI never needs a second lookup.
   * - Offers with zero sales still appear (rank assigned by the same sort),
   *   so the seller set matches what the buyer sees on the canonical PDP.
   */
  async listOffersForProductRanked(productId: string) {
    const offers = await this.db.db.query.merchantOffers.findMany({
      where: and(
        eq(merchantOffers.productId, productId),
        eq(merchantOffers.status, 'ACTIVE'),
      ),
      columns: {
        id: true, storeId: true, productId: true, variantId: true,
        currency: true, basePriceMinor: true, moq: true, leadTimeDays: true,
        priceListId: true, activatedAt: true,
      },
    });
    if (offers.length === 0) return [];

    const offerIds = offers.map(o => o.id);
    const aggregates = await this.db.db
      .select({
        offerId: orderItems.offerId,
        ordersCount: count(sql`DISTINCT ${orderItems.orderId}`),
        unitsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
      })
      .from(orderItems)
      .where(and(inArray(orderItems.offerId, offerIds)))
      .groupBy(orderItems.offerId);
    const byOffer = new Map(
      aggregates.map(a => [
        a.offerId as string,
        {
          ordersCount: Number(a.ordersCount ?? 0),
          unitsSold: Number(a.unitsSold ?? 0),
        },
      ]),
    );

    const storeIds = Array.from(new Set(offers.map(o => o.storeId)));
    const storeRows = await this.db.db.query.stores.findMany({
      where: inArray(stores.id, storeIds),
      // PHASE 23: `hidePopularityBadge` is fetched here (not filtered out) so a
      // store's opt-out only affects the *buyer projection* — the sort key
      // stays on true counts, then we null out disclosure fields per row.
      columns: { id: true, displayName: true, slug: true, currency: true, verificationStatus: true, hidePopularityBadge: true },
    });
    const storeById = new Map(storeRows.map(s => [s.id, s]));

    const enriched = offers.map(o => {
      const agg = byOffer.get(o.id) ?? { ordersCount: 0, unitsSold: 0 };
      const s = storeById.get(o.storeId);
      return {
        offerId: o.id,
        storeId: o.storeId,
        storeName: s?.displayName ?? null,
        storeSlug: s?.slug ?? null,
        storeVerified: s?.verificationStatus === 'VERIFIED',
        variantId: o.variantId,
        currency: o.currency,
        basePriceMinor: o.basePriceMinor,
        moq: o.moq,
        leadTimeDays: o.leadTimeDays,
        priceListId: o.priceListId,
        activatedAt: o.activatedAt,
        ordersCount: agg.ordersCount,
        unitsSold: agg.unitsSold,
      };
    });

    enriched.sort((a, b) => {
      if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
      if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
      const ap = a.basePriceMinor ?? Number.POSITIVE_INFINITY;
      const bp = b.basePriceMinor ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      const at = a.activatedAt ? new Date(a.activatedAt).getTime() : 0;
      const bt = b.activatedAt ? new Date(b.activatedAt).getTime() : 0;
      return at - bt;
    });

    // PHASE 23: if the true #1 store has opted out of disclosure, no other
    // seller can legitimately claim the "Most Popular" crown for this product
    // — so we suppress it globally rather than promoting #2 to a misleading
    // top-of-list badge. Non-hidden stores still see their real rank/counts.
    const topStoreHidden = storeById.get(enriched[0]!.storeId)?.hidePopularityBadge === true;
    return enriched.map((row, i) => {
      const hidden = storeById.get(row.storeId)?.hidePopularityBadge === true;
      if (hidden) {
        return {
          offerId: row.offerId,
          storeId: row.storeId,
          storeName: row.storeName,
          storeSlug: row.storeSlug,
          storeVerified: row.storeVerified,
          variantId: row.variantId,
          currency: row.currency,
          basePriceMinor: row.basePriceMinor,
          moq: row.moq,
          leadTimeDays: row.leadTimeDays,
          priceListId: row.priceListId,
          ordersCount: 0,
          unitsSold: 0,
          rank: null as number | null,
          isMostPopular: false,
          disclosureHidden: true,
        };
      }
      return {
        offerId: row.offerId,
        storeId: row.storeId,
        storeName: row.storeName,
        storeSlug: row.storeSlug,
        storeVerified: row.storeVerified,
        variantId: row.variantId,
        currency: row.currency,
        basePriceMinor: row.basePriceMinor,
        moq: row.moq,
        leadTimeDays: row.leadTimeDays,
        priceListId: row.priceListId,
        ordersCount: row.ordersCount,
        unitsSold: row.unitsSold,
        rank: i + 1,
        isMostPopular: !topStoreHidden && i === 0 && row.unitsSold > 0,
        disclosureHidden: false,
      };
    });
  }

  async listOffersForStore(storeId: string) {
    return this.db.db.query.merchantOffers.findMany({
      where: eq(merchantOffers.storeId, storeId),
      orderBy: [asc(merchantOffers.createdAt)],
    });
  }

  /**
   * PHASE 16: Aggregate per-offer sales performance for a store.
   *
   * Reads `order_items.offer_id` (Phase 10) and joins the offer's live row to
   * keep the label fresh; the money figure is derived from the immutable
   * `offer_snapshot` written at checkout (Phase 15) so a later currency change
   * cannot silently rewrite past revenue.
   *
   * Zero-sale offers are included with `ordersCount: 0` so a seller sees which
   * listings aren't converting, not just which ones are.
   */
  async listOfferAnalytics(storeId: string) {
    // 1) Load every offer for the store.
    const offers = await this.db.db.query.merchantOffers.findMany({
      where: eq(merchantOffers.storeId, storeId),
      columns: {
        id: true, storeId: true, productId: true, variantId: true,
        status: true, currency: true, basePriceMinor: true,
        moq: true, leadTimeDays: true, createdAt: true,
      },
      orderBy: [desc(merchantOffers.createdAt)],
    });
    if (offers.length === 0) return [];

    const offerIds = offers.map(o => o.id);

    // 2) Aggregate line-level sales per offer. `lineTotalMinor` is the
    //    authoritative charged amount (the cart snapshot); SUM over the group
    //    gives per-offer revenue. Units = SUM(quantity).
    const aggregates = await this.db.db
      .select({
        offerId: orderItems.offerId,
        ordersCount: count(sql`DISTINCT ${orderItems.orderId}`),
        unitsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
        revenueMinor: sql<string>`COALESCE(SUM(${orderItems.lineTotalMinor}), 0)::text`,
      })
      .from(orderItems)
      .where(and(inArray(orderItems.offerId, offerIds)))
      .groupBy(orderItems.offerId);

    const byOffer = new Map(
      aggregates.map(a => [
        a.offerId as string,
        {
          ordersCount: Number(a.ordersCount ?? 0),
          unitsSold: Number(a.unitsSold ?? 0),
          revenueMinor: Number(a.revenueMinor ?? 0),
        },
      ]),
    );

    // 3) Merge zero-sale offers into the response and attach labels from the
    //    canonical variant/product where available.
    const variantIds = Array.from(
      new Set(offers.map(o => o.variantId).filter(Boolean) as string[]),
    );
    const productIds = Array.from(new Set(offers.map(o => o.productId)));
    const [variantRows, productRows] = await Promise.all([
      variantIds.length
        ? this.db.db.query.productVariants.findMany({
            where: inArray(productVariants.id, variantIds),
            columns: { id: true, sku: true, title: true },
          })
        : Promise.resolve([]),
      this.db.db.query.products.findMany({
        where: inArray(products.id, productIds),
        columns: { id: true, title: true },
      }),
    ]);
    const variantById = new Map(variantRows.map(v => [v.id, v]));
    const productById = new Map(productRows.map(p => [p.id, p]));

    return offers.map(o => {
      const agg = byOffer.get(o.id) ?? { ordersCount: 0, unitsSold: 0, revenueMinor: 0 };
      const v = o.variantId ? variantById.get(o.variantId) : undefined;
      const p = productById.get(o.productId);
      return {
        offerId: o.id,
        storeId: o.storeId,
        productId: o.productId,
        variantId: o.variantId,
        status: o.status,
        currency: o.currency,
        basePriceMinor: o.basePriceMinor,
        moq: o.moq,
        leadTimeDays: o.leadTimeDays,
        createdAt: o.createdAt,
        productTitle: p?.title ?? null,
        variantSku: v?.sku ?? null,
        variantTitle: v?.title ?? null,
        ordersCount: agg.ordersCount,
        unitsSold: agg.unitsSold,
        revenueMinor: agg.revenueMinor,
      };
    });
  }

  /**
   * PHASE 18: Time-series trend of sales per offer (or across a store).
   *
   * Buckets `order_items.created_at` by `day` or `week` (Postgres `date_trunc`)
   * and aggregates orders/units/revenue per bucket. When `offerId` is supplied
   * the caller sees a single-offer trend; when only `storeId` is supplied the
   * result is the store-wide aggregate. The bucket field is a UTC `YYYY-MM-DD`
   * string for daily rows and the ISO date of the week's Monday for weekly
   * rows — chosen for stable client-side sorting and no timezone drift.
   *
   * Additive & non-breaking: this does not touch `listOfferAnalytics` (Phase
   * 16) or `getOfferRevenueKpis` (Phase 17 admin KPIs) so existing consumers
   * keep the same shape.
   */
  async listOfferTrend(opts: {
    storeId: string;
    offerId?: string;
    granularity?: 'day' | 'week';
    from?: Date;
    to?: Date;
  }): Promise<Array<{
    bucket: string;
    ordersCount: number;
    unitsSold: number;
    revenueMinor: number;
  }>> {
    if (!opts.storeId) return [];
    // Whitelist granularity before interpolation — Postgres date_trunc accepts
    // text but we build the SQL string via sql.raw so validate strictly.
    const gran: 'day' | 'week' = opts.granularity === 'week' ? 'week' : 'day';

    // 1) Resolve which offer IDs the caller is authorised to see.
    const offerWhere = opts.offerId
      ? and(eq(merchantOffers.storeId, opts.storeId), eq(merchantOffers.id, opts.offerId))
      : eq(merchantOffers.storeId, opts.storeId);
    const offers = await this.db.db.query.merchantOffers.findMany({
      where: offerWhere,
      columns: { id: true },
    });
    if (offers.length === 0) return [];
    const offerIds = offers.map(o => o.id);

    // 2) Build the WHERE clause; date range is optional.
    const whereParts = [inArray(orderItems.offerId, offerIds)];
    if (opts.from) whereParts.push(gte(orderItems.createdAt, opts.from));
    if (opts.to) whereParts.push(lt(orderItems.createdAt, opts.to));

    // 3) Bucket + aggregate. `date_trunc` receives a text parameter (whitelisted
    //    above) and the item's timestamptz; the result is formatted as a plain
    //    ISO date string so clients sort and render deterministically.
    const bucketExpr = sql<string>`to_char(date_trunc(${sql.raw(`'${gran}'`)}, ${orderItems.createdAt}), 'YYYY-MM-DD')`;
    const groups = await this.db.db
      .select({
        bucket: bucketExpr,
        ordersCount: count(sql`DISTINCT ${orderItems.orderId}`),
        unitsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
        revenueMinor: sql<string>`COALESCE(SUM(${orderItems.lineTotalMinor}), 0)::text`,
      })
      .from(orderItems)
      .where(and(...whereParts))
      .groupBy(bucketExpr)
      .orderBy(asc(bucketExpr));

    return groups.map(g => ({
      bucket: g.bucket,
      ordersCount: Number(g.ordersCount ?? 0),
      unitsSold: Number(g.unitsSold ?? 0),
      revenueMinor: Number(g.revenueMinor ?? 0),
    }));
  }

  // ── Lifecycle transitions ────────────────────────────────────

  async proposeOffer(id: string, proposedBy?: string | null) {
    const offer = await this.getOrThrow(id);
    this.assertTransition(offer.status, 'PROPOSED');
    await this.db.db
      .update(merchantOffers)
      .set({
        status: 'PROPOSED',
        proposedBy: proposedBy ?? offer.proposedBy,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'MERCHANT',
      actorId: proposedBy ?? null,
      action: 'offer.proposed',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { fromStatus: offer.status, toStatus: 'PROPOSED' },
    });

    return this.getOffer(id);
  }

  async approveOffer(id: string, reviewerId: string) {
    const offer = await this.getOrThrow(id);
    this.assertTransition(offer.status, 'ACTIVE');
    const now = new Date();
    await this.db.db
      .update(merchantOffers)
      .set({
        status: 'ACTIVE',
        reviewedBy: reviewerId,
        reviewedAt: now,
        activatedAt: now,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'ADMIN',
      actorId: reviewerId,
      action: 'offer.approved',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { fromStatus: offer.status, toStatus: 'ACTIVE', storeId: offer.storeId },
    });

    return this.getOffer(id);
  }

  async rejectOffer(id: string, reviewerId: string, reason: string) {
    const offer = await this.getOrThrow(id);
    this.assertTransition(offer.status, 'REJECTED');
    if (!reason?.trim()) throw new BadRequestException('A rejection requires a reason');
    const now = new Date();
    await this.db.db
      .update(merchantOffers)
      .set({
        status: 'REJECTED',
        reviewedBy: reviewerId,
        reviewedAt: now,
        rejectionReason: reason,
        updatedAt: now,
      })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'ADMIN',
      actorId: reviewerId,
      action: 'offer.rejected',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { fromStatus: offer.status, toStatus: 'REJECTED', reason },
    });

    return this.getOffer(id);
  }

  async suspendOffer(id: string) {
    const offer = await this.getOrThrow(id);
    this.assertTransition(offer.status, 'SUSPENDED');
    await this.db.db
      .update(merchantOffers)
      .set({ status: 'SUSPENDED', isAvailable: false, updatedAt: new Date() })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'ADMIN',
      action: 'offer.suspended',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { fromStatus: offer.status, toStatus: 'SUSPENDED' },
    });

    return this.getOffer(id);
  }

  async reactivateOffer(id: string) {
    const offer = await this.getOrThrow(id);
    this.assertTransition(offer.status, 'ACTIVE');
    await this.db.db
      .update(merchantOffers)
      .set({ status: 'ACTIVE', activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'ADMIN',
      action: 'offer.reactivated',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { fromStatus: offer.status, toStatus: 'ACTIVE' },
    });

    return this.getOffer(id);
  }

  async withdrawOffer(id: string) {
    const offer = await this.getOrThrow(id);
    this.assertTransition(offer.status, 'WITHDRAWN');
    await this.db.db
      .update(merchantOffers)
      .set({ status: 'WITHDRAWN', isAvailable: false, updatedAt: new Date() })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'MERCHANT',
      actorId: offer.proposedBy,
      action: 'offer.withdrawn',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { fromStatus: offer.status, toStatus: 'WITHDRAWN', storeId: offer.storeId },
    });

    return this.getOffer(id);
  }

  // ── Commercial terms (pricing/stock linked by reference) ─────

  /**
   * Update the offer's commercial terms. The price list (whose tiers carry the
   * quantity ladder) and the warehouse (whose inventory backs the offer) must
   * belong to the SAME store as the offer — an offer may not spend another
   * store's price book or stock.
   */
  async updateOfferPricing(id: string, input: UpdateOfferPricingInput) {
    const offer = await this.getOrThrow(id);
    if (input.moq != null && input.moq < 1) throw new BadRequestException('MOQ must be at least 1');
    if (input.basePriceMinor != null && input.basePriceMinor < 0) {
      throw new BadRequestException('Base price cannot be negative');
    }

    if (input.priceListId) {
      const pl = await this.db.db.query.priceLists.findFirst({
        where: eq(priceLists.id, input.priceListId),
      });
      if (!pl) throw new NotFoundException('Price list not found');
      if (pl.storeId !== offer.storeId) {
        throw new BadRequestException('Price list does not belong to the offer store');
      }
    }
    if (input.warehouseId) {
      const wh = await this.db.db.query.warehouses.findFirst({
        where: eq(warehouses.id, input.warehouseId),
      });
      if (!wh) throw new NotFoundException('Warehouse not found');
      if (wh.storeId !== offer.storeId) {
        throw new BadRequestException('Warehouse does not belong to the offer store');
      }
    }

    await this.db.db
      .update(merchantOffers)
      .set({
        currency: input.currency ?? offer.currency,
        basePriceMinor: input.basePriceMinor ?? offer.basePriceMinor,
        compareAtPriceMinor: input.compareAtPriceMinor ?? offer.compareAtPriceMinor,
        moq: input.moq ?? offer.moq,
        orderIncrement: input.orderIncrement ?? offer.orderIncrement,
        leadTimeDays: input.leadTimeDays ?? offer.leadTimeDays,
        isAvailable: input.isAvailable ?? offer.isAvailable,
        priceListId: input.priceListId ?? offer.priceListId,
        warehouseId: input.warehouseId ?? offer.warehouseId,
        updatedAt: new Date(),
      })
      .where(eq(merchantOffers.id, id));

    await this.audit.record({
      actorType: 'MERCHANT',
      actorId: offer.proposedBy,
      action: 'offer.pricing_updated',
      resource: 'merchant_offer',
      resourceId: id,
      metadata: { storeId: offer.storeId, changes: Object.keys(input).filter(k => (input as any)[k] != null) },
    });

    return this.getOffer(id);
  }
}
