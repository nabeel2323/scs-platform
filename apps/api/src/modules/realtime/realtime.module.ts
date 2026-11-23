import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { DatabaseModule } from '../../common/database/database.module';
import { OrdersModule } from '../orders/index';
import { MerchantModule } from '../merchant/index';

@Global()
@Module({
  imports: [DatabaseModule, OrdersModule, MerchantModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
