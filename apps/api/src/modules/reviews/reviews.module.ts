import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  controllers: [ReviewsController, DisputesController],
  providers: [ReviewsService, DisputesService],
  exports: [ReviewsService, DisputesService],
})
export class ReviewsModule {}
