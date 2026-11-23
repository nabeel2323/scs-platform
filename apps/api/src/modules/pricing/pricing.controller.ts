import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  PricingService,
  CreatePriceListInput,
  UpdatePriceListInput,
  CreateTierInput,
  UpdateTierInput,
} from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';
import { DatabaseService } from '../../common/database/database.service';
import { assertStoreInOrg, assertStoreMember, type CallerContext } from '../../common/tenant-scope';
import { CatalogService } from '../catalog/index';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly db: DatabaseService,
    private readonly catalogService: CatalogService,
  ) {}

  private caller(user: JwtPayload): CallerContext {
    return { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
  }

  private async assertStoreAccess(user: JwtPayload, storeId: string): Promise<void> {
    const caller = this.caller(user);
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
  }

  private async assertPriceListAccess(user: JwtPayload, priceListId: string) {
    const list = await this.pricingService.getPriceList(priceListId);
    await this.assertStoreAccess(user, list.storeId);
    return list;
  }

  private async assertVariantStoreAccess(user: JwtPayload, variantId: string): Promise<string> {
    const storeId = await this.catalogService.getVariantStoreId(variantId);
    if (!storeId) throw new ForbiddenException('You do not have access to this variant');

    await this.assertStoreAccess(user, storeId);
    return storeId;
  }

  // ── Price Lists ──────────────────────────────────────────────

  @Post('price-lists')
  @RequirePermission('merchant:pricing:write')
  async createPriceList(@CurrentUser() user: JwtPayload, @Body() input: CreatePriceListInput) {
    await this.assertStoreAccess(user, input.storeId);
    return this.pricingService.createPriceList(input);
  }

  @Get('stores/:storeId/price-lists')
  @RequirePermission('merchant:pricing:read')
  async listPriceLists(@CurrentUser() user: JwtPayload, @Param('storeId') storeId: string) {
    await this.assertStoreAccess(user, storeId);
    return this.pricingService.listPriceListsByStore(storeId);
  }

  @Get('price-lists/:id')
  @RequirePermission('merchant:pricing:read')
  async getPriceList(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.assertPriceListAccess(user, id);
    return this.pricingService.getPriceList(id);
  }

  @Patch('price-lists/:id')
  @RequirePermission('merchant:pricing:write')
  async updatePriceList(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: UpdatePriceListInput,
  ) {
    await this.assertPriceListAccess(user, id);
    return this.pricingService.updatePriceList(id, input);
  }

  // ── Price Tiers ──────────────────────────────────────────────

  @Post('price-lists/:priceListId/tiers')
  @RequirePermission('merchant:pricing:write')
  async addTier(
    @CurrentUser() user: JwtPayload,
    @Param('priceListId') priceListId: string,
    @Body() input: CreateTierInput,
  ) {
    const list = await this.assertPriceListAccess(user, priceListId);
    const variantStoreId = await this.assertVariantStoreAccess(user, input.variantId);
    if (variantStoreId !== list.storeId) {
      throw new ForbiddenException('The variant does not belong to this price list store');
    }
    return this.pricingService.addTier(priceListId, input);
  }

  @Get('price-lists/:priceListId/tiers')
  @RequirePermission('merchant:pricing:read')
  async listTiers(@CurrentUser() user: JwtPayload, @Param('priceListId') priceListId: string) {
    await this.assertPriceListAccess(user, priceListId);
    return this.pricingService.listTiersByPriceList(priceListId);
  }

  @Get('variants/:variantId/pricing')
  @RequirePermission('merchant:pricing:read')
  async getProductPricing(
    @CurrentUser() user: JwtPayload,
    @Param('variantId') variantId: string,
    @Query('storeId') storeId?: string,
  ) {
    const variantStoreId = await this.assertVariantStoreAccess(user, variantId);
    if (storeId && storeId !== variantStoreId) {
      throw new ForbiddenException('The variant does not belong to the requested store');
    }
    if (storeId) {
      return this.pricingService.getProductPricing(variantId, storeId);
    }
    return this.pricingService.listTiersByVariant(variantId, undefined, variantStoreId);
  }

  @Patch('tiers/:id')
  @RequirePermission('merchant:pricing:write')
  async updateTier(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: UpdateTierInput,
  ) {
    const tier = await this.pricingService.getTier(id);
    const list = await this.assertPriceListAccess(user, tier.priceListId);
    const variantStoreId = await this.assertVariantStoreAccess(user, tier.variantId);
    if (variantStoreId !== list.storeId) {
      throw new ForbiddenException('The tier variant does not belong to its price list store');
    }
    return this.pricingService.updateTier(id, input);
  }

  @Delete('tiers/:id')
  @RequirePermission('merchant:pricing:write')
  async removeTier(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const tier = await this.pricingService.getTier(id);
    const list = await this.assertPriceListAccess(user, tier.priceListId);
    const variantStoreId = await this.assertVariantStoreAccess(user, tier.variantId);
    if (variantStoreId !== list.storeId) {
      throw new ForbiddenException('The tier variant does not belong to its price list store');
    }
    return this.pricingService.removeTier(id);
  }

  // ── Price Resolution ─────────────────────────────────────────

  @Get('resolve-price')
  @RequirePermission('merchant:pricing:read')
  async resolvePrice(
    @CurrentUser() user: JwtPayload,
    @Query('variantId') variantId: string,
    @Query('priceListId') priceListId: string,
    @Query('qty') qty: string,
  ) {
    const list = await this.assertPriceListAccess(user, priceListId);
    const variantStoreId = await this.assertVariantStoreAccess(user, variantId);
    if (variantStoreId !== list.storeId) {
      throw new ForbiddenException('The variant does not belong to this price list store');
    }
    return this.pricingService.resolvePrice(variantId, priceListId, parseInt(qty, 10));
  }
}
