import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { CartService, AddCartItemInput } from './cart.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';

@Controller('cart')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantDatabaseContextInterceptor)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.getActiveCartWithItems(user.sub);
  }

  @Post('items')
  @RequirePermission('orders:write')
  async addItem(@CurrentUser() user: JwtPayload, @Body() input: AddCartItemInput) {
    return this.cartService.addItem(user.sub, input);
  }

  @Patch('items/:itemId')
  @RequirePermission('orders:write')
  async updateItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() body: { quantity: number },
  ) {
    return this.cartService.updateItemQuantity(user.sub, itemId, body.quantity);
  }

  @Delete('items/:itemId')
  @RequirePermission('orders:write')
  async removeItem(@CurrentUser() user: JwtPayload, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(user.sub, itemId);
  }

  @Delete()
  @RequirePermission('orders:write')
  async clearCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.clearCart(user.sub);
  }

  /** PHASE 11: Validate offers in cart; re-price stale items. */
  @Post('validate')
  @RequirePermission('orders:write')
  async validateCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.validateCart(user.sub);
  }

  @Delete('promo')
  @RequirePermission('orders:write')
  async removePromo(@CurrentUser() user: JwtPayload) {
    return this.cartService.removePromoCode(user.sub);
  }

  @Post('promo')
  @RequirePermission('orders:write')
  async applyPromo(
    @CurrentUser() user: JwtPayload,
    @Body() body: { promoCode?: string; code?: string; promotionId?: string },
  ) {
    const promoCode = body.promoCode || body.code;
    if (!promoCode) {
      throw new Error('Promo code is required');
    }
    return this.cartService.applyPromoCode(user.sub, promoCode, body.promotionId);
  }
}
