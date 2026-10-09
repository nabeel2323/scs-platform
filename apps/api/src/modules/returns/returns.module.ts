import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ReturnExpirationWorker } from './return-expiration.worker';

@Module({
  controllers: [ReturnsController],
  providers: [ReturnsService, ReturnExpirationWorker],
  exports: [ReturnsService],
})
export class ReturnsModule {}
