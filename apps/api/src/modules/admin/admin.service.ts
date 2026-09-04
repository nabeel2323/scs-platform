import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { orders, masterOrders, orderItems, orderStatusHistory } from '../orders/orders.schema';
import { stores, verificationRequests } from '../merchant/merchant.schema';
import { users, organizations, organizationMembers, roles, permissions, rolePermissions } from '../identity/identity.schema';
import { products } from '../catalog/catalog.schema';
import { auditLogs, analyticsEvents } from '../audit/audit.schema';
import { eq, and, desc, isNull, sql, count, gte, lte, inArray, like, or } from 'drizzle-orm';

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
  constructor(private readonly db: DatabaseService) {}

  // ── Orders ───────────────────────────────────────────────────

  async listOrders(filters: {
    status?: string;
    storeId?: string;
    buyerId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];

    if (filters.status) {
      conditions.push(eq(orders.status, filters.status));
    }
    if (filters.storeId) {
      conditions.push(eq(orders.storeId, filters.storeId));
    }
    if (filters.buyerId) {
      conditions.push(eq(orders.buyerId, filters.buyerId));
    }
    if (filters.from) {
      conditions.push(gte(orders.createdAt, new Date(filters.from)));
    }
    if (filters.to) {
      conditions.push(lte(orders.createdAt, new Date(filters.to)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db.db.select().from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      this.db.db.select({ count: sql<number>`count(*)` }).from(orders).where(where),
    ]);

    return {
      data: rows,
      total: totalResult[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  async getOrderDetail(orderId: string) {
    const orderRows = await this.db.db.select().from(orders)
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

  async listMerchants(filters: {
    status?: string;
    verificationStatus?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];

    if (filters.status) {
      conditions.push(eq(stores.status, filters.status));
    }
    if (filters.verificationStatus) {
      conditions.push(eq(stores.verificationStatus, filters.verificationStatus));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db.db.select().from(stores)
        .where(where)
        .orderBy(desc(stores.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      this.db.db.select({ count: sql<number>`count(*)` }).from(stores).where(where),
    ]);

    return {
      data: rows,
      total: totalResult[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
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

      // Total revenue (sum of total_minor)
      this.db.db.select({ total: sql<number>`coalesce(sum(total_minor), 0)` }).from(orders)
        .where(and(
          inArray(orders.status, ['DELIVERED', 'COMPLETED']),
          gte(orders.createdAt, dateFrom),
          lte(orders.createdAt, dateTo),
        )),

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
    const totalRevenue = revenueResult[0]?.total || 0;
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
      revenue: { totalMinor: totalRevenue },
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

  async getAuditLogs(filters: {
    action?: string;
    resource?: string;
    actorId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];

    if (filters.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters.resource) {
      conditions.push(eq(auditLogs.resource, filters.resource));
    }
    if (filters.actorId) {
      conditions.push(eq(auditLogs.actorId, filters.actorId));
    }
    if (filters.from) {
      conditions.push(gte(auditLogs.createdAt, new Date(filters.from)));
    }
    if (filters.to) {
      conditions.push(lte(auditLogs.createdAt, new Date(filters.to)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db.db.select().from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      this.db.db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
    ]);

    return {
      data: rows,
      total: totalResult[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  // ── Verifications (alias for verification queue) ───────────

  async listVerifications(filters: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];
    if (filters.status) conditions.push(eq(verificationRequests.status, filters.status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db.db.select().from(verificationRequests)
        .where(where)
        .orderBy(desc(verificationRequests.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      this.db.db.select({ count: sql<number>`count(*)` }).from(verificationRequests).where(where),
    ]);

    return {
      data: rows,
      total: totalResult[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  // ── Product Moderation ─────────────────────────────────────

  async listProductsModeration(filters: {
    status?: string;
    storeId?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [isNull(products.deletedAt)];
    if (filters.status) conditions.push(eq(products.status, filters.status));
    if (filters.storeId) conditions.push(eq(products.storeId, filters.storeId));

    const where = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      this.db.db.select().from(products)
        .where(where)
        .orderBy(desc(products.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      this.db.db.select({ count: sql<number>`count(*)` }).from(products).where(where),
    ]);

    return {
      data: rows,
      total: totalResult[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  // ── User Management ──────────────────────────────────────────

  async listUsers(filters: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];

    if (filters.status) {
      conditions.push(eq(users.status, filters.status));
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        like(users.fullName, term),
        like(users.phone, term),
        like(users.email, term),
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db.db.select().from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(filters.limit || 50)
        .offset(filters.offset || 0),
      this.db.db.select({ count: sql<number>`count(*)` }).from(users).where(where),
    ]);

    return {
      data: rows,
      total: totalResult[0]?.count || 0,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    // Get org memberships with role and org details
    const memberships = await this.db.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
    });

    const orgDetails = [];
    for (const m of memberships) {
      const org = await this.db.db.query.organizations.findFirst({
        where: eq(organizations.id, m.orgId),
      });
      const role = await this.db.db.query.roles.findFirst({
        where: eq(roles.id, m.roleId),
      });
      orgDetails.push({
        orgId: m.orgId,
        orgName: org?.name ?? 'Unknown',
        orgType: org?.type ?? 'UNKNOWN',
        roleId: m.roleId,
        roleKey: role?.key ?? 'UNKNOWN',
        roleName: role?.name ?? 'Unknown',
        membershipStatus: m.status,
        joinedAt: m.createdAt,
      });
    }

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
      where: eq(products.id, id),
    });
    if (!product) throw new NotFoundException('Product not found');

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
    }

    await this.db.db.update(products).set(updates).where(eq(products.id, id));
    return { id, decision, reason, moderatedAt: new Date() };
  }
}
