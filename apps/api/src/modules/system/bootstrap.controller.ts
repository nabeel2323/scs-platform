/**
 * Bootstrap controller — secure initial Super Admin provisioning (ADR-0004).
 *
 * These endpoints are deliberately NOT protected by JwtAuthGuard: there is no
 * session yet. The bootstrap authorization (issued internally after owner
 * email verification, or out-of-band via the CLI break-glass path) is the
 * authorization. They are rate-limited and return only the minimum
 * information required by the Admin UI. No secrets, no user data, no role
 * membership details, and never the complete owner address.
 *
 * UI-driven flow:
 *   GET    /v1/system/bootstrap/status              — readiness + masked owner hint
 *   POST   /v1/system/bootstrap/owner-otp/request   — send OTP to owner only
 *   POST   /v1/system/bootstrap/owner-otp/verify    — verify OTP, issue authorization
 *   POST   /v1/system/bootstrap/super-admin         — consume authorization, create Super Admin
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { BootstrapService } from './bootstrap.service';
import {
  CreateSuperAdminDto,
  BootstrapStatusResponseDto,
  OwnerOtpRequestDto,
  OwnerOtpRequestResponseDto,
  OwnerOtpVerifyDto,
  OwnerOtpVerifyResponseDto,
} from './dto/bootstrap.dto';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { RateLimitException } from '../../common/exceptions/rate-limit.exception';
import type { Response, Request } from 'express';

/** Per-IP super-admin attempts allowed per window. */
const BOOTSTRAP_RATE_LIMIT = 10;
/** Rate-limit window (seconds). */
const BOOTSTRAP_RATE_WINDOW_SECONDS = 900;

@Controller('system/bootstrap')
export class BootstrapController {
  constructor(
    private readonly bootstrap: BootstrapService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Public read of initialization status. Never discloses users or secrets. */
  @Get('status')
  async status(@Res({ passthrough: true }) res: Response): Promise<BootstrapStatusResponseDto> {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    return this.bootstrap.getStatus();
  }

  /** Send a bootstrap OTP to the configured platform owner only. */
  @Post('owner-otp/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-request': {} })
  @HttpCode(200)
  async requestOwnerOtp(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Body() dto: OwnerOtpRequestDto,
  ): Promise<OwnerOtpRequestResponseDto> {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const ip = req.ip ?? 'unknown';
    const result = await this.bootstrap.requestOwnerOtp(dto.email, ip);
    return {
      success: result.success,
      deliveryStatus: result.deliveryStatus,
      possiblyDelivered: result.possiblyDelivered ?? null,
      emailHint: result.emailHint,
    };
  }

  /** Verify a bootstrap OTP and issue a short-lived single-use authorization. */
  @Post('owner-otp/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'otp-verify': {} })
  @HttpCode(200)
  async verifyOwnerOtp(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Body() dto: OwnerOtpVerifyDto,
  ): Promise<OwnerOtpVerifyResponseDto> {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const ip = req.ip ?? 'unknown';
    const result = await this.bootstrap.verifyOwnerOtp(dto.email, dto.otp, ip);
    return {
      authorization: result.authorization,
      expiresInSeconds: result.expiresInSeconds,
    };
  }

  /** Provision the initial Super Admin using a single-use bootstrap authorization. */
  @Post('super-admin')
  @HttpCode(200)
  async createSuperAdmin(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Body() dto: CreateSuperAdminDto,
  ): Promise<{ status: 'initialized'; loginUrl: string }> {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const ip = req.ip ?? 'unknown';
    const check = await this.rateLimit.checkAndIncrement(
      'bootstrap_super_admin',
      ip,
      BOOTSTRAP_RATE_LIMIT,
      BOOTSTRAP_RATE_WINDOW_SECONDS,
    );
    if (!check.allowed) {
      const retryAfter = await this.rateLimit.getResetSeconds(
        'bootstrap_super_admin',
        ip,
      );
      throw new RateLimitException('Too many bootstrap attempts. Please try again later.', {
        limit: BOOTSTRAP_RATE_LIMIT,
        remaining: 0,
        retryAfterSeconds: retryAfter || BOOTSTRAP_RATE_WINDOW_SECONDS,
      });
    }

    return this.bootstrap.createSuperAdmin(dto, ip);
  }
}
