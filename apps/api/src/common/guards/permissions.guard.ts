import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './current-user.decorator';

/**
 * Permissions Guard — checks that the authenticated user has the required permissions.
 *
 * Must be used after JwtAuthGuard (which populates request.user).
 *
 * Usage:
 *   @RequirePermission('merchant:stores:verify')
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.perms) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Insufficient permissions',
      });
    }

    const hasPermission = requiredPermissions.every((perm) =>
      user.perms.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: `Missing required permissions: ${requiredPermissions.join(', ')}`,
      });
    }

    return true;
  }
}
