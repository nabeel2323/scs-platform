import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
