import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { InventoryService, AdjustStockInput, ReserveStockInput, UpdateInventoryInput } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('inventory/warehouse/:warehouseId')
  async listByWarehouse(@Param('warehouseId') warehouseId: string) {
    return this.inventoryService.listByWarehouse(warehouseId);
  }

  @Get('inventory/variant/:variantId')
  async listByVariant(@Param('variantId') variantId: string) {
    return this.inventoryService.listByVariant(variantId);
  }

  @Get('inventory/low-stock')
  async getLowStock(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.getLowStockItems(warehouseId);
  }

  @Patch('inventory/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() input: UpdateInventoryInput,
  ) {
    return this.inventoryService.updateItem(id, input);
  }

  @Post('inventory/adjust')
  async adjustStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: AdjustStockInput,
  ) {
    return this.inventoryService.adjustStock({
      ...input,
      userId: user.sub,
    });
  }

  @Post('inventory/reserve')
  async reserveStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: ReserveStockInput,
  ) {
    return this.inventoryService.reserveStock({
      ...input,
      userId: user.sub,
    });
  }

  @Post('inventory/release')
  async releaseStock(
    @CurrentUser() user: JwtPayload,
    @Body() input: ReserveStockInput,
  ) {
    return this.inventoryService.releaseStock({
      ...input,
      userId: user.sub,
    });
  }

  @Get('inventory/:id/movements')
  async listMovements(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listMovements(id, limit ? parseInt(limit, 10) : 50);
  }
}
