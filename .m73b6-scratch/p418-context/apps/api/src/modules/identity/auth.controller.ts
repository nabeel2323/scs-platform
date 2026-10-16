import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';
import {
  RequestOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  SwitchOrgDto,
  LoginPasswordDto,
  DeviceCheckDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('otp/request')
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.identityService.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    // Inline structural type, not express's Request: with
    // emitDecoratorMetadata a decorated param type is emitted as a runtime
    // value, and `express` is not a direct dependency of this package.
    @Req() req: { ip?: string; get(name: string): string | undefined },
  ) {
    return this.identityService.verifyOtp(dto.phone, dto.otp, dto.deviceId, dto.deviceInfo, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('refresh')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.identityService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    return this.identityService.logout(dto.refreshToken);
  }

  @Post('switch-org')
  @UseGuards(JwtAuthGuard)
  async switchOrg(@CurrentUser() user: JwtPayload, @Body() dto: SwitchOrgDto) {
    // Carry the current session id so the re-minted token keeps its `sid` claim
    // (WEB-B3), and pass the presenting token's jti/exp so switchOrg can revoke
    // it (API-B9), closing the stale-permission window on the old token.
    return this.identityService.switchOrg(user.sub, dto.orgId, user.sid, {
      jti: user.jti,
      exp: user.exp,
    });
  }

  // ── Dual Authentication Endpoints ─────────────────────────

  /**
   * Login with email and password.
   * Checks device trust and requires OTP if device changed.
   */
  @Post('login/password')
  async loginPassword(
    @Body() dto: LoginPasswordDto,
    @Req() req: { ip?: string; get(name: string): string | undefined },
  ) {
    return this.identityService.loginWithPassword(
      dto.email,
      dto.password,
      dto.deviceId,
      dto.deviceInfo,
      { ip: req.ip, userAgent: req.get('user-agent') },
    );
  }

  /**
   * Pre-flight check for device-based login.
   * Returns whether auto-login is possible or OTP is required.
   */
  @Post('login/device-check')
  async checkDeviceLogin(@Body() dto: DeviceCheckDto) {
    return this.identityService.checkDeviceLogin(dto.email, dto.deviceId);
  }
}
