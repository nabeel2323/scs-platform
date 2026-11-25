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
import { assertActiveOrgMembership, type CallerContext } from '../tenant-scope';

/**
 * Controller-scoped transaction context for authenticated user-owned data.
 *
 * This interceptor is deliberately opt-in, not global. It is applied only to
 * source-reviewed, JWT-protected bounded surfaces: Notifications, Pricing,
 * Store Membership, Reviews/Disputes, Promotions, Analytics, Inventory, Cart,
 * Returns, Catalog Offers/Requests/Taxonomy, Organizations/Roles, selected
 * Catalog/Admin reads, database-only Admin user/role/org/product/variant writes
 * (excluding media previews and notification delivery), reviewed Merchant store/warehouse/verification plus
 * document metadata handlers, Shipping method/zone management, and selected
 * Shipment Operations database-only queue/list endpoints. Shipment provider calls
 * and object-storage presign operations remain outside; those handlers scope only
 * their database read/write phases explicitly. Controller
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

    const actorId = user.sub;
    const actorRole = user.role;
    const activeOrgId = typeof user.activeOrg === 'string' ? user.activeOrg : null;

    return defer(() =>
      from(
        this.database.withActorContext(
          {
            actorKind: 'user',
            actorId,
            actorRole,
            activeOrgId,
          },
          async () => {
            // JWT activeOrg is a routing claim and can outlive membership revocation.
            // Revalidate the organization membership and active organization inside
            // the same transaction before allowing any controller query to run.
            if (activeOrgId) {
              const caller: CallerContext = { sub: actorId, role: actorRole, activeOrg: activeOrgId };
              await assertActiveOrgMembership(this.database, caller, activeOrgId);
            }
            return lastValueFrom(next.handle());
          },
        ),
      ),
    );
  }
}
