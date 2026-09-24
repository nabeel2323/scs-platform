import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  assertProductInOrg,
  assertStoreInOrg,
  assertVariantInOrg,
  type CallerContext,
} from '../../../common/tenant-scope';

/**
 * P0 remediation — cross-tenant ownership isolation tests.
 *
 * Verifies that the tenant-scope helpers correctly deny cross-merchant access
 * to products, variants, stores, and offers. Admin bypass (SUPER_ADMIN / ADMIN
 * / MODERATOR) is also verified.
 *
 * Uses minimal mock DatabaseService objects shaped like the Drizzle query
 * surface each helper touches (db.query.X.findFirst).
 */

type Row = Record<string, unknown>;

function makeMockDb(queries: {
  products?: Row | null;
  stores?: Row | null;
  productVariants?: Row | null;
}) {
  return {
    db: {
      query: {
        products: {
          findFirst: async () => queries.products ?? null,
        },
        stores: {
          findFirst: async () => queries.stores ?? null,
        },
        productVariants: {
          findFirst: async () => queries.productVariants ?? null,
        },
      },
    },
  };
}

const merchantA: CallerContext = { sub: 'user-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };
const merchantB: CallerContext = { sub: 'user-b', role: 'MERCHANT_OWNER', activeOrg: 'org-b' };
const adminUser: CallerContext = { sub: 'admin-1', role: 'ADMIN', activeOrg: null };
const superAdmin: CallerContext = { sub: 'sa-1', role: 'SUPER_ADMIN', activeOrg: null };
const moderator: CallerContext = { sub: 'mod-1', role: 'MODERATOR', activeOrg: null };

// ── assertProductInOrg ─────────────────────────────────────────

describe('assertProductInOrg', () => {
  it('allows merchant A to access their own product', async () => {
    const db = makeMockDb({ products: { storeId: 'store-a' }, stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, merchantA, 'p1')).resolves.toBeUndefined();
  });

  it('denies merchant B access to merchant A\'s product (403)', async () => {
    const db = makeMockDb({ products: { storeId: 'store-a' }, stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, merchantB, 'p1')).rejects.toThrow(ForbiddenException);
  });

  it('denies access when the product does not exist', async () => {
    const db = makeMockDb({ products: null });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, merchantB, 'missing')).rejects.toThrow(ForbiddenException);
  });

  it('denies access when the product has no storeId (canonical product)', async () => {
    const db = makeMockDb({ products: { storeId: null } });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, merchantB, 'p1')).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN bypasses ownership check', async () => {
    const db = makeMockDb({ products: { storeId: 'store-a' }, stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, adminUser, 'p1')).resolves.toBeUndefined();
  });

  it('SUPER_ADMIN bypasses ownership check', async () => {
    const db = makeMockDb({ products: { storeId: 'store-a' }, stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, superAdmin, 'p1')).resolves.toBeUndefined();
  });

  it('MODERATOR bypasses ownership check', async () => {
    const db = makeMockDb({ products: { storeId: 'store-a' }, stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertProductInOrg(db, moderator, 'p1')).resolves.toBeUndefined();
  });
});

// ── assertStoreInOrg ────────────────────────────────────────────

describe('assertStoreInOrg', () => {
  it('allows merchant A to access their own store', async () => {
    const db = makeMockDb({ stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, merchantA, 'store-a')).resolves.toBeUndefined();
  });

  it('denies merchant B access to merchant A\'s store', async () => {
    const db = makeMockDb({ stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, merchantB, 'store-a')).rejects.toThrow(ForbiddenException);
  });

  it('denies when the store does not exist', async () => {
    const db = makeMockDb({ stores: null });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, merchantB, 'missing')).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN bypasses store ownership check', async () => {
    const db = makeMockDb({ stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, adminUser, 'store-a')).resolves.toBeUndefined();
  });
});

// ── assertVariantInOrg ──────────────────────────────────────────

describe('assertVariantInOrg', () => {
  it('denies merchant B access to variant on merchant A\'s product', async () => {
    const db = makeMockDb({
      productVariants: { productId: 'p1' },
      products: { storeId: 'store-a' },
      stores: { orgId: 'org-a' },
    });
    // @ts-expect-error — partial mock
    await expect(assertVariantInOrg(db, merchantB, 'v1')).rejects.toThrow(ForbiddenException);
  });

  it('allows merchant A access to variant on their own product', async () => {
    const db = makeMockDb({
      productVariants: { productId: 'p1' },
      products: { storeId: 'store-a' },
      stores: { orgId: 'org-a' },
    });
    // @ts-expect-error — partial mock
    await expect(assertVariantInOrg(db, merchantA, 'v1')).resolves.toBeUndefined();
  });

  it('ADMIN bypasses variant ownership check', async () => {
    const db = makeMockDb({
      productVariants: { productId: 'p1' },
      products: { storeId: 'store-a' },
      stores: { orgId: 'org-a' },
    });
    // @ts-expect-error — partial mock
    await expect(assertVariantInOrg(db, adminUser, 'v1')).resolves.toBeUndefined();
  });
});

// ── Offer store ownership (assertStoreInOrg via controller) ─────

describe('Offer store ownership', () => {
  it('rejects merchant B creating an offer with merchant A\'s storeId', async () => {
    const db = makeMockDb({ stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, merchantB, 'store-a')).rejects.toThrow(ForbiddenException);
  });

  it('allows merchant A to create an offer with their own storeId', async () => {
    const db = makeMockDb({ stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, merchantA, 'store-a')).resolves.toBeUndefined();
  });

  it('ADMIN can create offers on any store', async () => {
    const db = makeMockDb({ stores: { orgId: 'org-a' } });
    // @ts-expect-error — partial mock
    await expect(assertStoreInOrg(db, adminUser, 'store-a')).resolves.toBeUndefined();
  });
});
