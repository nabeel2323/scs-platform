import { Module, forwardRef } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PaymentsModule } from '../payments/payments.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import { AutoCompleteWorker } from './auto-complete.worker';
import { OrderRealtimeAccessService } from './order-realtime-access.service';

@Module({
  imports: [
    PromotionsModule,
    NotificationsModule,
    forwardRef(() => ShippingModule),
    PaymentsModule,
  ],
  controllers: [CartController, OrdersController],
  providers: [TenantDatabaseContextInterceptor, CartService, OrdersService, AutoCompleteWorker, OrderRealtimeAccessService],
  exports: [CartService, OrdersService, OrderRealtimeAccessService],
})
export class OrdersModule {}
