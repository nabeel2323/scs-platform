import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CatalogService } from '../catalog/catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';
import { UpdateProfileDto, SetupCredentialsDto, ChangePasswordDto } from './dto/profile.dto';

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
    // Pass the caller's verified `activeOrg` so the projected `role` matches the
    // active organization (and the enforced token claims) — GET /v1/me is the
    // server-side source of truth clients hydrate from instead of decoding JWTs.
    return this.identityService.getProfile(user.sub, user.activeOrg);
  }

  @Patch()
  async updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.identityService.updateProfile(user.sub, dto);
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
    return this.notificationsService.registerDeviceToken(
      user.sub,
      body.token,
      body.platform,
      body.appVersion,
    );
  }

  @Delete('devices/:token')
  async unregisterDevice(@CurrentUser() user: JwtPayload, @Param('token') token: string) {
    return this.notificationsService.unregisterDeviceToken(user.sub, token);
  }

  // ── Favorites / Wishlist ───────────────────────────────────

  @Get('favorites')
  async getFavorites(@CurrentUser() user: JwtPayload) {
    return this.catalogService.listFavorites(user.sub);
  }

  @Post('favorites')
  async addFavorite(@CurrentUser() user: JwtPayload, @Body() body: { productId: string }) {
    return this.catalogService.addFavorite(user.sub, body.productId);
  }

  @Delete('favorites/:productId')
  async removeFavorite(@CurrentUser() user: JwtPayload, @Param('productId') productId: string) {
    return this.catalogService.removeFavorite(user.sub, productId);
  }

  // ── Saved Suppliers (§21.3 retailer capability) ────────────

  /**
   * List the stores (suppliers) the retailer has saved, enriched with store data.
   * Store-level analog of favorites; scoped to the caller via the `sub` claim.
   */
  @Get('saved-suppliers')
  async getSavedSuppliers(@CurrentUser() user: JwtPayload) {
    return this.catalogService.listSavedSuppliers(user.sub);
  }

  @Post('saved-suppliers')
  async saveSupplier(@CurrentUser() user: JwtPayload, @Body() body: { storeId: string }) {
    return this.catalogService.saveSupplier(user.sub, body.storeId);
  }

  @Delete('saved-suppliers/:storeId')
  async removeSavedSupplier(@CurrentUser() user: JwtPayload, @Param('storeId') storeId: string) {
    return this.catalogService.removeSavedSupplier(user.sub, storeId);
  }

  // ── Credential Management ──────────────────────────────────

  /**
   * Set up email and password credentials.
   * User must be authenticated via OTP first.
   */
  @Post('credentials/setup')
  async setupCredentials(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetupCredentialsDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.identityService.setupCredentials(user.sub, dto.email, dto.password, deviceId);
  }

  /**
   * Change password for authenticated user.
   */
  @Post('credentials/change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.identityService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
      deviceId,
    );
  }

  /**
   * Get user's active sessions with device info.
   * The server marks `isCurrent` from the caller's own `sid` JWT claim (WEB-B3)
   * rather than a client-supplied header, so it cannot be spoofed.
   */
  @Get('sessions')
  async getSessions(@CurrentUser() user: JwtPayload) {
    return this.identityService.getUserSessions(user.sub, user.sid);
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
