import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, TenantDatabaseContextInterceptor],
  exports: [InventoryService],
})
export class InventoryModule {}
