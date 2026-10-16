import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Permission guard decorator.
 *
 * Usage:
 *   @RequirePermission('merchant:stores:verify')
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   async verifyStore(...) { ... }
 */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Role guard decorator.
 *
 * Usage:
 *   @RequireRole('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   async createCategory(...) { ... }
 */
export const ROLES_KEY = 'roles';
export const RequireRole = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Extracts the authenticated user from the request.
 *
 * Usage:
 *   @CurrentUser() user: JwtPayload
 *   @CurrentUser('sub') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

/**
 * JWT payload shape attached by JwtAuthGuard.
 */
export interface JwtPayload {
  sub: string; // user ID
  activeOrg: string | null;
  role: string;
  perms: string[];
  /**
   * Session ID this access token was minted for (WEB-B3). Lets the server
   * identify the caller's *current* session (e.g. to flag `isCurrent` in
   * GET /v1/me/sessions) without trusting a client-supplied header.
   * Optional: tokens issued before this claim existed simply omit it.
   */
  sid?: string;
  /**
   * Unique token ID (API-B9). Each access token carries a `jti` so one specific
   * token can be revoked (denylisted in Redis) before its natural expiry — e.g.
   * the prior token when the caller switches organizations. Optional: tokens
   * issued before this claim existed simply omit it and are never denylisted.
   */
  jti?: string;
  iat: number;
  exp: number;
}
