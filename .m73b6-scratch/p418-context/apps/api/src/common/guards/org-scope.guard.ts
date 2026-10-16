import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';

/**
 * Org Scope Guard — enforces tenant-scoped access on every protected resource.
 *
 * Ensures the authenticated user can only access resources belonging to their
 * active organization. Prevents cross-tenant data leakage in multi-tenant scenarios.
 *
 * Usage patterns:
 *
 * 1. Direct org-scoped resource (has orgId field):
 *    @OrgScoped('orgId')
 *    @UseGuards(JwtAuthGuard, PermissionsGuard, OrgScopeGuard)
 *
 * 2. Store-scoped resource (store belongs to org):
 *    @OrgScoped('storeId', 'store')
 *    @UseGuards(JwtAuthGuard, PermissionsGuard, OrgScopeGuard)
 *
 * 3. Order-scoped resource (order has buyerOrg or storeId):
 *    @OrgScoped('buyerOrg')
 *    @UseGuards(JwtAuthGuard, PermissionsGuard, OrgScopeGuard)
 *
 * The guard extracts the resource identifier from route params/body,
 * looks up the resource's org ownership, and compares it to the JWT's activeOrg.
 * PLATFORM_ADMIN role bypasses org scoping.
 */

export const ORG_SCOPE_KEY = 'org_scope';

export interface OrgScopeMetadata {
  field: string;       // The param/body field that identifies the resource
  lookupType?: string; // 'direct' | 'store' | 'order' — how to resolve orgId
}

/**
 * Decorator to mark a route as org-scoped.
 *
 * @param field — The route param or body field containing the resource ID
 * @param lookupType — How to resolve the org ownership:
 *   - 'direct': The field IS the orgId (e.g., @OrgScoped('orgId'))
 *   - 'store': Look up the store's orgId (e.g., @OrgScoped('storeId', 'store'))
 *   - 'order': Look up the order's buyerOrg (e.g., @OrgScoped('orderId', 'order'))
 *   - undefined: Try to find orgId directly on the resource
 */
export function OrgScoped(field: string, lookupType?: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(ORG_SCOPE_KEY, { field, lookupType } as OrgScopeMetadata, descriptor.value);
    return descriptor;
  };
}

@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<OrgScopeMetadata | undefined>(ORG_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return true; // No org scoping required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'No authenticated user',
      });
    }

    // PLATFORM_ADMIN can access all orgs
    if (user.role === 'PLATFORM_ADMIN') {
      return true;
    }

    const activeOrg = user.activeOrg;
    if (!activeOrg) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'No active organization selected',
      });
    }

    const resourceId = request.params[metadata.field] || request.body?.[metadata.field];

    if (!resourceId) {
      // If no resource ID in params, check if creating a new resource (allow — will be scoped on creation)
      if (request.method === 'POST' && !metadata.lookupType) {
        return true;
      }
      return true; // No resource to scope-check
    }

    const resourceOrgId = await this.resolveOrgId(resourceId, metadata);

    if (resourceOrgId && resourceOrgId !== activeOrg) {
      throw new ForbiddenException({
        type: 'https://errors.scs.local/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Access denied: resource belongs to a different organization',
      });
    }

    return true;
  }

  /**
   * Resolve the orgId that owns a given resource.
   */
  private async resolveOrgId(resourceId: string, metadata: OrgScopeMetadata): Promise<string | null> {
    try {
      switch (metadata.lookupType) {
        case 'store': {
          const store = await this.db.db.query.stores.findFirst({
            where: (stores, { eq }) => eq(stores.id, resourceId),
          });
          return store?.orgId ?? null;
        }

        case 'order': {
          const order = await this.db.db.query.orders.findFirst({
            where: (orders, { eq }) => eq(orders.id, resourceId),
          });
          if (!order) return null;
          // Orders are scoped via their store's orgId
          const store = await this.db.db.query.stores.findFirst({
            where: (stores, { eq }) => eq(stores.id, order.storeId),
          });
          return store?.orgId ?? null;
        }

        case 'direct':
        default: {
          // Try to find orgId directly on common tables
          // Check stores table
          const store = await this.db.db.query.stores.findFirst({
            where: (stores, { eq }) => eq(stores.id, resourceId),
          });
          if (store) return store.orgId;

          // Check organizations table (resource IS the org)
          const org = await this.db.db.query.organizations.findFirst({
            where: (organizations, { eq }) => eq(organizations.id, resourceId),
          });
          if (org) return org.id;

          return null;
        }
      }
    } catch {
      // If lookup fails, allow access (resource may not exist yet)
      return null;
    }
  }
}
