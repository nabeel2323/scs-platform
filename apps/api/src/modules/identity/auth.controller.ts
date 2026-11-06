import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';
import {
  applyDeviceTrustCookie,
  readPresentedDeviceCredential,
  resolveDeviceTrustCookieConfig,
  type CookieBearingRequest,
  type CookieBearingResponse,
  type DeviceTrustTransportInstruction,
} from '../../common/auth/device-trust-cookie';
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

/** Any auth result that may carry a device-trust instruction for the response. */
type TrustBearingResult = { deviceTrust?: DeviceTrustTransportInstruction };

/**
 * The request shape the auth routes need: client IP for audit, a header getter
 * for the user agent, and the raw headers so the device-trust cookie and its
 * same-origin proof can be read. Express's `Request` satisfies this structurally.
 */
interface AuthRequest extends CookieBearingRequest {
  ip?: string;
  get(name: string): string | undefined;
}

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
   * Cookie attributes, resolved per response from the environment.
   *
   * Resolution is pure and cheap (two string comparisons), and doing it here
   * rather than caching it at construction means a misconfiguration still
   * throws — `main.ts` performs the identical call during bootstrap so the
   * process refuses to start with an invalid combination, and a test can vary
   * the attributes without rebuilding the controller.
   */
  private get deviceTrustCookieConfig() {
    return resolveDeviceTrustCookieConfig({
      nodeEnv: process.env['NODE_ENV'],
      sameSite: process.env['DEVICE_TRUST_COOKIE_SAME_SITE'],
      secure: process.env['DEVICE_TRUST_COOKIE_SECURE'],
    });
  }

  /**
   * Move a device credential from the service result into `Set-Cookie`.
   *
   * This is the only place the secret is allowed to leave the process, and it
   * leaves as a cookie attribute — never as JSON. Deleting the field before the
   * body is serialized is what makes "HttpOnly" true in practice: if the value
   * also appeared in the response body, any XSS or any logging of responses
   * would recover a permanent second-factor bypass.
   */
  private transportDeviceTrust(
    res: CookieBearingResponse | undefined,
    result: TrustBearingResult | undefined,
  ): void {
    if (!result || result.deviceTrust === undefined) return;
    const instruction = result.deviceTrust;
    delete result.deviceTrust;
    if (!res) return;
    applyDeviceTrustCookie(res, instruction, this.deviceTrustCookieConfig);
  }

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
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res?: CookieBearingResponse,
  ) {
    // A verified OTP is the second factor, so this response enrols the browser:
    // the service mints the credential and it is installed as a cookie here.
    const result = await this.identityService.verifyOtp(
      dto.phone,
      dto.otp,
      dto.deviceId,
      dto.deviceInfo,
      { ip: req.ip, userAgent: req.get('user-agent') },
    );
    this.transportDeviceTrust(res, result);
    return result;
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
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res?: CookieBearingResponse,
  ) {
    const startedAt = Date.now();
    const result = await this.withOtpTimingFloor(startedAt, async () => {
      await this.assertEmailIdentityEnabled();
      return this.identityService.verifyEmailOtp(
        dto.email, dto.otp, dto.deviceId, dto.deviceInfo,
        { ip: req.ip, userAgent: req.get('user-agent') },
      );
    });
    this.transportDeviceTrust(res, result);
    return result;
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
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res?: CookieBearingResponse,
  ) {
    // Device trust must survive rotation: a 15-minute access-token refresh on
    // an already-trusted device that answered nothing about the cookie would
    // otherwise silently degrade the browser back to "untrusted" and produce an
    // OTP prompt at the next login. The credential is validated, slid and
    // re-issued here so the two clocks stay in step.
    const result = await this.identityService.refreshToken(
      dto.refreshToken,
      readPresentedDeviceCredential(req),
    );
    this.transportDeviceTrust(res, result);
    return result;
  }

  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res?: CookieBearingResponse,
  ) {
    // Logout now ends the trust this browser holds for this account, and the
    // cookie is cleared in the same response, so "signed out" and "trusted
    // device" can no longer be simultaneously true (S-1 requirement 10).
    const result = await this.identityService.logout(
      dto.refreshToken,
      readPresentedDeviceCredential(req),
    );
    this.transportDeviceTrust(res, result);
    return result;
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

  /**
   * Password login.
   *
   * `X-Device-Id` / `deviceId` in the body is provenance only. What decides
   * whether OTP is required is the server-issued cookie, read through
   * {@link readPresentedDeviceCredential} — which additionally demands the
   * same-origin proof header, because `SameSite=None` is the only attribute
   * that works across the Vercel/Render topology and therefore lets a
   * third-party page *cause* the browser to attach the credential.
   */
  @Post('login/password')
  async loginPassword(
    @Body() dto: LoginPasswordDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res?: CookieBearingResponse,
  ) {
    const result = await this.identityService.loginWithPassword(
      dto.email,
      dto.password,
      dto.deviceId,
      dto.deviceInfo,
      { ip: req.ip, userAgent: req.get('user-agent') },
      readPresentedDeviceCredential(req),
    );
    this.transportDeviceTrust(res, result);
    return result;
  }

  /**
   * Device-check pre-flight (S-2).
   *
   * IP-throttled like the OTP routes (it previously had no guard at all) and
   * answers a constant body: the caller has proved nothing, so it is told
   * nothing. Kept as a route so deployed clients that still call it keep
   * working; every client that used to branch on its answer has been changed
   * to stop doing so.
   */
  @Post('login/device-check')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'device-check': {} })
  async checkDeviceLogin(@Body() dto: DeviceCheckDto) {
    return this.identityService.checkDeviceLogin(dto.email);
  }
}
