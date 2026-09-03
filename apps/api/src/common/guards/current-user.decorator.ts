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
  sub: string;       // user ID
  activeOrg: string | null;
  role: string;
  perms: string[];
  iat: number;
  exp: number;
}
