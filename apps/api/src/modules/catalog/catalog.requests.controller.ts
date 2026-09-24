import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  CatalogRequestsService,
  CreateCatalogRequestInput,
  CatalogRequestType,
  CatalogRequestStatus,
} from './catalog.requests.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/guards/current-user.decorator';

/**
 * PHASE COS-12: Merchant catalog entity requests + admin review queue.
 *
 * Merchants submit requests for new categories, brands, attributes, or options.
 * Admins approve (auto-creating the entity) or reject with a reason.
 *
 * Route ordering: literal paths (admin/requests) precede parameterized (:id).
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CatalogRequestsController {
  constructor(private readonly requestsService: CatalogRequestsService) {}

  // ── Merchant routes ──────────────────────────────────────────

  @Post('merchant/requests')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  async createRequest(@Body() input: CreateCatalogRequestInput) {
    return this.requestsService.createRequest(input);
  }

  @Get('merchant/requests')
  async listMerchantRequests(@Query('storeId') storeId?: string) {
    if (!storeId) return [];
    return this.requestsService.listMerchantRequests(storeId);
  }

  // ── Admin routes (literal before parameterized) ──────────────

  @Get('admin/requests')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:categories:write')
  async listAdminRequests(
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.requestsService.listAdminRequests({
      type: type as CatalogRequestType | undefined,
      status: status as CatalogRequestStatus | undefined,
    });
  }

  @Post('admin/requests/:id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:categories:write')
  async approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reviewerId: string },
  ) {
    return this.requestsService.approveRequest(id, body.reviewerId);
  }

  @Post('admin/requests/:id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:categories:write')
  async rejectRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reviewerId: string; reason: string },
  ) {
    return this.requestsService.rejectRequest(id, body.reviewerId, body.reason);
  }
}
