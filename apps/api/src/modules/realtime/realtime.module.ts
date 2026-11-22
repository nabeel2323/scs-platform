import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { DatabaseModule } from '../../common/database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
