import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { NOTIFICATION_REALTIME_EMITTER } from '../notifications/notifications-realtime.port';
import { DatabaseModule } from '../../common/database/database.module';
import { OrdersModule } from '../orders/index';
import { MerchantModule } from '../merchant/index';

@Global()
@Module({
  imports: [DatabaseModule, OrdersModule, MerchantModule],
  providers: [RealtimeGateway, { provide: NOTIFICATION_REALTIME_EMITTER, useExisting: RealtimeGateway }],
  exports: [RealtimeGateway, NOTIFICATION_REALTIME_EMITTER],
})
export class RealtimeModule {}
