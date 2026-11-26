import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  PromotionsService,
  CreatePromotionInput,
  UpdatePromotionInput,
} from './promotions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import type { CallerContext } from '../../common/tenant-scope';

@Controller()
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantDatabaseContextInterceptor)
export class PromotionsController {
  private caller(user: JwtPayload): CallerContext {
    return { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
  }

  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('promotions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:promotions:write')
  async createPromotion(@CurrentUser() user: JwtPayload, @Body() input: CreatePromotionInput) {
    return this.promotionsService.createPromotion(input, this.caller(user));
  }

  @Get('stores/:storeId/promotions')
  async listByStore(@CurrentUser() user: JwtPayload, @Param('storeId') storeId: string) {
    return this.promotionsService.listByStore(storeId, this.caller(user));
  }

  @Get('stores/:storeId/promotions/active')
  async listActive(@Param('storeId') storeId: string) {
    return this.promotionsService.listActive(storeId);
  }

  @Get('promotions/:id')
  async getPromotion(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promotionsService.getPromotion(id, this.caller(user));
  }

  @Patch('promotions/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:promotions:write')
  async updatePromotion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: UpdatePromotionInput,
  ) {
    return this.promotionsService.updatePromotion(id, input, this.caller(user));
  }

  @Get('stores/:storeId/promotions/validate')
  async validateCode(
    @CurrentUser() user: JwtPayload,
    @Param('storeId') storeId: string,
    @Query('code') code: string,
  ) {
    const promo = await this.promotionsService.findByCode(storeId, code, this.caller(user));
    return {
      valid: true,
      promoType: promo['promoType'],
      discountValue: promo['discountValue'],
      minOrderMinor: promo['minOrderMinor'],
      maxDiscountMinor: promo['maxDiscountMinor'],
    };
  }

  /**
   * GET /v1/offers/nearby — active promotions within radius.
   * Note: PostGIS distance query requires PostGIS extension.
   * Fallback: returns all active promotions across stores.
   */
  @Get('offers/nearby')
  async getNearbyOffers(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    return this.promotionsService.listNearbyOffers({
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radiusKm: radiusKm ? parseFloat(radiusKm) : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }
}
