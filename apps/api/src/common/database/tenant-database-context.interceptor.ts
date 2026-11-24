import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { defer, from, lastValueFrom, Observable } from 'rxjs';
import { DatabaseService } from './database.service';
import type { JwtPayload } from '../guards/current-user.decorator';

/**
 * Controller-scoped transaction context for authenticated user-owned data.
 *
 * This interceptor is deliberately opt-in, not global. It is applied only to
 * source-reviewed, JWT-protected bounded surfaces: Notifications, Pricing,
 * Store Membership, Reviews/Disputes, Promotions, Analytics, Inventory, Cart,
 * Returns, Catalog Offers/Requests/Taxonomy, Organizations/Roles, selected
 * Catalog/Admin reads, and reviewed Merchant store/warehouse/verification plus
 * document metadata handlers. Merchant document registration and listing are
 * database-only; object-storage presign operations remain outside. Controller
 * methods that perform external provider work, upload files or return streams
 * remain outside the interceptor. Add routes only after reviewing the full
 * service call graph, transaction behavior and external-I/O lifetime.
 *
 * Nest runs guards before interceptors, so the actor is taken only from the
 * server-verified request.user populated by JwtAuthGuard. The handler observable
 * is fully awaited inside DatabaseService.withActorContext(), ensuring every
 * DatabaseService.db call in the operation uses the same transaction-bound
 * Drizzle handle. The transaction commits/rolls back before the request ends.
 */
@Injectable()
export class TenantDatabaseContextInterceptor implements NestInterceptor {
  constructor(private readonly database: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Partial<JwtPayload> }>();
    const user = request.user;

    // This interceptor is attached only to a controller protected by JwtAuthGuard.
    // Missing identity is a fail-closed configuration/programming error.
    if (
      typeof user?.sub !== 'string' ||
      user.sub.length === 0 ||
      typeof user.role !== 'string' ||
      user.role.length === 0
    ) {
      throw new UnauthorizedException('Authenticated database context is missing');
    }

    return defer(() =>
      from(
        this.database.withActorContext(
          {
            actorKind: 'user',
            actorId: user.sub,
            actorRole: user.role,
            activeOrgId: typeof user.activeOrg === 'string' ? user.activeOrg : null,
          },
          () => lastValueFrom(next.handle()),
        ),
      ),
    );
  }
}
