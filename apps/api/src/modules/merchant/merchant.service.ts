import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { stores, warehouses, businessDocuments, verificationRequests } from './merchant.schema';
import { organizations } from '../identity/identity.schema';
import { eq, and, desc, sql } from 'drizzle-orm';
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
  ) {}

  // ── Stores ─────────────────────────────────────────────────────

  async createStore(input: CreateStoreInput, userId: string) {
    // Ensure org exists and user is a member
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, input.orgId),
    });
    if (!org) throw new NotFoundException('Organization not found');

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

  async getStore(storeId: string) {
    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
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

  async listStores(filters?: { status?: string; verificationStatus?: string; limit?: number; offset?: number }) {
    const conditions = [];
    if (filters?.status) conditions.push(eq(stores.status, filters.status));
    if (filters?.verificationStatus) conditions.push(eq(stores.verificationStatus, filters.verificationStatus));

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
    const store = await this.getStore(storeId);

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
    const storageKey = `docs/${input.orgId}/${docId}/${input.fileName}`;

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

  async listDocumentsByOrg(orgId: string) {
    return this.db.db.query.businessDocuments.findMany({
      where: eq(businessDocuments.orgId, orgId),
      orderBy: [desc(businessDocuments.createdAt)],
    });
  }

  async listDocumentsByStore(storeId: string) {
    return this.db.db.query.businessDocuments.findMany({
      where: eq(businessDocuments.storeId, storeId),
      orderBy: [desc(businessDocuments.createdAt)],
    });
  }

  async generatePresignedUrl(docId: string): Promise<{ downloadUrl: string }> {
    const doc = await this.getDocument(docId);

    // In production: generate S3/MinIO presigned URL (15 min expiry)
    // For now: return a placeholder
    const downloadUrl = `https://storage.local/${doc['storageKey']}?expires=900`;

    await this.db.db
      .update(businessDocuments)
      .set({ storageUrl: downloadUrl })
      .where(eq(businessDocuments.id, docId));

    return { downloadUrl };
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
    return req;
  }

  async reviewVerification(
    requestId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED' | 'REVISION',
    notes?: string,
    rejectionReasons?: string[],
  ) {
    const request = await this.getVerificationRequest(requestId);

    if (request['status'] === 'APPROVED' || request['status'] === 'REJECTED') {
      throw new BadRequestException('Verification request already resolved');
    }

    await this.db.db
      .update(verificationRequests)
      .set({
        status: decision,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        decisionNotes: notes || null,
        rejectionReasons: rejectionReasons || [],
        resolvedAt: decision !== 'REVISION' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(verificationRequests.id, requestId));

    // Update store verification status based on decision
    const storeVerificationStatus = decision === 'APPROVED' ? 'VERIFIED'
      : decision === 'REJECTED' ? 'REJECTED'
      : 'REVIEW';

    await this.db.db
      .update(stores)
      .set({ verificationStatus: storeVerificationStatus, updatedAt: new Date() })
      .where(eq(stores.id, request['storeId']));

    // If approved, also activate the store and org
    if (decision === 'APPROVED') {
      await this.db.db
        .update(stores)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(stores.id, request['storeId']));

      await this.db.db
        .update(organizations)
        .set({ verificationStatus: 'VERIFIED', updatedAt: new Date() })
        .where(eq(organizations.id, request['orgId']));
    }

    await this.outbox.publish(
      `merchant.verification.${decision.toLowerCase()}`,
      requestId,
      { requestId, storeId: request['storeId'], decision, reviewerId },
      { userId: reviewerId },
    );

    return this.getVerificationRequest(requestId);
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
  uploadedBy: string;
  expiresAt?: Date;
}
