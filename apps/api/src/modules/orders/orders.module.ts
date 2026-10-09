import { Module, forwardRef } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PaymentsModule } from '../payments/payments.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AutoCompleteWorker } from './auto-complete.worker';

@Module({
  imports: [PromotionsModule, NotificationsModule, forwardRef(() => ShippingModule), PaymentsModule],
  controllers: [CartController, OrdersController],
  providers: [CartService, OrdersService, AutoCompleteWorker],
  exports: [CartService, OrdersService],
})
export class OrdersModule {}
