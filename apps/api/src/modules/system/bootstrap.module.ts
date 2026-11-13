import { Module } from '@nestjs/common';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';
import { AuditModule } from '../audit/index';
import { RateLimitService } from '../../common/services/rate-limit.service';

@Module({
  imports: [AuditModule],
  controllers: [BootstrapController],
  providers: [BootstrapService, RateLimitService],
})
export class BootstrapModule {}
