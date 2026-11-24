import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/index';
import { OrdersModule } from '../orders/index';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';

@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [ReviewsController, DisputesController],
  providers: [ReviewsService, DisputesService, TenantDatabaseContextInterceptor],
  exports: [ReviewsService, DisputesService],
})
export class ReviewsModule {}
