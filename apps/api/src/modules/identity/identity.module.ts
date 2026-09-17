import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service';
import { AuthController } from './auth.controller';
import { ProfileController } from './profile.controller';
import { OrganizationsController, RolesController } from './organizations.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/index';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { resolveJwtAccessSecret } from '../../config/env-gate';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      // Resolved through the production config gate (API-B7): falls back to the
      // dev default only in development/test, and throws outside dev when
      // JWT_ACCESS_SECRET is missing, weak, or still the well-known default.
      secret: resolveJwtAccessSecret({
        nodeEnv: process.env['NODE_ENV'],
        accessSecret: process.env['JWT_ACCESS_SECRET'],
      }),
      signOptions: { expiresIn: '15m' },
    }),
    NotificationsModule,
    CatalogModule,
    AuditModule,
  ],
  controllers: [AuthController, ProfileController, OrganizationsController, RolesController],
  providers: [IdentityService, RateLimitService],
  exports: [IdentityService],
})
export class IdentityModule {}
