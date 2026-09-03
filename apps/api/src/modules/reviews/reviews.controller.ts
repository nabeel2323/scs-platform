import {
  Controller, Get, Post, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ReviewsService, CreateReviewInput } from './reviews.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('orders/:orderId/review')
  async createReview(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() input: Omit<CreateReviewInput, 'orderId' | 'reviewerId'>,
  ) {
    return this.reviewsService.createReview({
      ...input,
      orderId,
      reviewerId: user.sub,
    });
  }

  @Get('stores/:storeId/reviews')
  async getStoreReviews(@Param('storeId') storeId: string) {
    return this.reviewsService.getReviewsBySubject(storeId, 'STORE');
  }

  @Get('orders/:orderId/reviews')
  async getOrderReviews(@Param('orderId') orderId: string) {
    return this.reviewsService.getReviewsByOrder(orderId);
  }

  @Get('reviews/:id')
  async getReview(@Param('id') id: string) {
    return this.reviewsService.getReview(id);
  }

  @Get('trust/:entityType/:entityId')
  async getTrust(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.reviewsService.getTrustSnapshot(entityId, entityType);
  }
}
