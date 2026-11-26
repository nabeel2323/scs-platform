import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, TenantDatabaseContextInterceptor],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
