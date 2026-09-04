import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, Headers } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CatalogService } from '../catalog/catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

/**
 * User profile controller — GET/PATCH /v1/me
 *
 * Returns the authenticated user's profile, active organization,
 * and membership list. Supports partial profile updates.
 * Also proxies device token management at /v1/me/devices.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly notificationsService: NotificationsService,
    private readonly catalogService: CatalogService,
  ) {}

  @Get()
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.identityService.getProfile(user.sub);
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() body: { fullName?: string; email?: string; locale?: string },
  ) {
    return this.identityService.updateProfile(user.sub, body);
  }

  @Get('organizations')
  async getMyOrganizations(@CurrentUser() user: JwtPayload) {
    return this.identityService.listUserOrgs(user.sub);
  }

  @Post('devices')
  async registerDevice(
    @CurrentUser() user: JwtPayload,
    @Body() body: { token: string; platform: string; appVersion?: string },
  ) {
    return this.notificationsService.registerDeviceToken(user.sub, body.token, body.platform, body.appVersion);
  }

  @Delete('devices/:token')
  async unregisterDevice(
    @CurrentUser() user: JwtPayload,
    @Param('token') token: string,
  ) {
    return this.notificationsService.unregisterDeviceToken(user.sub, token);
  }

  // ── Favorites / Wishlist ───────────────────────────────────

  @Get('favorites')
  async getFavorites(@CurrentUser() user: JwtPayload) {
    return this.catalogService.listFavorites(user.sub);
  }

  @Post('favorites')
  async addFavorite(
    @CurrentUser() user: JwtPayload,
    @Body() body: { productId: string },
  ) {
    return this.catalogService.addFavorite(user.sub, body.productId);
  }

  @Delete('favorites/:productId')
  async removeFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
  ) {
    return this.catalogService.removeFavorite(user.sub, productId);
  }

  // ── Credential Management ──────────────────────────────────

  /**
   * Set up email and password credentials.
   * User must be authenticated via OTP first.
   */
  @Post('credentials/setup')
  async setupCredentials(
    @CurrentUser() user: JwtPayload,
    @Body() body: { email: string; password: string },
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.identityService.setupCredentials(
      user.sub,
      body.email,
      body.password,
      deviceId,
    );
  }

  /**
   * Change password for authenticated user.
   */
  @Post('credentials/change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: { currentPassword: string; newPassword: string },
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.identityService.changePassword(
      user.sub,
      body.currentPassword,
      body.newPassword,
      deviceId,
    );
  }

  /**
   * Get user's active sessions with device info.
   */
  @Get('sessions')
  async getSessions(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.identityService.getUserSessions(user.sub);
  }

  /**
   * Revoke all sessions for a specific device.
   */
  @Delete('sessions/revoke-by-device/:deviceId')
  async revokeSessionsByDevice(
    @CurrentUser() user: JwtPayload,
    @Param('deviceId') deviceId: string,
  ) {
    return this.identityService.revokeSessionsByDevice(user.sub, deviceId);
  }
}
