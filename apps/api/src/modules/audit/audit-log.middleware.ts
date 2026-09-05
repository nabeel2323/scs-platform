import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuditService } from './audit.service';
import { JwtPayload } from '../../common/guards/current-user.decorator';

/**
 * Audit log middleware — persists an audit trail entry for every mutating
 * request (§3.9: verification decisions, refunds, price overrides, admin
 * impersonation, flag changes, and all admin mutations).
 *
 * The write is deferred to the response `finish` event because Express
 * middleware runs *before* Nest guards, so `req.user` is still unpopulated
 * when `use()` executes. Deferring also captures the final status code and
 * keeps the audit write off the request's critical path.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** High-volume, low-value mutations excluded from the trail. */
const SKIP_PREFIXES = ['/v1/analytics', '/v1/carts', '/v1/realtime'];

/**
 * Login-completion routes are attributed by IdentityService, which knows the
 * resolved user — the request carries no JWT yet, so the middleware would only
 * see an anonymous SYSTEM actor. Their *failures* are still recorded here,
 * since nothing else observes them and they matter for brute-force detection.
 */
const SERVICE_ATTRIBUTED = ['/v1/auth/otp/verify', '/v1/auth/login/password'];

/** Security-relevant auth routes get explicit names rather than derived ones. */
const AUTH_ACTIONS: Record<string, string> = {
  '/v1/auth/login/password': 'auth.login',
  '/v1/auth/login/device-check': 'auth.device_check',
  '/v1/auth/otp/request': 'auth.otp_requested',
  '/v1/auth/otp/verify': 'auth.login',
  '/v1/auth/refresh': 'auth.token_refreshed',
  '/v1/auth/logout': 'auth.logout',
  '/v1/auth/switch-org': 'auth.org_switched',
  '/v1/me/credentials/setup': 'auth.credentials_setup',
  '/v1/me/credentials/change-password': 'auth.password_changed',
};

const METHOD_VERB: Record<string, string> = {
  POST: 'created',
  PUT: 'updated',
  PATCH: 'updated',
  DELETE: 'deleted',
};

/** Sub-route verb → past tense, so actions read as `order.accepted`. */
const PAST_TENSE: Record<string, string> = {
  accept: 'accepted',
  approve: 'approved',
  reject: 'rejected',
  confirm: 'confirmed',
  cancel: 'cancelled',
  complete: 'completed',
  refund: 'refunded',
  verify: 'verified',
  transition: 'transitioned',
  review: 'reviewed',
  escalate: 'escalated',
  resolve: 'resolved',
  activate: 'activated',
  deactivate: 'deactivated',
  publish: 'published',
  redeem: 'redeemed',
};

@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  constructor(private readonly audit: AuditService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const method = req.method;
    // `req.path`/`req.url` are rewritten by mounted middleware, so use
    // originalUrl (query string stripped) for the true route.
    const path = (req.originalUrl || req.url || '/').split('?')[0] ?? '/';

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      next();
      return;
    }
    if (SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      next();
      return;
    }

    res.on('finish', () => {
      if (SERVICE_ATTRIBUTED.includes(path) && res.statusCode < 400) return;

      // Guards have run by now, so the authenticated actor is available.
      const user = (req as Request & { user?: JwtPayload }).user;
      const { action, resource, resourceId } = this.describe(method, path);

      void this.audit.record({
        actorType: AuditService.actorTypeForRole(user?.role),
        actorId: user?.sub ?? null,
        orgId: user?.activeOrg ?? null,
        action,
        resource,
        resourceId,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        metadata: {
          method,
          path,
          status: res.statusCode,
          requestId: (req as Request & { requestId?: string }).requestId ?? null,
          role: user?.role ?? null,
        },
      });
    });

    next();
  }

  /**
   * Derives `resource` / `action` from the route so entries match the
   * `<noun>.<verb>` convention used by seeded data (e.g. `order.accepted`)
   * and stay filterable in the admin console.
   */
  private describe(method: string, path: string): { action: string; resource: string; resourceId: string | null } {
    const explicit = AUTH_ACTIONS[path];
    if (explicit) {
      return { action: explicit, resource: 'auth', resourceId: null };
    }

    const segments = path.split('/').filter(Boolean).filter((s) => s !== 'v1');
    const isId = (s: string) => UUID.test(s) || /^\d+$/.test(s);

    const resourceSegments: string[] = [];
    let resourceId: string | null = null;
    let trailingVerb: string | null = null;

    for (const segment of segments) {
      if (isId(segment)) {
        resourceId ??= segment;
        continue;
      }
      if (resourceId === null) {
        // Leading noun segments; capped so deeply nested routes stay readable.
        if (resourceSegments.length < 2) resourceSegments.push(segment);
      } else {
        trailingVerb = segment;
      }
    }

    const resource = resourceSegments.join('/') || path;
    const noun = AuditLogMiddleware.singular(resourceSegments[resourceSegments.length - 1] ?? 'request');
    const verb = trailingVerb
      ? (PAST_TENSE[trailingVerb] ?? `${trailingVerb}ed`)
      : (METHOD_VERB[method] ?? 'mutated');

    return { action: `${noun}.${verb}`, resource, resourceId };
  }

  /** `orders` → `order`, `categories` → `category`. */
  private static singular(word: string): string {
    if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.endsWith('ses')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
  }
}
