import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
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
  async listOrders(
    @Query('status') status?: string,
    @Query('storeId') storeId?: string,
    @Query('buyerId') buyerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listOrders({
      status,
      storeId,
      buyerId,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('orders/:id')
  @RequirePermission('admin:orders:read')
  async getOrderDetail(@Param('id') id: string) {
    return this.adminService.getOrderDetail(id);
  }

  @Get('merchants')
  @RequirePermission('admin:merchants:read')
  async listMerchants(
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listMerchants({
      status,
      verificationStatus,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('kpis')
  @RequirePermission('admin:kpis:read')
  async getKpis(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminService.getKpis(from, to);
  }

  @Get('audit-logs')
  @RequirePermission('admin:audit:read')
  async getAuditLogs(
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getAuditLogs({
      action,
      resource,
      actorId,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ── Verification queue alias (plan §13.4 compliance) ───────

  @Get('verifications')
  @RequirePermission('admin:merchants:read')
  async listVerifications(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listVerifications({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ── Product moderation (plan §13.4) ────────────────────────

  @Get('products')
  @RequirePermission('admin:merchants:read')
  async listProductsModeration(
    @Query('status') status?: string,
    @Query('storeId') storeId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listProductsModeration({
      status,
      storeId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Patch('products/:id/moderate')
  @RequirePermission('admin:merchants:read')
  async moderateProduct(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED'; reason?: string },
  ) {
    return this.adminService.moderateProduct(id, body.decision, body.reason);
  }
}
