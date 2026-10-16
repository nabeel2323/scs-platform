import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './current-user.decorator';

/**
 * Roles Guard — checks that the authenticated user has one of the required roles.
 *
 * Must be used after JwtAuthGuard (which populates request.user).
 *
 * Usage:
 *   @RequireRole('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Insufficient role',
      });
    }

    // SUPER_ADMIN bypasses all role checks
    if (user.role === 'SUPER_ADMIN') return true;

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: `This operation requires one of these roles: ${requiredRoles.join(', ')}`,
      });
    }

    return true;
  }
}
