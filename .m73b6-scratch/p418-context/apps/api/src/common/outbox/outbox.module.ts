import { Module, Global } from '@nestjs/common';
import { OutboxDispatcher } from './outbox-dispatcher.service';

@Global()
@Module({
  providers: [OutboxDispatcher],
  exports: [OutboxDispatcher],
})
export class OutboxModule {}
