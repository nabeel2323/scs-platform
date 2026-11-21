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
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';
import { DatabaseService } from '../../common/database/database.service';
import { assertStoreInOrg, assertStoreMember, type CallerContext } from '../../common/tenant-scope';

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
  constructor(
    private readonly requestsService: CatalogRequestsService,
    private readonly db: DatabaseService,
  ) {}

  private async assertMerchantStoreAccess(user: JwtPayload, storeId: string): Promise<void> {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
  }

  // ── Merchant routes ──────────────────────────────────────────

  @Post('merchant/requests')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  async createRequest(
    @CurrentUser() user: JwtPayload,
    @Body() input: CreateCatalogRequestInput,
  ) {
    await this.assertMerchantStoreAccess(user, input.storeId);
    // The authenticated identity is authoritative; never accept requestedBy from the client.
    return this.requestsService.createRequest({ ...input, requestedBy: user.sub });
  }

  @Get('merchant/requests')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  async listMerchantRequests(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId?: string,
  ) {
    if (!storeId) return [];
    await this.assertMerchantStoreAccess(user, storeId);
    return this.requestsService.listMerchantRequests(storeId);
  }

  // ── Admin routes (literal before parameterized) ──────────────

  @Get('admin/requests')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:requests:manage')
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
  @RequirePermission('catalog:requests:manage')
  async approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.requestsService.approveRequest(id, user.sub);
  }

  @Post('admin/requests/:id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:requests:manage')
  async rejectRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason: string },
  ) {
    return this.requestsService.rejectRequest(id, user.sub, body.reason);
  }
}
