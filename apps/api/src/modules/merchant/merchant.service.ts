import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { StorageService } from '../../common/storage/storage.service';
import { stores, warehouses, businessDocuments, verificationRequests } from './merchant.schema';
import { organizations, organizationMembers, users } from '../identity/identity.schema';
import { orders } from '../orders/orders.schema';
import { eq, and, or, desc, sql, isNull, inArray } from 'drizzle-orm';
import { validateSync } from 'class-validator';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { products } from '../catalog/catalog.schema';
import { productImageCount, trimProductReference } from '../catalog/product-images';
import { outboxEvents } from '../audit/audit.schema';
import { isUuid } from '../../common/utils/uuid';
import crypto from 'node:crypto';

/**
 * Merchant service — store lifecycle, warehouses, documents, verification.
 *
 * Handles:
 * - Store CRUD (create, list, update, get-by-slug)
 * - Warehouse management per store
 * - Business document tracking
 * - Verification request submission and review
 * - Slug generation and uniqueness
 */
@Injectable()
export class MerchantService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
    private readonly storage: StorageService,
  ) {}

  // ── Stores ─────────────────────────────────────────────────────

  async createStore(input: CreateStoreInput, userId: string) {
    // Ensure org exists and user is a member
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, input.orgId),
    });
    if (!org) throw new NotFoundException('Organization not found');

    // Ownership guard: the permission check on the controller proves the caller
    // holds merchant:stores:write for their *active* org, but the target orgId is
    // supplied in the body. Verify an ACTIVE membership in that specific org so an
    // owner of org A cannot create a store under org B (IDOR hardening, API-B6).
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.orgId, input.orgId),
        eq(organizationMembers.userId, userId),
      ),
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You are not an active member of this organization');
    }

    const slug = input.slug || this.generateSlug(input.displayName);

    // Check slug uniqueness
    const existing = await this.db.db.query.stores.findFirst({
      where: eq(stores.slug, slug),
    });
    if (existing) throw new ConflictException('Store slug already taken');

    const storeId = crypto.randomUUID();
    await this.db.db.insert(stores).values({
      id: storeId,
      orgId: input.orgId,
      slug,
      displayName: input.displayName,
      description: input.description || null,
      logoUrl: input.logoUrl || null,
      coverUrl: input.coverUrl || null,
      currency: input.currency || 'SAR',
      timezone: input.timezone || 'Asia/Riyadh',
      locale: input.locale || 'ar',
      status: 'DRAFT',
      verificationStatus: 'PENDING',
      address: input.address || {},
      metadata: {},
    });

    // Emit domain event via outbox
    await this.outbox.publish(
      'merchant.store.created',
      storeId,
      { storeId, orgId: input.orgId, slug, displayName: input.displayName },
      { userId },
    );

    return this.getStore(storeId);
  }

  /**
   * Resolves a store by id or by slug.
   *
   * Public routes address stores by slug (`/v1/stores/gulf-tech`) while
   * internal callers pass the id. A slug reaching `eq(stores.id, …)` makes
   * Postgres reject the literal and surface as an unhandled 500.
   */
  async getStore(storeId: string) {
    const store = await this.db.db.query.stores.findFirst({
      where: isUuid(storeId) ? eq(stores.id, storeId) : eq(stores.slug, storeId),
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async getStoreBySlug(slug: string) {
    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.slug, slug),
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async listStoresByOrg(orgId: string) {
    return this.db.db.query.stores.findMany({
      where: eq(stores.orgId, orgId),
      orderBy: [desc(stores.createdAt)],
    });
  }

  async getCustomersByOrg(orgId: string) {
    // Get all stores for this org
    const orgStores = await this.listStoresByOrg(orgId);
    if (orgStores.length === 0) return [];

    const storeIds = orgStores.map((s) => s.id);

    // Fetch individual orders + buyer contacts using Drizzle's query builder
    // (inArray handles array parameter binding reliably, unlike raw sql`ANY()`).
    // Aggregation is done in JS below — the data volume per merchant is small.
    const orderRows = await this.db.db
      .select({
        buyerId: orders.buyerId,
        buyerName: users.fullName,
        buyerPhone: users.phone,
        buyerEmail: users.email,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(
        and(
          inArray(orders.storeId, storeIds),
          sql`${orders.status} NOT IN ('CANCELLED', 'REJECTED')`,
        ),
      )
      .orderBy(desc(orders.createdAt));

    // Aggregate per-buyer stats + per-currency spending breakdown.
    const buyerMap = new Map<
      string,
      {
        buyerId: string;
        buyerName: string;
        buyerPhone: string;
        buyerEmail: string | null;
        orderCount: number;
        totalSpentMinor: number;
        spentByCurrency: Map<string, number>;
        lastOrderAt: Date;
      }
    >();

    for (const row of orderRows) {
      let entry = buyerMap.get(row.buyerId);
      if (!entry) {
        entry = {
          buyerId: row.buyerId,
          buyerName: row.buyerName,
          buyerPhone: row.buyerPhone,
          buyerEmail: row.buyerEmail,
          orderCount: 0,
          totalSpentMinor: 0,
          spentByCurrency: new Map(),
          lastOrderAt: new Date(0),
        };
        buyerMap.set(row.buyerId, entry);
      }
      entry.orderCount++;
      entry.totalSpentMinor += Number(row.totalMinor);
      if (row.createdAt > entry.lastOrderAt) entry.lastOrderAt = row.createdAt;

      const cur = row.currency ?? 'UNKNOWN';
      entry.spentByCurrency.set(cur, (entry.spentByCurrency.get(cur) ?? 0) + Number(row.totalMinor));
    }

    return [...buyerMap.values()]
      .sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime())
      .map((e) => ({
        buyerId: e.buyerId,
        buyerName: e.buyerName,
        buyerPhone: e.buyerPhone,
        buyerEmail: e.buyerEmail,
        orderCount: e.orderCount,
        totalSpentMinor: e.totalSpentMinor,
        spentByCurrency: [...e.spentByCurrency.entries()].map(([currency, totalMinor]) => ({
          currency,
          totalMinor,
        })),
        lastOrderAt: e.lastOrderAt,
      }));
  }

  async listStores(filters?: {
    status?: string;
    verificationStatus?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [];
    if (filters?.status) conditions.push(eq(stores.status, filters.status));
    if (filters?.verificationStatus)
      conditions.push(eq(stores.verificationStatus, filters.verificationStatus));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    return this.db.db.query.stores.findMany({
      where,
      orderBy: [desc(stores.createdAt)],
      limit,
      offset,
    });
  }

  async updateStore(storeId: string, input: UpdateStoreInput) {
    await this.getStore(storeId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates['displayName'] = input.displayName;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.logoUrl !== undefined) updates['logoUrl'] = input.logoUrl;
    if (input.coverUrl !== undefined) updates['coverUrl'] = input.coverUrl;
    if (input.currency !== undefined) updates['currency'] = input.currency;
    if (input.timezone !== undefined) updates['timezone'] = input.timezone;
    if (input.locale !== undefined) updates['locale'] = input.locale;
    if (input.status !== undefined) updates['status'] = input.status;
    if (input.address !== undefined) updates['address'] = input.address;
    if (input.metadata !== undefined) updates['metadata'] = input.metadata;
    // PHASE 23: `hidePopularityBadge` is boolean, so `!== undefined` correctly
    // distinguishes "leave unchanged" from "set to false".
    if (input.hidePopularityBadge !== undefined) updates['hidePopularityBadge'] = input.hidePopularityBadge;

    await this.db.db.update(stores).set(updates).where(eq(stores.id, storeId));
    return this.getStore(storeId);
  }

  // ── Warehouses ─────────────────────────────────────────────────

  async createWarehouse(storeId: string, input: CreateWarehouseInput) {
    await this.getStore(storeId); // ensure store exists

    const warehouseId = crypto.randomUUID();
    await this.db.db.insert(warehouses).values({
      id: warehouseId,
      storeId,
      name: input.name,
      address: input.address || {},
      managerName: input.managerName || null,
      managerPhone: input.managerPhone || null,
      status: 'ACTIVE',
    });

    return this.getWarehouse(warehouseId);
  }

  async getWarehouse(warehouseId: string) {
    const wh = await this.db.db.query.warehouses.findFirst({
      where: eq(warehouses.id, warehouseId),
    });
    if (!wh) throw new NotFoundException('Warehouse not found');
    return wh;
  }

  async listWarehousesByStore(storeId: string) {
    return this.db.db.query.warehouses.findMany({
      where: eq(warehouses.storeId, storeId),
      orderBy: [desc(warehouses.createdAt)],
    });
  }

  async updateWarehouse(warehouseId: string, input: UpdateWarehouseInput) {
    await this.getWarehouse(warehouseId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates['name'] = input.name;
    if (input.address !== undefined) updates['address'] = input.address;
    if (input.managerName !== undefined) updates['managerName'] = input.managerName;
    if (input.managerPhone !== undefined) updates['managerPhone'] = input.managerPhone;
    if (input.status !== undefined) updates['status'] = input.status;

    await this.db.db.update(warehouses).set(updates).where(eq(warehouses.id, warehouseId));
    return this.getWarehouse(warehouseId);
  }

  // ── Documents ──────────────────────────────────────────────────

  async uploadDocument(input: UploadDocumentInput) {
    const docId = crypto.randomUUID();
    // Persist the key the client actually uploaded to (returned by
    // POST /documents/presign-upload). Without this the record points at a key
    // no object was ever written to, and the download presign 404s NoSuchKey.
    // Fall back to a deterministic key only for legacy callers.
    const storageKey =
      input.storageKey?.trim() || `docs/${input.orgId}/${docId}/${input.fileName}`;

    await this.db.db.insert(businessDocuments).values({
      id: docId,
      orgId: input.orgId,
      storeId: input.storeId || null,
      docType: input.docType,
      fileName: input.fileName,
      mimeType: input.mimeType || 'application/pdf',
      fileSize: input.fileSize || 0,
      storageKey,
      verificationStatus: 'PENDING',
      uploadedBy: input.uploadedBy,
      expiresAt: input.expiresAt || null,
    });

    return this.getDocument(docId);
  }

  async getDocument(docId: string) {
    const doc = await this.db.db.query.businessDocuments.findFirst({
      where: eq(businessDocuments.id, docId),
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * Asserts the caller may access an organization's documents: either a
   * platform reviewer (merchant:verification:review) or an org member.
   */
  private async assertOrgAccess(orgId: string, userId: string, perms: string[]) {
    if (perms.includes('merchant:verification:review')) return;
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    });
    if (!membership) throw new ForbiddenException('Not authorized to access these documents');
  }

  async listDocumentsByOrg(orgId: string, userId: string, perms: string[] = []) {
    await this.assertOrgAccess(orgId, userId, perms);
    return this.db.db.query.businessDocuments.findMany({
      where: eq(businessDocuments.orgId, orgId),
      orderBy: [desc(businessDocuments.createdAt)],
    });
  }

  async listDocumentsByStore(storeId: string, userId: string, perms: string[] = []) {
    const store = await this.getStore(storeId);
    await this.assertOrgAccess(store.orgId, userId, perms);
    return this.db.db.query.businessDocuments.findMany({
      where: eq(businessDocuments.storeId, storeId),
      orderBy: [desc(businessDocuments.createdAt)],
    });
  }

  async generatePresignedUrl(docId: string): Promise<{ downloadUrl: string }> {
    const doc = await this.getDocument(docId);

    const bucket = process.env['S3_UPLOADS_BUCKET'] || 'scs-uploads';
    const downloadUrl = await this.storage.createPresignedGetUrl(
      bucket,
      doc['storageKey'],
    );

    await this.db.db
      .update(businessDocuments)
      .set({ storageUrl: downloadUrl })
      .where(eq(businessDocuments.id, docId));

    return { downloadUrl };
  }

  /**
   * Merchant-accessible presign: verifies the user is a member of the org
   * that owns the document before generating a download URL.
   */
  async presignForMerchant(docId: string, userId: string): Promise<{ downloadUrl: string }> {
    const doc = await this.getDocument(docId);
    // Verify the requesting user is a member of the document's organization
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.orgId, doc.orgId),
        eq(organizationMembers.userId, userId),
      ),
    });
    if (!membership) throw new ForbiddenException('Not authorized to access this document');
    return this.generatePresignedUrl(docId);
  }

  // ── Verification ───────────────────────────────────────────────

  async submitVerification(storeId: string, userId: string) {
    const store = await this.getStore(storeId);

    // Check for existing pending request
    const existing = await this.db.db.query.verificationRequests.findFirst({
      where: and(
        eq(verificationRequests.storeId, storeId),
        eq(verificationRequests.status, 'SUBMITTED'),
      ),
    });
    if (existing) throw new ConflictException('Verification request already pending');

    const requestId = crypto.randomUUID();
    await this.db.db.insert(verificationRequests).values({
      id: requestId,
      storeId,
      orgId: store['orgId'],
      status: 'SUBMITTED',
      submittedBy: userId,
      autoVerified: false,
    });

    // Update store verification status
    await this.db.db
      .update(stores)
      .set({ verificationStatus: 'PENDING', updatedAt: new Date() })
      .where(eq(stores.id, storeId));

    await this.outbox.publish(
      'merchant.verification.submitted',
      requestId,
      { requestId, storeId, orgId: store['orgId'] },
      { userId },
    );

    return this.getVerificationRequest(requestId);
  }

  async getVerificationQueue(filters?: { status?: string; limit?: number; offset?: number }) {
    const conditions = [];
    if (filters?.status) conditions.push(eq(verificationRequests.status, filters.status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    // Join with stores and organizations to include business details
    const rows = await this.db.db
      .select({
        id: verificationRequests.id,
        storeId: verificationRequests.storeId,
        orgId: verificationRequests.orgId,
        status: verificationRequests.status,
        submittedBy: verificationRequests.submittedBy,
        reviewedBy: verificationRequests.reviewedBy,
        reviewedAt: verificationRequests.reviewedAt,
        decisionNotes: verificationRequests.decisionNotes,
        rejectionReasons: verificationRequests.rejectionReasons,
        autoVerified: verificationRequests.autoVerified,
        submittedAt: verificationRequests.submittedAt,
        resolvedAt: verificationRequests.resolvedAt,
        createdAt: verificationRequests.createdAt,
        updatedAt: verificationRequests.updatedAt,
        storeName: stores.displayName,
        storeSlug: stores.slug,
        orgName: organizations.name,
        orgType: organizations.type,
      })
      .from(verificationRequests)
      .leftJoin(stores, eq(verificationRequests.storeId, stores.id))
      .leftJoin(organizations, eq(verificationRequests.orgId, organizations.id))
      .where(where)
      .orderBy(desc(verificationRequests.submittedAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }

  async getVerificationRequest(requestId: string) {
    const req = await this.db.db.query.verificationRequests.findFirst({
      where: eq(verificationRequests.id, requestId),
    });
    if (!req) throw new NotFoundException('Verification request not found');
    // Attach the owning organization so admin UIs can show its active/deactivated
    // state without a separate endpoint.
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, req.orgId),
      columns: { id: true, name: true, isActive: true },
    });
    return { ...req, org: org ?? null };
  }

  /**
   * Merchant-accessible verification history for their own organization.
   * Members see all requests for stores under the org (newest first), which
   * powers the "correction requested" surface on the web organization page.
   */
  async listVerificationsForOrg(orgId: string, userId: string) {
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    });
    if (!membership) throw new ForbiddenException('Not authorized to view these verification requests');
    const orgStores = await this.db.db.query.stores.findMany({
      where: eq(stores.orgId, orgId),
      columns: { id: true },
    });
    if (orgStores.length === 0) return [];
    return this.db.db.query.verificationRequests.findMany({
      where: inArray(verificationRequests.storeId, orgStores.map(s => s.id)),
      orderBy: [desc(verificationRequests.submittedAt)],
    });
  }

  async reviewVerification(
    requestId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED' | 'REVISION',
    notes?: string,
    rejectionReasons?: string[],
  ) {
    const validation = validateSync(Object.assign(new ReviewVerificationDto(), { decision, notes, rejectionReasons }));
    if (validation.length) throw new BadRequestException(validation.map(error => Object.values(error.constraints || {}).join(', ')).join('; '));

    return this.db.db.transaction(async tx => {
      const [request] = await tx.select().from(verificationRequests)
        .where(eq(verificationRequests.id, requestId)).for('update');
      if (!request) throw new NotFoundException('Verification request not found');
      if (request.status === 'APPROVED' || request.status === 'REJECTED') {
        throw new BadRequestException('Verification request already resolved');
      }
      const [store] = await tx.select().from(stores).where(eq(stores.id, request.storeId)).for('update');
      if (!store) throw new NotFoundException('Store not found');
      if (store.orgId !== request.orgId) throw new BadRequestException('Verification organization does not match the store');
      const now = new Date();
      const [updated] = await tx.update(verificationRequests).set({
        status: decision, reviewedBy: reviewerId, reviewedAt: now, decisionNotes: notes || null,
        rejectionReasons: rejectionReasons || [], resolvedAt: decision !== 'REVISION' ? now : null, updatedAt: now,
      }).where(eq(verificationRequests.id, requestId)).returning();

      const verificationStatus = decision === 'APPROVED' ? 'VERIFIED' : decision === 'REJECTED' ? 'REJECTED' : 'REVIEW';
      await tx.update(stores).set({ verificationStatus, updatedAt: now,
        ...(decision === 'APPROVED' ? { status: 'ACTIVE' } : {}),
      }).where(eq(stores.id, request.storeId));

      // Mirror the decision onto the submitted documents so merchant/admin UIs
      // show real per-document outcomes (G2). REVISION returns docs to PENDING.
      const docStatus = decision === 'APPROVED' ? 'VERIFIED' : decision === 'REJECTED' ? 'REJECTED' : 'PENDING';
      await tx.update(businessDocuments).set({
        verificationStatus: docStatus, reviewedBy: reviewerId, reviewedAt: now,
      }).where(or(
        eq(businessDocuments.storeId, request.storeId),
        and(eq(businessDocuments.orgId, request.orgId), isNull(businessDocuments.storeId)),
      ));

      let autoActivatedProductCount = 0;
      if (decision === 'APPROVED') {
        await tx.update(organizations).set({ verificationStatus: 'VERIFIED', updatedAt: now })
          .where(eq(organizations.id, request.orgId));
        const activated = await tx.update(products).set({ status: 'ACTIVE', isAvailable: true,
          publishedAt: sql`coalesce(${products.publishedAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now,
        }).where(and(eq(products.storeId, request.storeId), eq(products.status, 'DRAFT'), isNull(products.deletedAt),
          sql`length(${trimProductReference(products.title)}) between 1 and 300`,
          sql`length(${trimProductReference(products.slug)}) > 0`,
          sql`${products.moq} >= 1`, inArray(products.condition, ['NEW', 'USED', 'REFURBISHED']),
          sql`${productImageCount} > 0`,
        )).returning({ id: products.id });
        autoActivatedProductCount = activated.length;
      }
      // The global outbox publisher is not transaction-aware; use this transaction.
      await tx.insert(outboxEvents).values({ id: crypto.randomUUID(),
        eventType: `merchant.verification.${decision.toLowerCase()}`, aggregateId: requestId,
        payload: { requestId, storeId: request.storeId, decision, reviewerId, autoActivatedProductCount },
        metadata: { userId: reviewerId }, status: 'PENDING',
      });
      return { ...updated!, autoActivatedProductCount };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────

  private generateSlug(displayName: string): string {
    const base = displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);

    return `${base}-${crypto.randomUUID().substring(0, 8)}`;
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreateStoreInput {
  orgId: string;
  displayName: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
  address?: Record<string, unknown>;
}

export interface UpdateStoreInput {
  displayName?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
  status?: string;
  address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /**
   * PHASE 23: buyer-facing privacy toggle. When true, `listOffersForProductRanked`
   * nulls out this store's `rank`/`ordersCount`/`unitsSold`/`isMostPopular` for
   * every offer of theirs the buyer sees, without hiding the offer itself.
   */
  hidePopularityBadge?: boolean;
}

export interface CreateWarehouseInput {
  name: string;
  address?: Record<string, unknown>;
  managerName?: string;
  managerPhone?: string;
}

export interface UpdateWarehouseInput {
  name?: string;
  address?: Record<string, unknown>;
  managerName?: string;
  managerPhone?: string;
  status?: string;
}

export interface UploadDocumentInput {
  orgId: string;
  storeId?: string;
  docType: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  /** Object key the file was uploaded to via POST /documents/presign-upload. */
  storageKey?: string;
  uploadedBy: string;
  expiresAt?: Date;
}
