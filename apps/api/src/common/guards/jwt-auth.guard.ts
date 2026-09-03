import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

/**
 * JWT Auth Guard — validates Bearer token from Authorization header.
 *
 * Attaches decoded payload to `request.user`:
 *   { sub, activeOrg, role, perms, iat, exp }
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

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

    try {
      const payload = this.jwt.verify(token);
      // Attach user context to request
      (request as any).user = payload;
    } catch {
      throw new UnauthorizedException({
        type: 'https://errors.scs.local/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid or expired access token',
      });
    }

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
