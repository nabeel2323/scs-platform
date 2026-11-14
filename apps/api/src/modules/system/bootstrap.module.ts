import { Module } from '@nestjs/common';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';
import { AuditModule } from '../audit/index';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [AuditModule, NotificationsModule, RedisModule],
  controllers: [BootstrapController],
  providers: [BootstrapService, RateLimitService],
})
export class BootstrapModule {}
