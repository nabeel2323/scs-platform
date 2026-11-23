import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/index';
import { OrdersModule } from '../orders/index';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [ReviewsController, DisputesController],
  providers: [ReviewsService, DisputesService],
  exports: [ReviewsService, DisputesService],
})
export class ReviewsModule {}
