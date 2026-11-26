import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService, TenantDatabaseContextInterceptor],
  exports: [PromotionsService],
})
export class PromotionsModule {}
