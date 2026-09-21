import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { AdminListInput } from './dto/admin-list-query.dto';
import { AdminService } from './admin.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/guards/current-user.decorator';

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

  @Patch('organizations/:id/deactivate')
  @RequirePermission('admin:users:write')
  async deactivateOrganization(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.adminService.deactivateOrganization(id, body.isActive);
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

  @Post('products/:id/moderate')
  @HttpCode(200)
  @RequirePermission('admin:merchants:read')
  async moderateProductPost(@Param('id', ParseUUIDPipe) id: string, @Body() body: ModerateProductDto) {
    return this.adminService.moderateProduct(id, body.decision, body.reason);
  }

  @Patch('products/:id/moderate')
  @RequirePermission('admin:merchants:read')
  async moderateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerateProductDto,
  ) {
    return this.adminService.moderateProduct(id, body.decision, body.reason);
  }
}
