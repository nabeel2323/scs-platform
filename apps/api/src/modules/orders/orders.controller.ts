import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersService, CheckoutInput, ItemConfirmation } from './orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ── Checkout ─────────────────────────────────────────────────

  @Post('checkout')
  @UseGuards(PermissionsGuard)
  @RequirePermission('orders:write')
  async checkout(@CurrentUser() user: JwtPayload, @Body() input: CheckoutInput) {
    return this.ordersService.checkout({
      ...input,
      buyerId: user.sub,
    });
  }

  // ── Master Orders ────────────────────────────────────────────

  @Get('orders/master/:id')
  async getMasterOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.getMasterOrder(id, user);
  }

  @Post('orders/master/:id/reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermission('orders:write')
  async reorder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
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
    return this.ordersService.listOrders(buyerId, storeId, status, user);
  }

  @Get('orders/:id')
  async getOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.getOrderWithItems(id, user);
  }

  @Get('orders/:id/history')
  async getStatusHistory(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.getStatusHistory(id, user);
  }

  // ── Merchant Actions ─────────────────────────────────────────

  @Post('orders/:id/accept')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async acceptOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ordersService.acceptOrder(id, user.sub, user);
  }

  @Post('orders/:id/partial-accept')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async partiallyAcceptOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { confirmations: ItemConfirmation[] },
  ) {
    return this.ordersService.partiallyAcceptOrder(id, user.sub, body.confirmations, user);
  }

  @Post('orders/:id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async rejectOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.ordersService.rejectOrder(id, user.sub, body.reason, user);
  }

  @Post('orders/:id/items/:itemId/confirm')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async confirmItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() body: { qtyConfirmed: number },
  ) {
    return this.ordersService.confirmItem(orderId, itemId, body.qtyConfirmed, user.sub, user);
  }

  // ── Status Transitions ───────────────────────────────────────

  @Post('orders/:id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
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
      user,
    );
  }

  @Post('orders/:id/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermission('orders:cancel')
  async cancelOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.ordersService.cancelOrder(id, user.sub, body.reason, user);
  }
}
