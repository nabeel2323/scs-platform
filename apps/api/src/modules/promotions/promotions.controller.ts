import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { PromotionsService, CreatePromotionInput, UpdatePromotionInput } from './promotions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('promotions')
  async createPromotion(@Body() input: CreatePromotionInput) {
    return this.promotionsService.createPromotion(input);
  }

  @Get('stores/:storeId/promotions')
  async listByStore(@Param('storeId') storeId: string) {
    return this.promotionsService.listByStore(storeId);
  }

  @Get('stores/:storeId/promotions/active')
  async listActive(@Param('storeId') storeId: string) {
    return this.promotionsService.listActive(storeId);
  }

  @Get('promotions/:id')
  async getPromotion(@Param('id') id: string) {
    return this.promotionsService.getPromotion(id);
  }

  @Patch('promotions/:id')
  async updatePromotion(
    @Param('id') id: string,
    @Body() input: UpdatePromotionInput,
  ) {
    return this.promotionsService.updatePromotion(id, input);
  }

  @Get('stores/:storeId/promotions/validate')
  async validateCode(
    @Param('storeId') storeId: string,
    @Query('code') code: string,
  ) {
    const promo = await this.promotionsService.findByCode(storeId, code);
    return {
      valid: true,
      promoType: promo['promoType'],
      discountValue: promo['discountValue'],
      minOrderMinor: promo['minOrderMinor'],
      maxDiscountMinor: promo['maxDiscountMinor'],
    };
  }
}
