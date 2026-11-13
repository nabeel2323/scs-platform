/**
 * Bootstrap controller — secure initial Super Admin provisioning (ADR-0004).
 *
 * These endpoints are deliberately NOT protected by JwtAuthGuard: the bootstrap
 * authorization token is the authorization. They are rate-limited and return
 * only the minimum information required by the Admin UI. No secrets, no user
 * data, no role membership details.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { BootstrapService } from './bootstrap.service';
import { CreateSuperAdminDto, BootstrapStatusResponseDto } from './dto/bootstrap.dto';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { RateLimitException } from '../../common/exceptions/rate-limit.exception';

/** Per-IP bootstrap attempts allowed per window. */
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
