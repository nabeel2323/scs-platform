import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';
import {
  ShippingService,
  CreateShippingMethodInput,
  UpdateShippingMethodInput,
  CreateDeliveryZoneInput,
  UpdateDeliveryZoneInput,
} from './shipping.service';

/**
 * ShippingController — M7.2.2 full shipping management API.
 *
 * Endpoints:
 *   Shipping Methods CRUD:
 *     GET    /v1/shipping/providers                 — list carrier providers (M7.2.1)
 *     GET    /v1/shipping/methods?storeId=           — list store's shipping methods
 *     GET    /v1/shipping/methods/:id                — get single method
 *     POST   /v1/shipping/methods                    — create method
 *     PATCH  /v1/shipping/methods/:id                — update method
 *     POST   /v1/shipping/methods/:id/deactivate     — soft-deactivate
 *     GET    /v1/shipping/estimate?storeId=&subtotal=&city=&postalCode= — buyer-facing estimate
 *
 *   Delivery Zones CRUD:
 *     GET    /v1/shipping/zones?storeId=             — list store's zones
 *     GET    /v1/shipping/zones/:id                  — get single zone
 *     POST   /v1/shipping/zones                      — create zone
 *     PATCH  /v1/shipping/zones/:id                  — update zone
 *     POST   /v1/shipping/zones/:id/deactivate       — soft-deactivate
 *
 *   Zone ↔ Method associations:
 *     GET    /v1/shipping/zones/:zoneId/methods      — methods available in zone
 *     POST   /v1/shipping/zones/:zoneId/methods      — attach method to zone
 *     DELETE /v1/shipping/zones/:zoneId/methods/:methodId — detach method from zone
 *     GET    /v1/shipping/methods/:methodId/zones     — zones that offer this method
 */
@Controller('v1/shipping')
@UseGuards(JwtAuthGuard)
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  // ── Provider listing (M7.2.1) ────────────────────────────────────────

  @Get('providers')
  @RequirePermission('fulfillment:shipments:read')
  async listProviders() {
    const keys = this.shippingService.listProviders();
    const defaultProvider = this.shippingService.getDefaultProvider();
    return {
      providers: keys.map((key) => {
        const provider = this.shippingService.getProvider(key);
        return {
          key: provider.key,
          name: provider.name,
          type: provider.type,
          capabilities: provider.capabilities,
          isDefault: key === defaultProvider.key,
        };
      }),
    };
  }

  // ── Shipping Methods CRUD ────────────────────────────────────────────

  @Get('methods')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:read')
  async listShippingMethods(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId: string,
  ) {
    const methods = await this.shippingService.listShippingMethods(storeId, user);
    return { methods };
  }

  @Get('methods/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:read')
  async getShippingMethod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.shippingService.getShippingMethod(id, user);
  }

  @Post('methods')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  async createShippingMethod(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateShippingMethodInput,
  ) {
    return this.shippingService.createShippingMethod(body, user);
  }

  @Patch('methods/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  async updateShippingMethod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateShippingMethodInput,
  ) {
    return this.shippingService.updateShippingMethod(id, body, user);
  }

  @Post('methods/:id/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  @HttpCode(200)
  async deactivateShippingMethod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.shippingService.deactivateShippingMethod(id, user);
  }

  // ── Shipping Estimate (buyer-facing) ─────────────────────────────────

  @Get('estimate')
  async getShippingEstimate(
    @Query('storeId') storeId: string,
    @Query('subtotal') subtotal: string,
    @Query('city') city?: string,
    @Query('postalCode') postalCode?: string,
    @Query('country') country?: string,
  ) {
    const subtotalMinor = parseInt(subtotal, 10);
    if (isNaN(subtotalMinor) || subtotalMinor < 0) {
      return { storeId, subtotalMinor: 0, currency: 'SAR', deliveryAvailable: true, methods: [] };
    }
    return this.shippingService.getShippingEstimate(
      storeId,
      subtotalMinor,
      { city, postalCode, country },
    );
  }

  // ── Delivery Zones CRUD ──────────────────────────────────────────────

  @Get('zones')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:read')
  async listDeliveryZones(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId: string,
  ) {
    const zones = await this.shippingService.listDeliveryZones(storeId, user);
    return { zones };
  }

  @Get('zones/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:read')
  async getDeliveryZone(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.shippingService.getDeliveryZone(id, user);
  }

  @Post('zones')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  async createDeliveryZone(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateDeliveryZoneInput,
  ) {
    return this.shippingService.createDeliveryZone(body, user);
  }

  @Patch('zones/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  async updateDeliveryZone(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateDeliveryZoneInput,
  ) {
    return this.shippingService.updateDeliveryZone(id, body, user);
  }

  @Post('zones/:id/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  @HttpCode(200)
  async deactivateDeliveryZone(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.shippingService.deactivateDeliveryZone(id, user);
  }

  // ── Zone ↔ Method Associations ───────────────────────────────────────

  @Get('zones/:zoneId/methods')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:read')
  async listMethodsForZone(
    @CurrentUser() user: JwtPayload,
    @Param('zoneId') zoneId: string,
  ) {
    const methods = await this.shippingService.listMethodsForZone(zoneId, user);
    return { methods };
  }

  @Post('zones/:zoneId/methods')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  async attachMethodToZone(
    @CurrentUser() user: JwtPayload,
    @Param('zoneId') zoneId: string,
    @Body() body: { shippingMethodId: string; overrideFeeMinor?: number },
  ) {
    return this.shippingService.attachMethodToZone(
      zoneId,
      body.shippingMethodId,
      body.overrideFeeMinor ?? null,
      user,
    );
  }

  @Delete('zones/:zoneId/methods/:methodId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:write')
  async detachMethodFromZone(
    @CurrentUser() user: JwtPayload,
    @Param('zoneId') zoneId: string,
    @Param('methodId') methodId: string,
  ) {
    return this.shippingService.detachMethodFromZone(zoneId, methodId, user);
  }

  @Get('methods/:methodId/zones')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:shipping:read')
  async listZonesForMethod(
    @CurrentUser() user: JwtPayload,
    @Param('methodId') methodId: string,
  ) {
    const zones = await this.shippingService.listZonesForMethod(methodId, user);
    return { zones };
  }
}
