import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [PricingController],
  providers: [PricingService, TenantDatabaseContextInterceptor],
  exports: [PricingService],
})
export class PricingModule {}
