import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { PricingService, CreatePriceListInput, UpdatePriceListInput, CreateTierInput, UpdateTierInput } from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  // ── Price Lists ──────────────────────────────────────────────

  @Post('price-lists')
  async createPriceList(@Body() input: CreatePriceListInput) {
    return this.pricingService.createPriceList(input);
  }

  @Get('stores/:storeId/price-lists')
  async listPriceLists(@Param('storeId') storeId: string) {
    return this.pricingService.listPriceListsByStore(storeId);
  }

  @Get('price-lists/:id')
  async getPriceList(@Param('id') id: string) {
    return this.pricingService.getPriceList(id);
  }

  @Patch('price-lists/:id')
  async updatePriceList(
    @Param('id') id: string,
    @Body() input: UpdatePriceListInput,
  ) {
    return this.pricingService.updatePriceList(id, input);
  }

  // ── Price Tiers ──────────────────────────────────────────────

  @Post('price-lists/:priceListId/tiers')
  async addTier(
    @Param('priceListId') priceListId: string,
    @Body() input: CreateTierInput,
  ) {
    return this.pricingService.addTier(priceListId, input);
  }

  @Get('price-lists/:priceListId/tiers')
  async listTiers(@Param('priceListId') priceListId: string) {
    return this.pricingService.listTiersByPriceList(priceListId);
  }

  @Get('variants/:variantId/pricing')
  async getProductPricing(
    @Param('variantId') variantId: string,
    @Query('storeId') storeId?: string,
  ) {
    if (storeId) {
      return this.pricingService.getProductPricing(variantId, storeId);
    }
    return this.pricingService.listTiersByVariant(variantId);
  }

  @Patch('tiers/:id')
  async updateTier(
    @Param('id') id: string,
    @Body() input: UpdateTierInput,
  ) {
    return this.pricingService.updateTier(id, input);
  }

  @Delete('tiers/:id')
  async removeTier(@Param('id') id: string) {
    return this.pricingService.removeTier(id);
  }

  // ── Price Resolution ─────────────────────────────────────────

  @Get('resolve-price')
  async resolvePrice(
    @Query('variantId') variantId: string,
    @Query('priceListId') priceListId: string,
    @Query('qty') qty: string,
  ) {
    return this.pricingService.resolvePrice(variantId, priceListId, parseInt(qty, 10));
  }
}
