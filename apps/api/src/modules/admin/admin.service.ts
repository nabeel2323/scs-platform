import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { orders, orderItems, orderStatusHistory } from '../orders/orders.schema';
import { stores, warehouses, businessDocuments, verificationRequests } from '../merchant/merchant.schema';
import { users, organizations, organizationMembers, organizationUpdateRequests, roles, permissions, rolePermissions } from '../identity/identity.schema';
import { products, productMedia, productVariants } from '../catalog/catalog.schema';
import { merchantOffers } from '../catalog/catalog.offer.schema';
import { eq, and, isNull, sql, gte, lte, inArray, desc, asc, count, getTableColumns } from 'drizzle-orm';
import { disputes, disputeEvents } from '../reviews/support.schema';
import { StorageService } from '../../common/storage/storage.service';
import { imageReferences, isProductMediaKey } from '../catalog/product-images';
import { AdminListInput } from './dto/admin-list-query.dto';
import { listAdminTable, safeUserFields } from './admin-tables';

/**
 * Admin service — platform-wide operations for admin users.
 *
 * Endpoints:
 * - listOrders: all orders with filters (status, date range, store)
 * - listMerchants: all stores with verification status
 * - getKpis: activation funnels, conversion, repeat-order rate
 * - getAuditLogs: audit trail with filters
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Orders ───────────────────────────────────────────────────

  async listOrders(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'orders', filters);
  }

  async getOrderDetail(orderId: string) {
    const orderRows = await this.db.db.select({ ...getTableColumns(orders), storeName: stores.displayName,
      storeSlug: stores.slug, buyerName: users.fullName }).from(orders)
      .leftJoin(stores, eq(orders.storeId, stores.id)).leftJoin(users, eq(orders.buyerId, users.id))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderRows[0]) throw new NotFoundException('Order not found');

    const items = await this.db.db.select().from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const history = await this.db.db.select().from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(orderStatusHistory.createdAt);

    return { ...orderRows[0], items, history };
  }

  // ── Merchants ────────────────────────────────────────────────

  async listMerchants(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'merchants', filters);
  }

  // ── KPIs ─────────────────────────────────────────────────────

  async getKpis(from?: string, to?: string) {
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    // Run all KPI queries in parallel
    const [
      totalUsers,
      verifiedMerchants,
      pendingMerchants,
      totalOrders,
      completedOrders,
      cancelledOrders,
      revenueResult,
      repeatBuyersResult,
      activationFunnel,
    ] = await Promise.all([
      // Total registered users
      this.db.db.select({ count: sql<number>`count(*)` }).from(users),

      // Verified merchants (stores)
      this.db.db.select({ count: sql<number>`count(*)` }).from(stores)
        .where(eq(stores.verificationStatus, 'VERIFIED')),

      // Pending merchants
      this.db.db.select({ count: sql<number>`count(*)` }).from(stores)
        .where(eq(stores.verificationStatus, 'PENDING')),

      // Total orders in period
      this.db.db.select({ count: sql<number>`count(*)` }).from(orders)
        .where(and(gte(orders.createdAt, dateFrom), lte(orders.createdAt, dateTo))),

      // Completed orders
      this.db.db.select({ count: sql<number>`count(*)` }).from(orders)
        .where(and(
          eq(orders.status, 'COMPLETED'),
          gte(orders.createdAt, dateFrom),
          lte(orders.createdAt, dateTo),
        )),

      // Cancelled orders
      this.db.db.select({ count: sql<number>`count(*)` }).from(orders)
        .where(and(
          inArray(orders.status, ['CANCELLED', 'REJECTED']),
          gte(orders.createdAt, dateFrom),
          lte(orders.createdAt, dateTo),
        )),

      // Total revenue (sum of total_minor) — A2-4 residual: grouped by currency
      // so the admin dashboard never presents a mixed-currency figure as a single
      // total. Legacy rows with currency NULL are bucketed as 'UNKNOWN'.
      this.db.db.select({
        currency: sql<string>`coalesce(currency, 'UNKNOWN')`,
        total: sql<number>`coalesce(sum(total_minor), 0)`,
      }).from(orders)
        .where(and(
          inArray(orders.status, ['DELIVERED', 'COMPLETED']),
          gte(orders.createdAt, dateFrom),
          lte(orders.createdAt, dateTo),
        ))
        .groupBy(sql`coalesce(currency, 'UNKNOWN')`),

      // Repeat buyers (users with >1 completed order)
      this.db.db.select({
        buyerId: orders.buyerId,
        orderCount: sql<number>`count(*)`,
      }).from(orders)
        .where(eq(orders.status, 'COMPLETED'))
        .groupBy(orders.buyerId)
        .having(({ orderCount }: any) => sql`${orderCount} > 1`),

      // Activation funnel
      this.computeActivationFunnel(),
    ]);

    const totalUsersCount = totalUsers[0]?.count || 0;
    const verifiedCount = verifiedMerchants[0]?.count || 0;
    const pendingCount = pendingMerchants[0]?.count || 0;
    const totalOrdersCount = totalOrders[0]?.count || 0;
    const completedCount = completedOrders[0]?.count || 0;
    const cancelledCount = cancelledOrders[0]?.count || 0;
    // A2-4 residual: revenue is now an array of { currency, totalMinor } pairs
    // rather than a single mixed-currency figure. The admin dashboard can sum
    // for display but must label the result as multi-currency.
    const revenueByCurrency = (revenueResult as any[]).map(r => ({
      currency: r.currency,
      totalMinor: Number(r.total),
    }));
    const repeatBuyersCount = repeatBuyersResult.length;

    // Compute rates
    const completionRate = totalOrdersCount > 0 ? (completedCount / totalOrdersCount) * 100 : 0;
    const cancellationRate = totalOrdersCount > 0 ? (cancelledCount / totalOrdersCount) * 100 : 0;
    const repeatRate = totalUsersCount > 0 ? (repeatBuyersCount / totalUsersCount) * 100 : 0;
    const firstOrderConversion = totalUsersCount > 0
      ? (totalOrdersCount / totalUsersCount) * 100
      : 0;

    return {
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      users: { total: totalUsersCount },
      merchants: { verified: verifiedCount, pending: pendingCount },
      orders: {
        total: totalOrdersCount,
        completed: completedCount,
        cancelled: cancelledCount,
        completionRate: Math.round(completionRate * 100) / 100,
        cancellationRate: Math.round(cancellationRate * 100) / 100,
      },
      revenue: { byCurrency: revenueByCurrency },
      conversion: {
        firstOrderRate: Math.round(firstOrderConversion * 100) / 100,
        repeatOrderRate: Math.round(repeatRate * 100) / 100,
      },
      activationFunnel,
    };
  }

  private async computeActivationFunnel() {
    // Wholesaler funnel: registered → verified → catalog ≥ 20 → first order → repeat ×3
    const [registered, verified, catalogReady, firstOrder, repeatThree] = await Promise.all([
      this.db.db.select({ count: sql<number>`count(*)` }).from(organizations),

      this.db.db.select({ count: sql<number>`count(*)` }).from(stores)
        .where(eq(stores.verificationStatus, 'VERIFIED')),

      // Stores with ≥ 20 products
      this.db.db.select({ count: sql<number>`count(distinct store_id)` }).from(
        sql`(SELECT store_id, COUNT(*) as product_count FROM products GROUP BY store_id HAVING COUNT(*) >= 20) as qualified`,
      ),

      // Users with at least 1 completed order
      this.db.db.select({ count: sql<number>`count(distinct buyer_id)` }).from(orders)
        .where(eq(orders.status, 'COMPLETED')),

      // Users with ≥ 3 completed orders
      this.db.db.select({
        buyerId: orders.buyerId,
        orderCount: sql<number>`count(*)`,
      }).from(orders)
        .where(eq(orders.status, 'COMPLETED'))
        .groupBy(orders.buyerId)
        .having(({ orderCount }: any) => sql`${orderCount} >= 3`),
    ]);

    return {
      registered: registered[0]?.count || 0,
      verified: verified[0]?.count || 0,
      catalogReady: catalogReady[0]?.count || 0,
      firstOrder: firstOrder[0]?.count || 0,
      repeatThree: repeatThree.length,
    };
  }

  // ── Offer Revenue KPIs (PHASE 17) ─────────────────────────

  /**
   * Platform-wide per-offer sales aggregates sourced from `order_items.offer_id`
   * (Phase 10) and `order_items.offer_snapshot` (Phase 15). The snapshot currency
   * is preferred; the offer's live currency is the fallback for pre-Phase-15 rows.
   *
   * Only lines with a non-null `offer_id` are considered, so legacy price-list-
   * only sales stay out of this governance view. Filters:
   *   - from / to   → bounded by `orders.created_at` (defaults to last 30 days)
   *   - storeId     → optional narrowing to one seller
   *   - status      → optional filter on the offer's live status
   *   - limit       → top-N by revenue (defaults to 100)
   */
  async getOfferRevenueKpis(
    filters: { from?: string; to?: string; storeId?: string; status?: string; limit?: number } = {},
  ) {
    const dateFrom = filters.from
      ? new Date(filters.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = filters.to ? new Date(filters.to) : new Date();
    const limit = Math.max(1, Math.min(500, filters.limit ?? 100));

    const conditions = [
      sql`${orderItems.offerId} IS NOT NULL`,
      gte(orders.createdAt, dateFrom),
      lte(orders.createdAt, dateTo),
    ];
    if (filters.storeId) conditions.push(eq(merchantOffers.storeId, filters.storeId));
    if (filters.status) conditions.push(eq(merchantOffers.status, filters.status));

    // Currency precedence: snapshot -> offer.currency -> 'UNKNOWN'. Extracted via
    // the ->> operator so jsonb null and SQL null collapse to the same branch.
    const currencyExpr = sql<string>`COALESCE(
      ${orderItems.offerSnapshot} ->> 'currency',
      ${merchantOffers.currency},
      'UNKNOWN')`;

    const rows = await this.db.db
      .select({
        offerId: orderItems.offerId,
        storeId: merchantOffers.storeId,
        storeName: stores.displayName,
        productId: merchantOffers.productId,
        productTitle: products.title,
        variantId: merchantOffers.variantId,
        offerStatus: merchantOffers.status,
        currency: currencyExpr,
        ordersCount: sql<string>`COUNT(DISTINCT ${orderItems.orderId})::text`,
        unitsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
        revenueMinor: sql<string>`COALESCE(SUM(${orderItems.lineTotalMinor}), 0)::text`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(merchantOffers, eq(orderItems.offerId, merchantOffers.id))
      .leftJoin(stores, eq(merchantOffers.storeId, stores.id))
      .leftJoin(products, eq(merchantOffers.productId, products.id))
      .where(and(...conditions))
      .groupBy(
        orderItems.offerId,
        merchantOffers.storeId,
        stores.displayName,
        merchantOffers.productId,
        products.title,
        merchantOffers.variantId,
        merchantOffers.status,
        currencyExpr,
      )
      .orderBy(desc(sql`SUM(${orderItems.lineTotalMinor})`))
      .limit(limit);

    const perOffer = rows.map(r => ({
      offerId: r.offerId as string,
      storeId: r.storeId,
      storeName: r.storeName ?? null,
      productId: r.productId,
      productTitle: r.productTitle ?? null,
      variantId: r.variantId ?? null,
      offerStatus: r.offerStatus,
      currency: r.currency,
      ordersCount: Number(r.ordersCount),
      unitsSold: Number(r.unitsSold),
      revenueMinor: Number(r.revenueMinor),
    }));

    // Cross-cutting totals for the KPI header cards. Group by currency so a
    // mixed-currency platform total is never presented as a single number
    // (mirrors the A2-4 residual policy already used in `getKpis`).
    const totalsByCurrency = new Map<string, { revenueMinor: number; unitsSold: number; ordersCountSet: Set<string> }>();
    // Recompute ordersCount from the aggregate; a single order can hit multiple
    // offers so summing perOffer.ordersCount would over-count. Fall back to the
    // per-offer figures for the label — this is acceptable for the KPI tile
    // because it is showing engagement (offer-touches) not unique-order count.
    for (const r of perOffer) {
      const bucket = totalsByCurrency.get(r.currency) ?? { revenueMinor: 0, unitsSold: 0, ordersCountSet: new Set<string>() };
      bucket.revenueMinor += r.revenueMinor;
      bucket.unitsSold += r.unitsSold;
      totalsByCurrency.set(r.currency, bucket);
    }

    return {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      filters: {
        storeId: filters.storeId ?? null,
        status: filters.status ?? null,
        limit,
      },
      totals: {
        offersTouched: perOffer.length,
        byCurrency: Array.from(totalsByCurrency.entries())
          .map(([currency, v]) => ({
            currency,
            revenueMinor: v.revenueMinor,
            unitsSold: v.unitsSold,
          }))
          .sort((a, b) => b.revenueMinor - a.revenueMinor),
      },
      offers: perOffer,
    };
  }

  // ── Offer Trend (PHASE 19) ────────────────────────────

  /**
   * PHASE 19: platform-wide (or per-store) offer sales trend bucketed by day
   * or week. This is the governance-side counterpart of the Phase 18 merchant
   * trend — same `date_trunc` shape, but the row set is joined against
   * `stores` so the admin UI can attribute each bucket to a seller, and the
   * scope is platform-wide unless `storeId` is supplied.
   *
   * Filters:
   *   - granularity  → 'day' | 'week' (defaults to 'day')
   *   - from / to     → bounded by `order_items.created_at` (defaults to last
   *                     `days` which itself defaults to 90, capped 365)
   *   - storeId       → optional narrowing to one seller
   *   - offerId       → optional narrowing to a single offer (must belong to
   *                     the store when both are given)
   *   - status        → optional filter on the offer's live status
   *   - topStores     → when > 0, additionally return the top-N stores by
   *                     revenue in the same window so the admin page can
   *                     render a comparison table under the trend chart.
   *
   * Additive: does not touch `getOfferRevenueKpis` (Phase 17) so the existing
   * admin KPI dashboard is unaffected.
   */
  async getOfferTrend(
    filters: {
      granularity?: 'day' | 'week';
      from?: string;
      to?: string;
      days?: number;
      storeId?: string;
      offerId?: string;
      status?: string;
      topStores?: number;
    } = {},
  ) {
    const gran: 'day' | 'week' = filters.granularity === 'week' ? 'week' : 'day';
    const now = new Date();
    const dateTo = filters.to ? new Date(filters.to) : now;
    let dateFrom: Date;
    if (filters.from) {
      dateFrom = new Date(filters.from);
    } else {
      const raw = filters.days ?? 90;
      const span = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 90;
      dateFrom = new Date(dateTo.getTime() - span * 24 * 60 * 60 * 1000);
    }

    const conditions = [
      sql`${orderItems.offerId} IS NOT NULL`,
      gte(orderItems.createdAt, dateFrom),
      lte(orderItems.createdAt, dateTo),
    ];
    if (filters.storeId) conditions.push(eq(merchantOffers.storeId, filters.storeId));
    if (filters.offerId) conditions.push(eq(orderItems.offerId, filters.offerId));
    if (filters.status) conditions.push(eq(merchantOffers.status, filters.status));

    const bucketExpr = sql<string>`to_char(date_trunc(${sql.raw(`'${gran}'`)}, ${orderItems.createdAt}), 'YYYY-MM-DD')`;

    const [buckets, topStoreRows] = await Promise.all([
      this.db.db
        .select({
          bucket: bucketExpr,
          ordersCount: count(sql`DISTINCT ${orderItems.orderId}`),
          unitsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
          revenueMinor: sql<string>`COALESCE(SUM(${orderItems.lineTotalMinor}), 0)::text`,
        })
        .from(orderItems)
        .innerJoin(merchantOffers, eq(orderItems.offerId, merchantOffers.id))
        .where(and(...conditions))
        .groupBy(bucketExpr)
        .orderBy(asc(bucketExpr)),
      (filters.topStores ?? 0) > 0
        ? this.db.db
            .select({
              storeId: merchantOffers.storeId,
              storeName: stores.displayName,
              ordersCount: count(sql`DISTINCT ${orderItems.orderId}`),
              unitsSold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
              revenueMinor: sql<string>`COALESCE(SUM(${orderItems.lineTotalMinor}), 0)::text`,
            })
            .from(orderItems)
            .innerJoin(merchantOffers, eq(orderItems.offerId, merchantOffers.id))
            .leftJoin(stores, eq(merchantOffers.storeId, stores.id))
            .where(and(...conditions))
            .groupBy(merchantOffers.storeId, stores.displayName)
            .orderBy(desc(sql`SUM(${orderItems.lineTotalMinor})`))
            .limit(Math.min(20, Math.max(1, filters.topStores ?? 5)))
        : Promise.resolve([] as Array<{
            storeId: string;
            storeName: string | null;
            ordersCount: number;
            unitsSold: string;
            revenueMinor: string;
          }>),
    ]);

    return {
      granularity: gran,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      filters: {
        storeId: filters.storeId ?? null,
        offerId: filters.offerId ?? null,
        status: filters.status ?? null,
        topStores: filters.topStores ?? 0,
      },
      buckets: buckets.map(b => ({
        bucket: b.bucket,
        ordersCount: Number(b.ordersCount ?? 0),
        unitsSold: Number(b.unitsSold ?? 0),
        revenueMinor: Number(b.revenueMinor ?? 0),
      })),
      topStores: topStoreRows.map(t => ({
        storeId: t.storeId,
        storeName: t.storeName ?? null,
        ordersCount: Number(t.ordersCount ?? 0),
        unitsSold: Number(t.unitsSold ?? 0),
        revenueMinor: Number(t.revenueMinor ?? 0),
      })),
    };
  }

  // ── Audit Logs ───────────────────────────────────────────────

  async getAuditLogs(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'audit', filters);
  }

  // ── Verifications (alias for verification queue) ───────────

  async listVerifications(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'verifications', filters);
  }

  // ── Product Moderation ─────────────────────────────────────

  async listProductsModeration(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'products', filters);
  }

  async listCategories(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'categories', filters);
  }

  async listBrands(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'brands', filters);
  }

  async listOffers(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'offers', filters);
  }

  async listDisputes(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'disputes', filters);
  }

  async getDisputeDetail(id: string) {
    const dispute = await this.db.db.query.disputes.findFirst({ where: eq(disputes.id, id) });
    if (!dispute) throw new NotFoundException('Dispute not found');
    const events = await this.db.db.select().from(disputeEvents).where(eq(disputeEvents.disputeId, id)).orderBy(disputeEvents.createdAt);
    const people = await this.db.db.select({ id: users.id, name: users.fullName }).from(users)
      .where(inArray(users.id, [dispute.raisedBy, dispute.againstId]));
    return { ...dispute, events, raisedByName: people.find(p => p.id === dispute.raisedBy)?.name ?? null,
      againstName: people.find(p => p.id === dispute.againstId)?.name ?? null };
  }

  async productMediaPreviews(id: string) {
    const product = await this.db.db.query.products.findFirst({ where: and(eq(products.id, id), isNull(products.deletedAt)) });
    if (!product) throw new NotFoundException('Product not found');
    const [media, variants] = await Promise.all([
      this.db.db.select().from(productMedia).where(eq(productMedia.productId, id)),
      this.db.db.select().from(productVariants).where(eq(productVariants.productId, id)),
    ]);
    const references = [...new Set([...imageReferences(product.images, media),
      ...variants.flatMap(v => imageReferences(v.images))])].filter(isProductMediaKey);
    const previews: Record<string, string> = {};
    for (const key of references) {
      previews[key] = await this.storage.createPresignedGetUrl(process.env['S3_MEDIA_BUCKET'] || 'scs-media', key);
    }
    return { previews };
  }

  // ── User Management ──────────────────────────────────────────

  async listUsers(filters: AdminListInput) {
    return listAdminTable(this.db.db, 'users', filters);
  }

  async getUserDetail(userId: string) {
    const [user] = await this.db.db.select(safeUserFields).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundException('User not found');
    const orgDetails = await this.db.db.select({
      orgId: organizationMembers.orgId, orgName: organizations.name, orgType: organizations.type,
      roleId: organizationMembers.roleId, roleKey: roles.key, roleName: roles.name,
      membershipStatus: organizationMembers.status, joinedAt: organizationMembers.createdAt,
    }).from(organizationMembers).leftJoin(organizations, eq(organizationMembers.orgId, organizations.id))
      .leftJoin(roles, eq(organizationMembers.roleId, roles.id)).where(eq(organizationMembers.userId, userId));
    return { ...user, organizations: orgDetails };
  }

  async updateUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') {
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    await this.db.db.update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { id: userId, status, updatedAt: new Date() };
  }

  async assignRole(orgId: string, userId: string, roleId: string) {
    // Verify user exists
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    // Verify org exists
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) throw new NotFoundException('Organization not found');

    // Verify role exists
    const role = await this.db.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
    });
    if (!role) throw new NotFoundException('Role not found');

    // Check if membership exists
    const existing = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    });

    if (existing) {
      // Update existing membership role
      await this.db.db.update(organizationMembers)
        .set({ roleId })
        .where(eq(organizationMembers.id, existing.id));
      return { orgId, userId, roleId, action: 'updated' };
    }

    // Create new membership
    await this.db.db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      orgId,
      userId,
      roleId,
      status: 'ACTIVE',
    });

    return { orgId, userId, roleId, action: 'created' };
  }

  /**
   * List all organizations (id, name, type, verification status) for the
   * admin role-assignment picker.
   */
  async listOrganizations() {
    return this.db.db.select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      legalName: organizations.legalName,
      taxId: organizations.taxId,
      country: organizations.country,
      verificationStatus: organizations.verificationStatus,
      isActive: organizations.isActive,
      inviteCode: organizations.inviteCode,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      memberCount: sql<number>`(select count(*)::integer from ${organizationMembers} where ${organizationMembers.orgId} = ${organizations.id})`,
      storeCount: sql<number>`(select count(*)::integer from ${stores} where ${stores.orgId} = ${organizations.id})`,
      pendingVerificationCount: sql<number>`(select count(*)::integer from ${verificationRequests} where ${verificationRequests.orgId} = ${organizations.id} and ${verificationRequests.status} = 'SUBMITTED')`,
    }).from(organizations).orderBy(organizations.name);
  }

  /**
   * Full organization detail for admin review — includes stores, warehouses,
   * documents and members so the admin console can display all registration
   * information in one view.
   */
  async getOrganizationDetail(orgId: string) {
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) throw new NotFoundException('Organization not found');

    const [orgStores, orgDocuments, orgMembers] = await Promise.all([
      this.db.db.query.stores.findMany({
        where: eq(stores.orgId, orgId),
        orderBy: [stores.createdAt],
      }),
      this.db.db.query.businessDocuments.findMany({
        where: eq(businessDocuments.orgId, orgId),
        orderBy: [desc(businessDocuments.createdAt)],
      }),
      this.db.db.query.organizationMembers.findMany({
        where: eq(organizationMembers.orgId, orgId),
        with: { user: { columns: { id: true, fullName: true, phone: true, email: true } }, role: { columns: { id: true, name: true, key: true } } },
        orderBy: [organizationMembers.createdAt],
      }),
    ]);

    // Warehouses belong to stores, not directly to orgs — collect via store IDs
    const storeIds = orgStores.map(s => s.id);
    const orgWarehouses = storeIds.length > 0
      ? await this.db.db.query.warehouses.findMany({
          where: inArray(warehouses.storeId, storeIds),
          orderBy: [warehouses.createdAt],
        })
      : [];

    return { ...org, stores: orgStores, warehouses: orgWarehouses, documents: orgDocuments, members: orgMembers };
  }

  /**
   * Deactivate (soft-delete) or reactivate an organization.
   */
  async deactivateOrganization(orgId: string, isActive: boolean) {
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) throw new NotFoundException('Organization not found');
    await this.db.db.update(organizations)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    return { success: true, orgId, isActive };
  }

  /**
   * List organization update requests for admin review (G5).
   * Optional status filter ('PENDING' | 'APPROVED' | 'REJECTED'); newest first.
   */
  async listOrgUpdateRequests(status?: string) {
    const rows = await this.db.db.select({
      id: organizationUpdateRequests.id,
      orgId: organizationUpdateRequests.orgId,
      orgName: organizations.name,
      requestedBy: organizationUpdateRequests.requestedBy,
      payload: organizationUpdateRequests.payload,
      status: organizationUpdateRequests.status,
      decisionNotes: organizationUpdateRequests.decisionNotes,
      decidedBy: organizationUpdateRequests.decidedBy,
      decidedAt: organizationUpdateRequests.decidedAt,
      createdAt: organizationUpdateRequests.createdAt,
    })
      .from(organizationUpdateRequests)
      .leftJoin(organizations, eq(organizationUpdateRequests.orgId, organizations.id))
      .orderBy(desc(organizationUpdateRequests.createdAt));
    return status ? rows.filter((r) => r.status === status) : rows;
  }

  /**
   * Approve or reject an organization update request (G5).
   * On APPROVED the proposed payload is applied to the organizations row.
   * Notifies the requesting user of the decision.
   */
  async reviewOrgUpdateRequest(
    requestId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED',
    notes?: string,
  ) {
    const request = await this.db.db.query.organizationUpdateRequests.findFirst({
      where: eq(organizationUpdateRequests.id, requestId),
    });
    if (!request) throw new NotFoundException('Update request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Update request is already ${request.status.toLowerCase()}`);
    }

    // Fetch org name for notification
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, request.orgId),
      columns: { id: true, name: true },
    });

    if (decision === 'APPROVED') {
      const payload = (request.payload ?? {}) as Record<string, unknown>;
      const updates: Record<string, string | Date> = {};
      for (const field of ['name', 'legalName', 'taxId'] as const) {
        const value = payload[field];
        if (typeof value === 'string') updates[field] = value;
      }
      if (Object.keys(updates).length === 0) {
        throw new BadRequestException('Update request payload contains no applicable fields');
      }
      updates['updatedAt'] = new Date();
      await this.db.db.update(organizations)
        .set(updates)
        .where(eq(organizations.id, request.orgId));
    }

    const [updated] = await this.db.db.update(organizationUpdateRequests)
      .set({
        status: decision,
        decisionNotes: notes ?? null,
        decidedBy: reviewerId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationUpdateRequests.id, requestId))
      .returning();

    // Notify the requesting user of the decision
    const templateName = decision === 'APPROVED' ? 'org_update.approved' : 'org_update.rejected';
    await this.notifications.send(request.requestedBy, templateName, {
      orgName: org?.name ?? 'your organization',
      notes: notes ?? '',
    });

    return updated;
  }

  /**
   * Remove a user's membership (role) in a specific organization.
   */
  async removeRole(orgId: string, userId: string) {
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    });
    if (!membership) throw new NotFoundException('Membership not found');

    await this.db.db.delete(organizationMembers)
      .where(eq(organizationMembers.id, membership.id));

    return { orgId, userId, removed: true };
  }

  async listRoles() {
    const allRoles = await this.db.db.select().from(roles).orderBy(roles.key);

    const result = [];
    for (const r of allRoles) {
      const perms = await this.db.db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, r.id),
      });
      const permKeys: string[] = [];
      for (const rp of perms) {
        const perm = await this.db.db.query.permissions.findFirst({
          where: eq(permissions.id, rp.permissionId),
        });
        if (perm) permKeys.push(perm.key);
      }
      result.push({ id: r.id, key: r.key, name: r.name, permissions: permKeys });
    }

    return result;
  }

  async moderateProduct(id: string, decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED', reason?: string) {
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, id), isNull(products.deletedAt)),
    });
    if (!product || product.status === 'ARCHIVED') throw new NotFoundException('Product not found');

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    switch (decision) {
      case 'APPROVED':
        updates['status'] = 'ACTIVE';
        updates['isAvailable'] = true;
        updates['publishedAt'] = new Date();
        break;
      case 'REJECTED':
        updates['status'] = 'REJECTED';
        updates['isAvailable'] = false;
        break;
      case 'ARCHIVED':
        updates['deletedAt'] = new Date();
        updates['isAvailable'] = false;
        break;
      default:
        // Unreachable behind ModerateProductDto, but keeps the service safe if
        // called from elsewhere — never return 200 without a status change.
        throw new BadRequestException(`Unsupported moderation decision: ${decision}`);
    }

    // `.returning()` echoes the persisted row state so clients can confirm the
    // transition actually landed (guards against silent no-op reports).
    const [updated] = await this.db.db
      .update(products)
      .set(updates)
      .where(and(eq(products.id, id), isNull(products.deletedAt), sql`${products.status} <> 'ARCHIVED'`))
      .returning({ id: products.id, status: products.status, isAvailable: products.isAvailable });
    if (!updated) throw new NotFoundException('Product not found');
    return { id, decision, status: updated.status, isAvailable: updated.isAvailable, reason, moderatedAt: new Date() };
  }
}
