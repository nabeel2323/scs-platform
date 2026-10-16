import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import { denylistKey } from '../auth/token-denylist';

/**
 * JWT Auth Guard — validates Bearer token from Authorization header.
 *
 * Attaches decoded payload to `request.user`:
 *   { sub, activeOrg, role, perms, sid?, jti?, iat, exp }
 *
 * Also enforces the access-token denylist (API-B9): a token whose `jti` has
 * been revoked (e.g. after switchOrg) is rejected even though its signature is
 * still valid, closing the stale-permission window.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        type: 'https://errors.scs.local/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid Authorization header',
      });
    }

    let payload: { jti?: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException({
        type: 'https://errors.scs.local/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid or expired access token',
      });
    }

    // Reject tokens explicitly revoked before expiry (API-B9).
    if (payload.jti) {
      const revoked = await this.redis.client.get(denylistKey(payload.jti));
      if (revoked) {
        throw new UnauthorizedException({
          type: 'https://errors.scs.local/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Access token has been revoked',
        });
      }
    }

    // Attach user context to request
    (request as any).user = payload;

    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers['authorization'];
    if (!header || typeof header !== 'string') return null;

    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) return null;

    return token;
  }
}
