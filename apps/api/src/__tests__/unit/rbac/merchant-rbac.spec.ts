import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/guards/current-user.decorator';

/**
 * API-B6 — Merchant/Catalog write RBAC.
 *
 * Verifies the PermissionsGuard mechanism that now protects the merchant,
 * catalog, promotions and orders write endpoints, and encodes the role →
 * permission matrix seeded in scripts/seed.ts so a regression in either the
 * guard or the seed grants is caught here.
 *
 * The guard reads the @RequirePermission metadata via a real Reflector, so we
 * attach the same metadata the decorator would (PERMISSIONS_KEY → string[]).
 */

// ── Role → permission matrix (mirrors scripts/seed.ts) ──────────────
const ROLE_PERMS: Record<string, string[]> = {
  SUPER_ADMIN: [
    'merchant:stores:write',
    'merchant:products:write',
    'merchant:orders:write',
    'merchant:promotions:write',
    'catalog:categories:write',
  ],
  ADMIN: ['merchant:stores:write'],
  MODERATOR: ['merchant:products:write', 'catalog:categories:write'],
  MERCHANT_OWNER: [
    'merchant:stores:write',
    'merchant:products:write',
    'merchant:orders:write',
    'merchant:promotions:write',
    'catalog:categories:write',
  ],
  MERCHANT_STAFF: [
    'merchant:products:write',
    'merchant:orders:write',
    'merchant:promotions:write',
    'catalog:categories:write',
  ],
  BUYER: [],
};

// ── Test harness ────────────────────────────────────────────────────
const reflector = new Reflector();
const guard = new PermissionsGuard(reflector);

/** A handler carrying the given @RequirePermission metadata. */
function handlerRequiring(...perms: string[]): () => void {
  const fn = () => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, perms, fn);
  return fn;
}

/** A handler with no permission metadata (open to any authenticated user). */
function openHandler(): () => void {
  return () => undefined;
}

function contextFor(handler: () => void, perms: string[] | null): ExecutionContext {
  const user = perms === null ? null : { sub: 'u1', activeOrg: 'org1', role: 'X', perms };
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function canActivate(handler: () => void, perms: string[] | null): boolean {
  return guard.canActivate(contextFor(handler, perms));
}

// ═══════════════════════════════════════════════════════════════════
// Guard mechanics
// ═══════════════════════════════════════════════════════════════════

describe('PermissionsGuard — mechanics', () => {
  it('allows endpoints with no required permissions', () => {
    expect(canActivate(openHandler(), [])).toBe(true);
  });

  it('throws 403 when the request has no user', () => {
    expect(() => canActivate(handlerRequiring('merchant:stores:write'), null)).toThrow(
      ForbiddenException,
    );
  });

  it('throws 403 when the user has no perms claim', () => {
    expect(() => canActivate(handlerRequiring('merchant:stores:write'), [])).toThrow(
      ForbiddenException,
    );
  });

  it('allows when the user holds the required permission', () => {
    expect(canActivate(handlerRequiring('merchant:stores:write'), ['merchant:stores:write'])).toBe(
      true,
    );
  });

  it('enforces AND semantics — missing one of several required perms throws', () => {
    const handler = handlerRequiring('merchant:products:write', 'merchant:orders:write');
    expect(() => canActivate(handler, ['merchant:products:write'])).toThrow(ForbiddenException);
    expect(canActivate(handler, ['merchant:products:write', 'merchant:orders:write'])).toBe(true);
  });

  it('surfaces the missing permission key in the RFC7807 detail', () => {
    try {
      canActivate(handlerRequiring('merchant:promotions:write'), ['merchant:orders:write']);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      const body = (err as ForbiddenException).getResponse() as { detail: string; type: string };
      expect(body.type).toBe('https://errors.scs.local/forbidden');
      expect(body.detail).toContain('merchant:promotions:write');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Per-endpoint gating (the four write keys introduced by API-B6)
// ═══════════════════════════════════════════════════════════════════

describe('PermissionsGuard — merchant/catalog write endpoints', () => {
  const endpoints: { name: string; perm: string }[] = [
    { name: 'POST /stores (createStore)', perm: 'merchant:stores:write' },
    { name: 'POST /products (createProduct)', perm: 'merchant:products:write' },
    { name: 'POST /orders/:id/accept (acceptOrder)', perm: 'merchant:orders:write' },
    { name: 'POST /promotions (createPromotion)', perm: 'merchant:promotions:write' },
    { name: 'POST /categories (createCategory)', perm: 'catalog:categories:write' },
  ];

  for (const ep of endpoints) {
    it(`gates ${ep.name} behind ${ep.perm}`, () => {
      const handler = handlerRequiring(ep.perm);
      // A buyer (no perms) must be rejected.
      expect(() => canActivate(handler, ROLE_PERMS['BUYER']!)).toThrow(ForbiddenException);
      // A user holding exactly that permission is allowed.
      expect(canActivate(handler, [ep.perm])).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Seeded role matrix — validates the grants in scripts/seed.ts
// ═══════════════════════════════════════════════════════════════════

describe('PermissionsGuard — seeded role matrix', () => {
  function roleCan(role: string, perm: string): boolean {
    return canActivate(handlerRequiring(perm), ROLE_PERMS[role]!);
  }

  it('MERCHANT_OWNER can write stores, products, orders and promotions', () => {
    expect(roleCan('MERCHANT_OWNER', 'merchant:stores:write')).toBe(true);
    expect(roleCan('MERCHANT_OWNER', 'merchant:products:write')).toBe(true);
    expect(roleCan('MERCHANT_OWNER', 'merchant:orders:write')).toBe(true);
    expect(roleCan('MERCHANT_OWNER', 'merchant:promotions:write')).toBe(true);
  });

  it('MERCHANT_STAFF can write products/orders/promotions but NOT stores (owner-only)', () => {
    expect(roleCan('MERCHANT_STAFF', 'merchant:products:write')).toBe(true);
    expect(roleCan('MERCHANT_STAFF', 'merchant:orders:write')).toBe(true);
    expect(roleCan('MERCHANT_STAFF', 'merchant:promotions:write')).toBe(true);
    expect(() =>
      canActivate(handlerRequiring('merchant:stores:write'), ROLE_PERMS['MERCHANT_STAFF']!),
    ).toThrow(ForbiddenException);
  });

  it('MODERATOR can curate products/categories but not manage stores or orders', () => {
    expect(roleCan('MODERATOR', 'merchant:products:write')).toBe(true);
    expect(roleCan('MODERATOR', 'catalog:categories:write')).toBe(true);
    expect(() =>
      canActivate(handlerRequiring('merchant:stores:write'), ROLE_PERMS['MODERATOR']!),
    ).toThrow(ForbiddenException);
    expect(() =>
      canActivate(handlerRequiring('merchant:orders:write'), ROLE_PERMS['MODERATOR']!),
    ).toThrow(ForbiddenException);
  });

  it('ADMIN can write stores but not merchant products/orders/promotions', () => {
    expect(roleCan('ADMIN', 'merchant:stores:write')).toBe(true);
    expect(() =>
      canActivate(handlerRequiring('merchant:products:write'), ROLE_PERMS['ADMIN']!),
    ).toThrow(ForbiddenException);
  });

  it('SUPER_ADMIN passes every merchant/catalog write gate', () => {
    for (const perm of [
      'merchant:stores:write',
      'merchant:products:write',
      'merchant:orders:write',
      'merchant:promotions:write',
      'catalog:categories:write',
    ]) {
      expect(roleCan('SUPER_ADMIN', perm)).toBe(true);
    }
  });

  it('BUYER is rejected from every merchant/catalog write gate', () => {
    for (const perm of [
      'merchant:stores:write',
      'merchant:products:write',
      'merchant:orders:write',
      'merchant:promotions:write',
      'catalog:categories:write',
    ]) {
      expect(() => canActivate(handlerRequiring(perm), ROLE_PERMS['BUYER']!)).toThrow(
        ForbiddenException,
      );
    }
  });
});
