import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OtpDeliveryService } from './otp-delivery.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, OtpDeliveryService],
  exports: [NotificationsService, OtpDeliveryService],
})
export class NotificationsModule {}
