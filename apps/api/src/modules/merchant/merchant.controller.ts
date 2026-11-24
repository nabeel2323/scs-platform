import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  MerchantService,
  CreateStoreInput,
  UpdateStoreInput,
  CreateWarehouseInput,
  UploadDocumentInput,
} from './merchant.service';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { StorageService } from '../../common/storage/storage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ActiveOrgGuard } from '../../common/guards/active-org.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';
import crypto from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import { assertStoreInOrg, assertStoreMember, type CallerContext } from '../../common/tenant-scope';

/**
 * Merchant API — store lifecycle, warehouses, documents, verification.
 *
 * Routes:
 *   POST   /stores                     — create store (merchant owner)
 *   GET    /stores                     — list stores (by org or all for admin)
 *   GET    /stores/:id                 — get store by ID
 *   GET    /stores/slug/:slug          — get store by slug
 *   PATCH  /stores/:id                 — update store
 *   POST   /stores/:id/warehouses      — add warehouse
 *   GET    /stores/:id/warehouses      — list warehouses
 *   PATCH  /warehouses/:id             — update warehouse
 *   POST   /documents                  — register document upload
 *   POST   /documents/presign-upload   — get presigned upload URL for documents
 *   GET    /documents/org/:orgId       — list org documents (member or reviewer)
 *   GET    /documents/store/:storeId   — list store documents (member or reviewer)
 *   POST   /documents/:id/presign      — get presigned download URL (admin)
 *   POST   /documents/:id/merchant-presign — get presigned download URL (org member)
 *   POST   /stores/:id/verify          — submit verification request
 *   GET    /verification/queue         — list pending verifications (admin)
 *   GET    /verification/org/:orgId    — list org's verification requests (member)
 *   GET    /verification/:id           — get verification request
 *   POST   /verification/:id/review    — approve/reject/revision (admin)
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly storage: StorageService,
    private readonly db: DatabaseService,
  ) {}

  private async assertMerchantStoreAccess(user: JwtPayload, storeId: string): Promise<void> {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
  }

  // ── Stores ─────────────────────────────────────────────────────

  @Post('stores')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async createStore(@CurrentUser() user: JwtPayload, @Body() input: CreateStoreInput) {
    return this.merchantService.createStore(input, user.sub);
  }

  @Get('stores')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listStores(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Admin/moderator can list all; merchants see their org's stores
    const isAdmin =
      user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MODERATOR';

    if (isAdmin) {
      return this.merchantService.listStores({
        status,
        verificationStatus,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
    }

    // Merchant: scope to their active org
    if (user.activeOrg) {
      return this.merchantService.listStoresByOrg(user.activeOrg, {
        sub: user.sub,
        role: user.role,
        activeOrg: user.activeOrg,
      });
    }

    // Buyers/public: show verified stores only
    return this.merchantService.listStores({
      verificationStatus: 'VERIFIED',
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('merchant/customers')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getMerchantCustomers(@CurrentUser() user: JwtPayload) {
    if (!user.activeOrg) {
      return [];
    }
    return this.merchantService.getCustomersByOrg(user.activeOrg, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  @Get('stores/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:read')
  async getStore(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const storeId = await this.merchantService.resolveStoreId(id);
    await this.assertMerchantStoreAccess(user, storeId);
    return this.merchantService.getStore(storeId);
  }

  @Get('stores/slug/:slug')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getStoreBySlug(@Param('slug') slug: string) {
    return this.merchantService.getPublicStoreBySlug(slug);
  }

  @Patch('stores/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async updateStore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: UpdateStoreInput,
  ) {
    await this.assertMerchantStoreAccess(user, id);
    return this.merchantService.updateStore(id, input);
  }

  // ── Warehouses ─────────────────────────────────────────────────

  @Post('stores/:storeId/warehouses')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async createWarehouse(
    @CurrentUser() user: JwtPayload,
    @Param('storeId') storeId: string,
    @Body() input: CreateWarehouseInput,
  ) {
    await this.assertMerchantStoreAccess(user, storeId);
    return this.merchantService.createWarehouse(storeId, input);
  }

  @Get('stores/:storeId/warehouses')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:stores:read')
  async listWarehouses(@CurrentUser() user: JwtPayload, @Param('storeId') storeId: string) {
    await this.assertMerchantStoreAccess(user, storeId);
    return this.merchantService.listWarehousesByStore(storeId);
  }

  @Patch('warehouses/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async updateWarehouse(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: CreateWarehouseInput,
  ) {
    const warehouse = await this.merchantService.getWarehouse(id);
    await this.assertMerchantStoreAccess(user, warehouse.storeId);
    return this.merchantService.updateWarehouse(id, input);
  }

  // ── Documents ──────────────────────────────────────────────────

  @Post('documents')
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async uploadDocument(@CurrentUser() user: JwtPayload, @Body() input: UploadDocumentInput) {
    return this.merchantService.uploadDocument(
      {
        ...input,
        uploadedBy: user.sub,
      },
      {
        sub: user.sub,
        role: user.role,
        activeOrg: user.activeOrg,
      },
    );
  }

  @Post('documents/presign-upload')
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async presignDocumentUpload(@Body() body: { fileName: string; mimeType: string }) {
    // Sanitize the client-supplied filename before embedding it in the object
    // key (strip path separators / traversal). The exact key returned here is
    // sent back by the client on POST /documents and persisted as storageKey,
    // so the upload and download keys always match.
    const safeName =
      (body.fileName || 'document')
        .replace(/\.\./g, '_')
        .replace(/[\\/]+/g, '_')
        .trim() || 'document';
    const key = `docs/${crypto.randomUUID()}/${safeName}`;
    const bucket = process.env['S3_UPLOADS_BUCKET'] || 'scs-uploads';
    const uploadUrl = await this.storage.createPresignedPutUrl(
      bucket,
      key,
      body.mimeType || 'application/pdf',
    );
    return { uploadUrl, storageKey: key };
  }

  @Get('documents/org/:orgId')
  async listOrgDocuments(@Param('orgId') orgId: string, @CurrentUser() user: JwtPayload) {
    return this.merchantService.listDocumentsByOrg(orgId, user.sub, user.perms);
  }

  @Get('documents/store/:storeId')
  async listStoreDocuments(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    return this.merchantService.listDocumentsByStore(storeId, user.sub, user.perms);
  }

  @Post('documents/:id/presign')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:verification:review')
  async presignDocument(@Param('id') id: string) {
    return this.merchantService.generatePresignedUrl(id);
  }

  /** Merchant-accessible document download (org-members only). */
  @Post('documents/:id/merchant-presign')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:stores:write')
  async presignMerchantDocument(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.merchantService.presignForMerchant(id, user.sub);
  }

  // ── Verification ───────────────────────────────────────────────

  @Post('stores/:storeId/verify')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, ActiveOrgGuard)
  @RequirePermission('merchant:stores:write')
  async submitVerification(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    await this.assertMerchantStoreAccess(user, storeId);
    return this.merchantService.submitVerification(storeId, user.sub);
  }

  @Get('verification/queue')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:verification:review')
  async getVerificationQueue(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.merchantService.getVerificationQueue({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Merchant-accessible verification history for their own organization.
   * Must be declared BEFORE `verification/:id` so 'org' is not parsed as an id.
   */
  @Get('verification/org/:orgId')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listOrgVerifications(@Param('orgId') orgId: string, @CurrentUser() user: JwtPayload) {
    return this.merchantService.listVerificationsForOrg(orgId, user.sub);
  }

  @Get('verification/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:verification:review')
  async getVerificationRequest(@Param('id') id: string) {
    return this.merchantService.getVerificationRequest(id);
  }

  @Post('verification/:id/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:verification:review')
  async reviewVerification(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: ReviewVerificationDto,
  ) {
    return this.merchantService.reviewVerification(
      id,
      user.sub,
      body.decision,
      body.notes,
      body.rejectionReasons,
    );
  }
}
