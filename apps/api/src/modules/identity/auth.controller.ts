import { Controller, Post, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
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
  EmailOtpRequestDto,
  EmailOtpVerifyDto,
  LinkEmailDto,
  LinkPhoneDto,
} from './dto/auth.dto';

/**
 * Minimum wall-clock time an email-OTP endpoint occupies before answering
 * (S1.35 Step 9: "add minimum response time padding to prevent timing-based
 * enumeration"). Applied to success and failure paths alike, so neither the
 * elapsed time nor which error surfaced discloses whether an address exists.
 */
const EMAIL_OTP_MIN_RESPONSE_MS = 250;

@Controller('auth')
export class AuthController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * Hold the response until at least EMAIL_OTP_MIN_RESPONSE_MS has elapsed.
   * Runs in a `finally`, so it pads rejected requests too.
   */
  private async withOtpTimingFloor<T>(startedAt: number, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < EMAIL_OTP_MIN_RESPONSE_MS) {
        await new Promise((resolve) => setTimeout(resolve, EMAIL_OTP_MIN_RESPONSE_MS - elapsed));
      }
    }
  }

  /**
   * Phase 1 kill switch. Every endpoint the email-first identity work added is
   * gated, not just the two OTP endpoints: with the flag off, attaching or
   * detaching an identifier is unavailable too (S1.37 audit — the four
   * account/* routes previously ignored the flag entirely).
   */
  private async assertEmailIdentityEnabled(): Promise<void> {
    const enabled = await this.identityService.isEmailOtpEnabled();
    if (!enabled) throw new NotFoundException();
  }

  @Post('otp/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-request': {} })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.identityService.requestOtp(dto.phone, dto.channel || 'sms');
  }

  @Post('otp/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-verify': {} })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: { ip?: string; get(name: string): string | undefined },
  ) {
    return this.identityService.verifyOtp(dto.phone, dto.otp, dto.deviceId, dto.deviceInfo, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  // ── Email OTP Endpoints (S1.35 Phase 1) ────────────────────

  @Post('otp/email/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-request': {} })
  async requestEmailOtp(
    @Body() dto: EmailOtpRequestDto,
    @Req() req: { ip?: string },
  ) {
    const startedAt = Date.now();
    return this.withOtpTimingFloor(startedAt, async () => {
      await this.assertEmailIdentityEnabled();
      return this.identityService.requestEmailOtp(dto.email, req.ip);
    });
  }

  @Post('otp/email/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-verify': {} })
  async verifyEmailOtp(
    @Body() dto: EmailOtpVerifyDto,
    @Req() req: { ip?: string; get(name: string): string | undefined },
  ) {
    const startedAt = Date.now();
    return this.withOtpTimingFloor(startedAt, async () => {
      await this.assertEmailIdentityEnabled();
      return this.identityService.verifyEmailOtp(
        dto.email, dto.otp, dto.deviceId, dto.deviceInfo,
        { ip: req.ip, userAgent: req.get('user-agent') },
      );
    });
  }

  // ── Account Linking Endpoints (S1.35 Phase 1) ──────────────

  @Post('account/link-email')
  @UseGuards(JwtAuthGuard)
  async linkEmail(@CurrentUser() user: JwtPayload, @Body() dto: LinkEmailDto) {
    await this.assertEmailIdentityEnabled();
    return this.identityService.linkEmailToAccount(user.sub, dto.email, dto.otp);
  }

  @Post('account/link-phone')
  @UseGuards(JwtAuthGuard)
  async linkPhone(@CurrentUser() user: JwtPayload, @Body() dto: LinkPhoneDto) {
    await this.assertEmailIdentityEnabled();
    return this.identityService.linkPhoneToAccount(user.sub, dto.phone, dto.otp);
  }

  @Post('account/unlink-email')
  @UseGuards(JwtAuthGuard)
  async unlinkEmail(@CurrentUser() user: JwtPayload) {
    await this.assertEmailIdentityEnabled();
    return this.identityService.unlinkEmailFromAccount(user.sub);
  }

  @Post('account/unlink-phone')
  @UseGuards(JwtAuthGuard)
  async unlinkPhone(@CurrentUser() user: JwtPayload) {
    await this.assertEmailIdentityEnabled();
    return this.identityService.unlinkPhoneFromAccount(user.sub);
  }

  // ── Existing Endpoints ─────────────────────────────────────

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
    return this.identityService.switchOrg(user.sub, dto.orgId, user.sid, {
      jti: user.jti,
      exp: user.exp,
    });
  }

  // ── Dual Authentication Endpoints ─────────────────────────

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

  @Post('login/device-check')
  async checkDeviceLogin(@Body() dto: DeviceCheckDto) {
    return this.identityService.checkDeviceLogin(dto.email, dto.deviceId);
  }
}
