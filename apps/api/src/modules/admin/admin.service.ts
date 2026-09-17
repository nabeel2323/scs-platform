import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { orders, masterOrders, orderItems, orderStatusHistory } from '../orders/orders.schema';
import { stores, verificationRequests } from '../merchant/merchant.schema';
import { users, organizations, organizationMembers, roles, permissions, rolePermissions } from '../identity/identity.schema';
import { products } from '../catalog/catalog.schema';
import { auditLogs, analyticsEvents } from '../audit/audit.schema';
import { eq, and, desc, isNull, sql, count, gte, lte, inArray, like, ilike, or } from 'drizzle-orm';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { isUuid, isUuidPrefix } from '../../common/utils/uuid';

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

  /**
   * UUID filter helper — the admin UIs list truncated IDs (first 8 chars),
   * so accept either a full UUID (exact match) or a hex prefix (ILIKE match).
   * Anything else is a typed 400 rather than an unhandled Postgres cast error.
   */
  private uuidFilter(column: AnyPgColumn, value: string) {
    if (isUuid(value)) return eq(column, value);
    if (isUuidPrefix(value)) return sql`${column}::text ILIKE ${value + '%'}`;

    throw new BadRequestException('ID filter must be a full UUID or a hex prefix');
  }

  /** Date filter helper — rejects unparseable input with a typed 400. */
  private dateFilter(column: AnyPgColumn, value: string, op: 'gte' | 'lte') {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date filter: ${value}`);
    }
    return op === 'gte' ? gte(column, date) : lte(column, date);
  }

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
      conditions.push(this.uuidFilter(orders.storeId, filters.storeId));
    }
    if (filters.buyerId) {
      conditions.push(this.uuidFilter(orders.buyerId, filters.buyerId));
    }
    if (filters.from) {
      conditions.push(this.dateFilter(orders.createdAt, filters.from, 'gte'));
    }
    if (filters.to) {
      conditions.push(this.dateFilter(orders.createdAt, filters.to, 'lte'));
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

    // Substring match: the console offers verb/noun fragments ('create',
    // 'order') while rows store dotted actions and plural resources
    // ('order.created', 'orders'), so exact equality never matched.
    if (filters.action) {
      conditions.push(ilike(auditLogs.action, `%${filters.action}%`));
    }
    if (filters.resource) {
      conditions.push(ilike(auditLogs.resource, `%${filters.resource}%`));
    }
    if (filters.actorId) {
      conditions.push(this.uuidFilter(auditLogs.actorId, filters.actorId));
    }
    if (filters.from) {
      conditions.push(this.dateFilter(auditLogs.createdAt, filters.from, 'gte'));
    }
    if (filters.to) {
      conditions.push(this.dateFilter(auditLogs.createdAt, filters.to, 'lte'));
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
    }).from(organizations).orderBy(organizations.name);
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
      .where(eq(products.id, id))
      .returning({ id: products.id, status: products.status, isAvailable: products.isAvailable });
    if (!updated) throw new NotFoundException('Product not found');
    return { id, decision, status: updated.status, isAvailable: updated.isAvailable, reason, moderatedAt: new Date() };
  }
}
