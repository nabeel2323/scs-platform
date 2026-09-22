import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { InventoryService, AdjustStockInput, ReserveStockInput, UpdateInventoryInput, CreateInventoryItemInput, TransferStockInput } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ── Store-level inventory (literal paths before parameterized) ──

  @Get('stores/:storeId/inventory/export')
  @RequirePermission('merchant:inventory:read')
  async exportInventory(@Param('storeId') storeId: string) {
    return this.inventoryService.exportInventoryCsv(storeId);
  }

  @Get('stores/:storeId/inventory/movements/export')
  @RequirePermission('merchant:inventory:read')
  async exportMovements(@Param('storeId') storeId: string) {
    return this.inventoryService.exportMovementsCsv(storeId);
  }

  @Post('stores/:storeId/inventory/check-low-stock')
  @RequirePermission('merchant:inventory:write')
  async checkLowStock(@Param('storeId') storeId: string) {
    return this.inventoryService.checkAndNotifyLowStock(storeId);
  }

  @Get('stores/:storeId/inventory')
  @RequirePermission('merchant:inventory:read')
  async listByStore(
    @Param('storeId') storeId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 50;
    const off = offset ? parseInt(offset, 10) : 0;
    return this.inventoryService.listByStore(storeId, { limit: lim, offset: off });
  }

  // ── Inventory items ────────────────────────────────────────────

  @Post('inventory')
  @RequirePermission('merchant:inventory:write')
  async createItem(
    @CurrentUser() user: JwtPayload,
    @Body() input: CreateInventoryItemInput,
  ) {
    return this.inventoryService.createItem({ ...input, userId: user.sub }, user);
  }

  // Literal POST paths must precede PATCH/GET :id paths below
  @Post('inventory/bulk-adjust')
  @RequirePermission('merchant:inventory:write')
  async bulkAdjustStock(
    @CurrentUser() user: JwtPayload,
    @Body() body: { items: Array<{ inventoryItemId: string; quantity: number; reason?: string }> },
  ) {
    return this.inventoryService.bulkAdjustStock(body.items, user.sub, user);
  }

  @Post('inventory/transfer')
  @RequirePermission('merchant:inventory:write')
  async transferStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: TransferStockInput,
  ) {
    return this.inventoryService.transferStock({ ...input, userId: user.sub }, user);
  }

  @Get('inventory/warehouse/:warehouseId')
  @RequirePermission('merchant:inventory:read')
  async listByWarehouse(@CurrentUser() user: JwtPayload, @Param('warehouseId') warehouseId: string) {
    return this.inventoryService.listByWarehouse(warehouseId, user);
  }

  @Get('inventory/variant/:variantId')
  @RequirePermission('merchant:inventory:read')
  async listByVariant(@CurrentUser() user: JwtPayload, @Param('variantId') variantId: string) {
    return this.inventoryService.listByVariant(variantId, user);
  }

  @Get('inventory/low-stock')
  @RequirePermission('merchant:inventory:read')
  async getLowStock(@CurrentUser() user: JwtPayload, @Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.getLowStockItems(warehouseId, user);
  }

  @Patch('inventory/:id')
  @RequirePermission('merchant:inventory:write')
  async updateItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: UpdateInventoryInput,
  ) {
    return this.inventoryService.updateItem(id, input, user);
  }

  @Post('inventory/adjust')
  @RequirePermission('merchant:inventory:write')
  async adjustStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: AdjustStockInput,
  ) {
    return this.inventoryService.adjustStock({
      ...input,
      userId: user.sub,
    }, user);
  }

  @Post('inventory/reserve')
  @RequirePermission('merchant:inventory:write')
  async reserveStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: ReserveStockInput,
  ) {
    return this.inventoryService.reserveStock({
      ...input,
      userId: user.sub,
    }, user);
  }

  @Post('inventory/release')
  @RequirePermission('merchant:inventory:write')
  async releaseStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: ReserveStockInput,
  ) {
    return this.inventoryService.releaseStock({
      ...input,
      userId: user.sub,
    }, user);
  }

  @Get('inventory/:id/movements')
  @RequirePermission('merchant:inventory:read')
  async listMovements(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listMovements(id, limit ? parseInt(limit, 10) : 50, user);
  }
}
