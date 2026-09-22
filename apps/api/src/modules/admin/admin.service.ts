import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { orders, orderItems, orderStatusHistory } from '../orders/orders.schema';
import { stores } from '../merchant/merchant.schema';
import { users, organizations, organizationMembers, organizationUpdateRequests, roles, permissions, rolePermissions } from '../identity/identity.schema';
import { products, productMedia, productVariants } from '../catalog/catalog.schema';
import { eq, and, isNull, sql, gte, lte, inArray, desc, getTableColumns } from 'drizzle-orm';
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
  constructor(private readonly db: DatabaseService, private readonly storage: StorageService) {}

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
      verificationStatus: organizations.verificationStatus,
      isActive: organizations.isActive,
    }).from(organizations).orderBy(organizations.name);
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
