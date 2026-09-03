import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service';
import { AuthController } from './auth.controller';
import { ProfileController } from './profile.controller';
import { OrganizationsController } from './organizations.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env['JWT_ACCESS_SECRET'] || 'dev-secret-change-me-min-16-chars!!',
      signOptions: { expiresIn: '15m' },
    }),
    NotificationsModule,
  ],
  controllers: [AuthController, ProfileController, OrganizationsController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
