import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env['JWT_ACCESS_SECRET'] || 'dev-secret-change-me-min-16-chars!!',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
