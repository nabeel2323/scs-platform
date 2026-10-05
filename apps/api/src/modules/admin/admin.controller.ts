import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, UseGuards, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { AdminListInput } from './dto/admin-list-query.dto';
import { AdminService } from './admin.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { DeactivateOrganizationDto } from './dto/deactivate-organization.dto';
import { ReviewOrgUpdateDto } from './dto/review-org-update.dto';
import { CreateProductInput, UpdateProductInput, CreateVariantInput } from '../catalog/catalog.service';
import { AttributeValueInput } from '../catalog/catalog.taxonomy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';

/**
 * Admin controller — 4 endpoints
 *
 * All endpoints require admin permissions.
 *
 * - GET /v1/admin/orders       — list all orders with filters
 * - GET /v1/admin/orders/:id   — order detail with items + history
 * - GET /v1/admin/merchants    — list all merchants/stores
 * - GET /v1/admin/kpis         — platform KPIs + activation funnel
 * - GET /v1/admin/audit-logs   — audit trail
 * - GET /v1/admin/verifications — alias for verification queue (plan compliance)
 * - GET /v1/admin/products      — product moderation queue
 * - PATCH /v1/admin/products/:id/moderate — approve/reject/archive
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('orders')
  @RequirePermission('admin:orders:read')
  async listOrders(@Query() query: AdminListInput) {
    return this.adminService.listOrders(query);
  }

  @Get('orders/:id')
  @RequirePermission('admin:orders:read')
  async getOrderDetail(@Param('id') id: string) {
    return this.adminService.getOrderDetail(id);
  }

  @Get('merchants')
  @RequirePermission('admin:merchants:read')
  async listMerchants(@Query() query: AdminListInput) {
    return this.adminService.listMerchants(query);
  }

  @Get('kpis')
  @RequirePermission('admin:kpis:read')
  async getKpis(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminService.getKpis(from, to);
  }

  /**
   * PHASE 17: platform-wide per-offer revenue KPIs. Governance view that
   * surfaces which merchant offers are actually pulling GMV across the
   * platform, sourced from `order_items.offer_id` + `offer_snapshot`.
   */
  @Get('offers/kpis')
  @RequirePermission('admin:kpis:read')
  async getOfferRevenueKpis(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getOfferRevenueKpis({
      from,
      to,
      storeId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * PHASE 19: platform-wide offer sales trend bucketed by day/week. Governance
   * counterpart of the Phase 18 merchant trend; supports the same filters as
   * `offers/kpis` plus `granularity`, `days` and `topStores` (which returns a
   * top-N store leaderboard inside the same window).
   */
  @Get('offers/trend')
  @RequirePermission('admin:kpis:read')
  async getOfferTrend(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('days') days?: string,
    @Query('storeId') storeId?: string,
    @Query('offerId') offerId?: string,
    @Query('status') status?: string,
    @Query('granularity') granularity?: string,
    @Query('topStores') topStores?: string,
  ) {
    return this.adminService.getOfferTrend({
      from,
      to,
      days: days ? Number(days) : undefined,
      storeId,
      offerId,
      status,
      granularity: granularity === 'week' ? 'week' : 'day',
      topStores: topStores ? Number(topStores) : undefined,
    });
  }

  @Get('audit-logs')
  @RequirePermission('admin:audit:read')
  async getAuditLogs(@Query() query: AdminListInput) {
    return this.adminService.getAuditLogs(query);
  }

  // ── Verification queue alias (plan §13.4 compliance) ───────

  @Get('verifications')
  @RequirePermission('admin:merchants:read')
  async listVerifications(@Query() query: AdminListInput) {
    return this.adminService.listVerifications(query);
  }

  @Get('verification-queue')
  @RequirePermission('merchant:verification:review')
  async verificationQueue(@Query() query: AdminListInput) {
    return this.adminService.listVerifications(query);
  }

  @Get('categories')
  @RequirePermission('catalog:categories:write')
  async listCategories(@Query() query: AdminListInput) {
    return this.adminService.listCategories(query);
  }

  @Get('brands')
  @RequirePermission('catalog:brands:manage')
  async listBrands(@Query() query: AdminListInput) {
    return this.adminService.listBrands(query);
  }

  @Get('offers')
  @RequirePermission('catalog:offers:govern')
  async listOffers(@Query() query: AdminListInput) {
    return this.adminService.listOffers(query);
  }

  @Get('disputes')
  @RequirePermission('support:disputes:resolve')
  async listDisputes(@Query() query: AdminListInput) {
    return this.adminService.listDisputes(query);
  }

  @Get('disputes/:id')
  @RequirePermission('support:disputes:resolve')
  async getDispute(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getDisputeDetail(id);
  }

  // ── User Management (plan §21.4, §5.1) ────────────────────

  @Get('users')
  @RequirePermission('admin:users:read')
  async listUsers(@Query() query: AdminListInput) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @RequirePermission('admin:users:read')
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  @RequirePermission('admin:users:write')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' },
  ) {
    return this.adminService.updateUserStatus(id, body.status);
  }

  @Post('users/:id/assign-role')
  @RequirePermission('admin:users:write')
  async assignRole(
    @Param('id') id: string,
    @Body() body: { orgId: string; roleId: string },
  ) {
    return this.adminService.assignRole(body.orgId, id, body.roleId);
  }

  @Delete('users/:id/roles/:orgId')
  @RequirePermission('admin:users:write')
  async removeRole(
    @Param('id') id: string,
    @Param('orgId') orgId: string,
  ) {
    return this.adminService.removeRole(orgId, id);
  }

  @Get('roles')
  @RequirePermission('admin:users:read')
  async listRoles() {
    return this.adminService.listRoles();
  }

  @Get('organizations')
  @RequirePermission('admin:users:read')
  async listOrganizations() {
    return this.adminService.listOrganizations();
  }

  @Get('organizations/:id')
  @RequirePermission('admin:users:read')
  async getOrganizationDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getOrganizationDetail(id);
  }

  @Patch('organizations/:id/deactivate')
  @RequirePermission('admin:users:write')
  async deactivateOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeactivateOrganizationDto,
  ) {
    return this.adminService.deactivateOrganization(id, body.isActive);
  }

  // ── Organization update requests (G5) ──────────────────

  @Get('org-update-requests')
  @RequirePermission('admin:users:read')
  async listOrgUpdateRequests(@Query('status') status?: string) {
    return this.adminService.listOrgUpdateRequests(status);
  }

  @Patch('org-update-requests/:id/review')
  @RequirePermission('admin:users:write')
  async reviewOrgUpdateRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewOrgUpdateDto,
  ) {
    return this.adminService.reviewOrgUpdateRequest(id, user.sub, body.decision, body.notes);
  }

  // ── Product moderation (plan §13.4) ────────────────────────

  @Get('products')
  @RequirePermission('admin:merchants:read')
  async listProductsModeration(@Query() query: AdminListInput) {
    return this.adminService.listProductsModeration(query);
  }

  @Get('products/:id/media-previews')
  @RequirePermission('admin:merchants:read')
  async productMediaPreviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.productMediaPreviews(id);
  }

  // ── Admin Product CRUD (PHASE 4 P3) ─────────────────────────

  @Post('products')
  @RequirePermission('catalog:products:write')
  async adminCreateProduct(@CurrentUser() user: JwtPayload, @Body() input: CreateProductInput) {
    return this.adminService.adminCreateProduct(input, user.sub);
  }

  @Patch('products/:id')
  @RequirePermission('catalog:products:write')
  async adminUpdateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductInput & { updatedAt?: string },
  ) {
    const { updatedAt: clientUpdatedAt, ...rest } = input;
    return this.adminService.adminUpdateProduct(id, rest, clientUpdatedAt);
  }

  @Get('products/:id/attribute-values')
  @RequirePermission('catalog:products:write')
  async adminGetProductAttributeValues(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.adminGetProductAttributeValues(id);
  }

  @Put('products/:id/attribute-values')
  @RequirePermission('catalog:products:write')
  async adminSetProductAttributeValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { values: AttributeValueInput[] },
  ) {
    return this.adminService.adminSetProductAttributeValues(id, body.values);
  }

  @Post('products/:id/moderate')
  @HttpCode(200)
  @RequirePermission('admin:merchants:read')
  async moderateProductPost(@Param('id', ParseUUIDPipe) id: string, @Body() body: ModerateProductDto) {
    return this.adminService.moderateProduct(id, body.decision, body.reason, body.updatedAt);
  }

  @Patch('products/:id/moderate')
  @RequirePermission('admin:merchants:read')
  async moderateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerateProductDto,
  ) {
    return this.adminService.moderateProduct(id, body.decision, body.reason, body.updatedAt);
  }

  // ── Admin Variant Management (PHASE 4 P5) ─────────────────────

  /**
   * P5.1 — Admin variant detail endpoint.
   * Fixes latent defect: /variants/[id] page expected this route.
   * Authorization before sensitive lookup (catalog:products:write).
   */
  @Get('variants/:id')
  @RequirePermission('catalog:products:write')
  async adminGetVariant(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.adminGetVariant(id);
  }

  /**
   * P5.2 — Admin variant create endpoint.
   * Delegates to CatalogService.createVariant() — no assertProductInOrg.
   * Preserves P2 FOR SHARE locking and Phase 3 typed attribute authority.
   */
  @Post('products/:productId/variants')
  @RequirePermission('catalog:products:write')
  async adminCreateVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: CreateVariantInput,
  ) {
    return this.adminService.adminCreateVariant(productId, input);
  }

  /**
   * P5.3 — Admin variant edit endpoint.
   * Preserves P1 optimistic locking via clientUpdatedAt.
   * No assertProductInOrg — admins are cross-org by design.
   */
  @Patch('products/:productId/variants/:variantId')
  @RequirePermission('catalog:products:write')
  async adminUpdateVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() input: Partial<CreateVariantInput> & { updatedAt?: string },
  ) {
    const { updatedAt: clientUpdatedAt, ...rest } = input;
    return this.adminService.adminUpdateVariant(productId, variantId, rest, clientUpdatedAt);
  }

  /**
   * P5.4 — Admin typed variant attribute endpoint.
   * Delegates to TaxonomyService.setVariantAttributeValues().
   * Preserves Phase 3 FOR UPDATE serialization.
   */
  @Get('products/:productId/variants/:variantId/attribute-values')
  @RequirePermission('catalog:products:write')
  async adminGetVariantAttributeValues(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.adminService.adminGetVariantAttributeValues(variantId);
  }

  @Put('products/:productId/variants/:variantId/attribute-values')
  @RequirePermission('catalog:products:write')
  async adminSetVariantAttributeValues(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() body: { values: AttributeValueInput[] },
  ) {
    return this.adminService.adminSetVariantAttributeValues(productId, variantId, body.values);
  }

  /**
   * P5.5 — Admin bulk variant endpoint.
   * Supports: create, deleteIds, toggleActive.
   * Backend only — frontend bulk UI is deferred.
   */
  @Post('products/:productId/variants/bulk')
  @RequirePermission('catalog:products:write')
  async adminBulkVariantOperations(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: {
      create?: CreateVariantInput[];
      deleteIds?: string[];
      toggleActive?: Array<{ id: string; isActive: boolean }>;
    },
  ) {
    return this.adminService.adminBulkVariantOperations(productId, body);
  }
}
