import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { CartService, AddCartItemInput } from './cart.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.getActiveCartWithItems(user.sub);
  }

  @Post('items')
  async addItem(
    @CurrentUser() user: JwtPayload,
    @Body() input: AddCartItemInput,
  ) {
    return this.cartService.addItem(user.sub, input);
  }

  @Patch('items/:itemId')
  async updateItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() body: { quantity: number },
  ) {
    return this.cartService.updateItemQuantity(user.sub, itemId, body.quantity);
  }

  @Delete('items/:itemId')
  async removeItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(user.sub, itemId);
  }

  @Delete()
  async clearCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.clearCart(user.sub);
  }

  @Post('promo')
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
