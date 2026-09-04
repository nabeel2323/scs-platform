import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('otp/request')
  async requestOtp(@Body('phone') phone: string) {
    return this.identityService.requestOtp(phone);
  }

  @Post('otp/verify')
  async verifyOtp(
    @Body() body: {
      phone: string;
      otp: string;
      deviceId?: string;
      deviceInfo?: { platform: string; userAgent: string };
    },
  ) {
    return this.identityService.verifyOtp(body.phone, body.otp, body.deviceId, body.deviceInfo);
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
  @UseGuards(JwtAuthGuard)
  async switchOrg(
    @CurrentUser() user: JwtPayload,
    @Body() body: { orgId: string },
  ) {
    return this.identityService.switchOrg(user.sub, body.orgId);
  }

  // ── Dual Authentication Endpoints ─────────────────────────

  /**
   * Login with email and password.
   * Checks device trust and requires OTP if device changed.
   */
  @Post('login/password')
  async loginPassword(
    @Body() body: { email: string; password: string; deviceId: string; deviceInfo?: { platform: string; userAgent: string } },
  ) {
    return this.identityService.loginWithPassword(
      body.email,
      body.password,
      body.deviceId,
      body.deviceInfo,
    );
  }

  /**
   * Pre-flight check for device-based login.
   * Returns whether auto-login is possible or OTP is required.
   */
  @Post('login/device-check')
  async checkDeviceLogin(
    @Body() body: { email: string; deviceId: string },
  ) {
    return this.identityService.checkDeviceLogin(body.email, body.deviceId);
  }
}
