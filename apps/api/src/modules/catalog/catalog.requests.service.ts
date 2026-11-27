import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { catalogRequests } from './catalog.requests.schema';
import { eq, and, desc } from 'drizzle-orm';
import { CatalogService } from './catalog.service';
import { CatalogTaxonomyService } from './catalog.taxonomy.service';
import crypto from 'node:crypto';

export type CatalogRequestType = 'CATEGORY' | 'BRAND' | 'ATTRIBUTE' | 'OPTION';
export type CatalogRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CreateCatalogRequestInput {
  storeId: string;
  requestedBy?: string;
  type: CatalogRequestType;
  payload: Record<string, unknown>;
}

/**
 * PHASE COS-12: Merchant catalog entity requests.
 *
 * Merchants submit requests for new categories, brands, attributes, or options.
 * Admins review and either approve (auto-creating the entity) or reject.
 */
@Injectable()
export class CatalogRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalogService: CatalogService,
    private readonly taxonomyService: CatalogTaxonomyService,
  ) {}

  /**
   * Merchant submits a new catalog entity request.
   */
  async createRequest(input: CreateCatalogRequestInput) {
    const validTypes: CatalogRequestType[] = ['CATEGORY', 'BRAND', 'ATTRIBUTE', 'OPTION'];
    if (!validTypes.includes(input.type)) {
      throw new BadRequestException(`Invalid request type: ${input.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    const id = crypto.randomUUID();
    await this.db.db.insert(catalogRequests).values({
      id,
      storeId: input.storeId,
      requestedBy: input.requestedBy || null,
      type: input.type,
      payload: input.payload,
      status: 'PENDING',
    });

    return this.getRequest(id);
  }

  /**
   * Merchant lists their own requests.
   */
  async listMerchantRequests(storeId: string) {
    return this.db.db.query.catalogRequests.findMany({
      where: eq(catalogRequests.storeId, storeId),
      orderBy: [desc(catalogRequests.createdAt)],
    });
  }

  /**
   * Admin lists all requests, optionally filtered by type and status.
   */
  async listAdminRequests(filters?: { type?: CatalogRequestType; status?: CatalogRequestStatus }) {
    const conditions = [];
    if (filters?.type) conditions.push(eq(catalogRequests.type, filters.type));
    if (filters?.status) conditions.push(eq(catalogRequests.status, filters.status));

    return this.db.db.query.catalogRequests.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(catalogRequests.createdAt)],
    });
  }

  /**
   * Get a single request by ID.
   */
  async getRequest(id: string) {
    const req = await this.db.db.query.catalogRequests.findFirst({
      where: eq(catalogRequests.id, id),
    });
    if (!req) throw new NotFoundException('Catalog request not found');
    return req;
  }

  /**
   * Lock a pending request while its entity is created and review state is
   * changed. The controller-level actor interceptor keeps this lock inside
   * the authenticated request transaction, so a concurrent reviewer cannot
   * create the same requested entity twice.
   */
  private async getRequestForUpdate(id: string) {
    if (this.db.currentActorContext?.actorKind !== 'user') {
      throw new ForbiddenException('Authenticated reviewer actor context is required');
    }
    const [request] = await this.db.db
      .select()
      .from(catalogRequests)
      .where(eq(catalogRequests.id, id))
      .for('update')
      .limit(1);
    if (!request) throw new NotFoundException('Catalog request not found');
    if (request.status !== 'PENDING') {
      throw new ConflictException(`Request is not pending (current status: ${request.status})`);
    }
    return request;
  }

  /**
   * Admin approves a request — auto-creates the catalog entity.
   */
  async approveRequest(requestId: string, reviewerId: string) {
    const req = await this.getRequestForUpdate(requestId);

    // Create the entity based on request type
    const payload = req.payload as Record<string, any>;
    let createdEntityId: string | null = null;

    switch (req.type) {
      case 'CATEGORY':
        if (!payload['name']) throw new BadRequestException('Category payload must include "name"');
        const cat = await this.catalogService.createCategory({
          name: payload['name'],
          nameAr: payload['nameAr'],
          slug: payload['slug'],
          parentId: payload['parentId'],
          description: payload['description'],
        });
        createdEntityId = cat.id;
        break;

      case 'BRAND':
        if (!payload['name']) throw new BadRequestException('Brand payload must include "name"');
        const brand = await this.catalogService.createBrand({
          name: payload['name'],
          nameAr: payload['nameAr'],
          slug: payload['slug'],
          logoUrl: payload['logoUrl'],
          description: payload['description'],
        });
        createdEntityId = brand.id;
        break;

      case 'ATTRIBUTE':
        if (!payload['name'] || !payload['code']) throw new BadRequestException('Attribute payload must include "name" and "code"');
        const attr = await this.taxonomyService.createAttribute({
          name: payload['name'],
          code: payload['code'],
          type: payload['type'] ?? 'TEXT',
          scope: payload['scope'] ?? 'PRODUCT',
          nameAr: payload['nameAr'],
          description: payload['description'],
        });
        createdEntityId = attr.id;
        break;

      case 'OPTION':
        if (!payload['attributeId'] || !payload['value']) throw new BadRequestException('Option payload must include "attributeId" and "value"');
        const parentAttr = await this.taxonomyService.addOption(payload['attributeId'], {
          value: payload['value'],
          valueAr: payload['valueAr'],
          label: payload['label'],
          sortOrder: payload['sortOrder'] ?? 0,
        });
        createdEntityId = parentAttr.id; // returns the parent attribute
        break;
    }

    // Mark request as approved
    const [approved] = await this.db.db
      .update(catalogRequests)
      .set({
        status: 'APPROVED',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(catalogRequests.id, requestId), eq(catalogRequests.status, 'PENDING')))
      .returning({ id: catalogRequests.id });
    if (!approved) {
      throw new ConflictException('Catalog request was reviewed concurrently; reload and retry');
    }

    return { ...req, status: 'APPROVED', reviewedBy: reviewerId, createdEntityId };
  }

  /**
   * Admin rejects a request with a reason.
   */
  async rejectRequest(requestId: string, reviewerId: string, reason: string) {
    const req = await this.getRequestForUpdate(requestId);

    const [rejected] = await this.db.db
      .update(catalogRequests)
      .set({
        status: 'REJECTED',
        reviewedBy: reviewerId,
        reviewReason: reason,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(catalogRequests.id, requestId), eq(catalogRequests.status, 'PENDING')))
      .returning({ id: catalogRequests.id });
    if (!rejected) {
      throw new ConflictException('Catalog request was reviewed concurrently; reload and retry');
    }

    return { ...req, status: 'REJECTED', reviewedBy: reviewerId, reviewReason: reason };
  }
}
