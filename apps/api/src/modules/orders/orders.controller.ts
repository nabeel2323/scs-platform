import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { OrdersService, CheckoutInput, ItemConfirmation } from './orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ── Checkout ─────────────────────────────────────────────────

  @Post('checkout')
  async checkout(
    @CurrentUser() user: JwtPayload,
    @Body() input: CheckoutInput,
  ) {
    return this.ordersService.checkout({
      ...input,
      buyerId: user.sub,
    });
  }

  // ── Master Orders ────────────────────────────────────────────

  @Get('orders/master/:id')
  async getMasterOrder(@Param('id') id: string) {
    return this.ordersService.getMasterOrder(id);
  }

  @Post('orders/master/:id/reorder')
  async reorder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.ordersService.reorder(id, user.sub);
  }

  // ── Sub-Orders ───────────────────────────────────────────────

  @Get('orders')
  async listOrders(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    // Buyer sees own orders; merchant sees store orders
    const buyerId = storeId ? undefined : user.sub;
    return this.ordersService.listOrders(buyerId, storeId, status);
  }

  @Get('orders/:id')
  async getOrder(@Param('id') id: string) {
    return this.ordersService.getOrderWithItems(id);
  }

  @Get('orders/:id/history')
  async getStatusHistory(@Param('id') id: string) {
    return this.ordersService.getStatusHistory(id);
  }

  // ── Merchant Actions ─────────────────────────────────────────

  @Post('orders/:id/accept')
  async acceptOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.ordersService.acceptOrder(id, user.sub);
  }

  @Post('orders/:id/partial-accept')
  async partiallyAcceptOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { confirmations: ItemConfirmation[] },
  ) {
    return this.ordersService.partiallyAcceptOrder(id, user.sub, body.confirmations);
  }

  @Post('orders/:id/reject')
  async rejectOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.ordersService.rejectOrder(id, user.sub, body.reason);
  }

  @Post('orders/:id/items/:itemId/confirm')
  async confirmItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() body: { qtyConfirmed: number },
  ) {
    return this.ordersService.confirmItem(orderId, itemId, body.qtyConfirmed, user.sub);
  }

  // ── Status Transitions ───────────────────────────────────────

  @Post('orders/:id/status')
  async transitionStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
  ) {
    return this.ordersService.transitionStatus(
      id,
      body.status,
      user.sub,
      user.role || 'SYSTEM',
      body.reason,
    );
  }

  @Post('orders/:id/cancel')
  async cancelOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.ordersService.cancelOrder(id, user.sub, body.reason);
  }
}
