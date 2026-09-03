import { Controller, Post, Body } from '@nestjs/common';
import { IdentityService } from './identity.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('otp/request')
  async requestOtp(@Body('phone') phone: string) {
    return this.identityService.requestOtp(phone);
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: { phone: string; otp: string }) {
    return this.identityService.verifyOtp(body.phone, body.otp);
  }

  @Post('refresh')
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.identityService.refreshToken(refreshToken);
  }

  @Post('logout')
  async logout(@Body('refreshToken') refreshToken: string) {
    return this.identityService.logout(refreshToken);
  }

  @Post('switch-org')
  async switchOrg(@Body() body: { userId: string; orgId: string }) {
    return this.identityService.switchOrg(body.userId, body.orgId);
  }
}
