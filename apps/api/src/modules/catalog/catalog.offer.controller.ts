import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  CatalogOfferService,
  CreateOfferInput,
  UpdateOfferPricingInput,
} from './catalog.offer.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/guards/current-user.decorator';

/**
 * Merchant Offer API — canonical-product multi-seller offers (§ Merchant Offer).
 *
 * Merchants create/propose offers on canonical products; platform admins govern
 * the lifecycle (approve/reject/suspend/activate). The offer owns the commercial
 * terms (price/stock/MOQ/lead-time/availability) and links to the store's price
 * book and warehouse by reference, realising the "offers fully absorb pricing"
 * decision without destroying the existing price_lists/price_tiers/inventory_items
 * data.
 *
 * Read routes are authenticated but not permission-gated (any buyer/merchant can
 * see offers on a canonical product). Write routes require the offer permission
 * keys; literal routes precede parameterized siblings sharing a prefix.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CatalogOfferController {
  constructor(private readonly offerService: CatalogOfferService) {}

  // ── Read routes ───────────────────────────────────────────────

  @Get('products/:productId/offers')
  listOffersForProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('status') status?: string,
  ) {
    return this.offerService.listOffersForProduct(productId, {
      status: status as never,
    });
  }

  /**
   * PHASE 22: Buyer-facing "most popular seller" ranking for a canonical
   * product. Different segment count from the sibling above so the NestJS
   * literal-vs-parameterised invariant does not apply, but declared together
   * for discoverability.
   */
  @Get('products/:productId/offers/ranked')
  listOffersForProductRanked(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.offerService.listOffersForProductRanked(productId);
  }

  @Get('merchant/offers')
  listMerchantOffers(@Query('storeId') storeId?: string) {
    if (!storeId) return [];
    return this.offerService.listOffersForStore(storeId);
  }

  /**
   * PHASE 18: Time-series trend per offer (or store-wide). Declared before the
   * parent `analytics` route so a stricter prefix cannot shadow it.
   */
  @Get('merchant/offers/analytics/trend')
  async listMerchantOfferTrend(
    @Query('storeId') storeId?: string,
    @Query('offerId') offerId?: string,
    @Query('granularity') granularity?: string,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    if (!storeId) return [];
    const gran: 'day' | 'week' = granularity === 'week' ? 'week' : 'day';
    // Range semantics: explicit `from` (ISO date) wins; else derive a rolling
    // window from `days` (default 90, capped 365). `to` is always "now".
    const now = new Date();
    let fromDt: Date | undefined;
    if (from && /^\d{4}-\d{2}-\d{2}/.test(from)) {
      fromDt = new Date(from);
    } else {
      const raw = Number(days ?? 90);
      const span = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 90;
      fromDt = new Date(now.getTime() - span * 24 * 60 * 60 * 1000);
    }
    return this.offerService.listOfferTrend({
      storeId,
      offerId: offerId || undefined,
      granularity: gran,
      from: fromDt,
      to: now,
    });
  }

  /**
   * PHASE 16: Per-offer sales analytics for a store (orders, units, revenue).
   * Declared before any potential `merchant/offers/:id` sibling to respect the
   * NestJS literal-before-parameterized ordering invariant.
   */
  @Get('merchant/offers/analytics')
  listMerchantOfferAnalytics(@Query('storeId') storeId?: string) {
    if (!storeId) return [];
    return this.offerService.listOfferAnalytics(storeId);
  }

  @Get('offers/:id')
  getOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerService.getOffer(id);
  }

  // ── Merchant write routes ─────────────────────────────────────

  @Post('merchant/offers')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  createOffer(@Body() input: CreateOfferInput) {
    return this.offerService.createOffer(input);
  }

  @Post('merchant/offers/:id/propose')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  proposeOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { proposedBy?: string },
  ) {
    return this.offerService.proposeOffer(id, body.proposedBy);
  }

  @Patch('merchant/offers/:id/pricing')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  updateOfferPricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateOfferPricingInput,
  ) {
    return this.offerService.updateOfferPricing(id, input);
  }

  @Post('merchant/offers/:id/withdraw')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:write')
  withdrawOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerService.withdrawOffer(id);
  }

  // ── Admin governance routes ───────────────────────────────────

  @Post('admin/offers/:id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:govern')
  approveOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reviewerId: string },
  ) {
    return this.offerService.approveOffer(id, body.reviewerId);
  }

  @Post('admin/offers/:id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:govern')
  rejectOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reviewerId: string; reason: string },
  ) {
    return this.offerService.rejectOffer(id, body.reviewerId, body.reason);
  }

  @Post('admin/offers/:id/suspend')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:govern')
  suspendOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerService.suspendOffer(id);
  }

  @Post('admin/offers/:id/activate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:offers:govern')
  reactivateOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerService.reactivateOffer(id);
  }
}
