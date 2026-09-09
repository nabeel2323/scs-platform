import { Module } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PromotionsModule],
  controllers: [CartController, OrdersController],
  providers: [CartService, OrdersService],
  exports: [CartService, OrdersService],
})
export class OrdersModule {}
