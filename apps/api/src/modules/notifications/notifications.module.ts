import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OtpDeliveryService } from './otp-delivery.service';
import { ProviderRegistryService } from './provider-registry.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, OtpDeliveryService, ProviderRegistryService, TenantDatabaseContextInterceptor],
  exports: [NotificationsService, OtpDeliveryService, ProviderRegistryService],
})
export class NotificationsModule {}
