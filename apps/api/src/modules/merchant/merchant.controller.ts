import {
  Controller, Get, Post, Patch,
  Param, Body, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { MerchantService, CreateStoreInput, UpdateStoreInput, CreateWarehouseInput, UploadDocumentInput } from './merchant.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';

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
 *   GET    /documents/org/:orgId       — list org documents
 *   GET    /documents/store/:storeId   — list store documents
 *   POST   /documents/:id/presign      — get presigned download URL
 *   POST   /stores/:id/verify          — submit verification request
 *   GET    /verification/queue         — list pending verifications (admin)
 *   GET    /verification/:id           — get verification request
 *   POST   /verification/:id/review    — approve/reject/revision (admin)
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  // ── Stores ─────────────────────────────────────────────────────

  @Post('stores')
  async createStore(
    @CurrentUser() user: JwtPayload,
    @Body() input: CreateStoreInput,
  ) {
    return this.merchantService.createStore(input, user.sub);
  }

  @Get('stores')
  async listStores(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Admin/moderator can list all; merchants see their org's stores
    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MODERATOR';

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
      return this.merchantService.listStoresByOrg(user.activeOrg);
    }

    // Buyers/public: show verified stores only
    return this.merchantService.listStores({
      verificationStatus: 'VERIFIED',
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('merchant/customers')
  async getMerchantCustomers(@CurrentUser() user: JwtPayload) {
    if (!user.activeOrg) {
      return [];
    }
    return this.merchantService.getCustomersByOrg(user.activeOrg);
  }

  @Get('stores/:id')
  async getStore(@Param('id') id: string) {
    return this.merchantService.getStore(id);
  }

  @Get('stores/slug/:slug')
  async getStoreBySlug(@Param('slug') slug: string) {
    return this.merchantService.getStoreBySlug(slug);
  }

  @Patch('stores/:id')
  async updateStore(
    @Param('id') id: string,
    @Body() input: UpdateStoreInput,
  ) {
    return this.merchantService.updateStore(id, input);
  }

  // ── Warehouses ─────────────────────────────────────────────────

  @Post('stores/:storeId/warehouses')
  async createWarehouse(
    @Param('storeId') storeId: string,
    @Body() input: CreateWarehouseInput,
  ) {
    return this.merchantService.createWarehouse(storeId, input);
  }

  @Get('stores/:storeId/warehouses')
  async listWarehouses(@Param('storeId') storeId: string) {
    return this.merchantService.listWarehousesByStore(storeId);
  }

  @Patch('warehouses/:id')
  async updateWarehouse(
    @Param('id') id: string,
    @Body() input: CreateWarehouseInput,
  ) {
    return this.merchantService.updateWarehouse(id, input);
  }

  // ── Documents ──────────────────────────────────────────────────

  @Post('documents')
  async uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Body() input: UploadDocumentInput,
  ) {
    return this.merchantService.uploadDocument({
      ...input,
      uploadedBy: user.sub,
    });
  }

  @Get('documents/org/:orgId')
  async listOrgDocuments(@Param('orgId') orgId: string) {
    return this.merchantService.listDocumentsByOrg(orgId);
  }

  @Get('documents/store/:storeId')
  async listStoreDocuments(@Param('storeId') storeId: string) {
    return this.merchantService.listDocumentsByStore(storeId);
  }

  @Post('documents/:id/presign')
  async presignDocument(@Param('id') id: string) {
    return this.merchantService.generatePresignedUrl(id);
  }

  // ── Verification ───────────────────────────────────────────────

  @Post('stores/:storeId/verify')
  async submitVerification(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.merchantService.submitVerification(storeId, user.sub);
  }

  @Get('verification/queue')
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

  @Get('verification/:id')
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
    @Body() body: { decision: 'APPROVED' | 'REJECTED' | 'REVISION'; notes?: string; rejectionReasons?: string[] },
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
