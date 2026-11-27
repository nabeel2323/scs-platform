import { ForbiddenException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  assertProductReadable,
  canManageProductCatalog,
  canManageStoreCatalog,
} from '../../../common/tenant-scope';
import type { DatabaseService } from '../../../common/database/database.service';
import { CatalogController } from '../../../modules/catalog/catalog.controller';
import type { CallerContext } from '../../../common/tenant-scope';

const buyer: CallerContext = { sub: 'buyer-a', role: 'BUYER', activeOrg: null };
const merchant: CallerContext = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

function makeDb(options?: {
  status?: string;
  productStoreId?: string | null;
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const productsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.productStoreId === null
        ? null
        : { storeId: options?.productStoreId ?? 'store-a', status: options?.status ?? 'DRAFT' },
    );
  const storesFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
    );
  const membershipsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.membership === null ? null : (options?.membership ?? { id: 'membership-a' }),
    );

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              const membership = await membershipsFindFirst();
              return membership ? [membership] : [];
            }),
          })),
        })),
      })),
      query: {
        products: { findFirst: productsFindFirst },
        stores: { findFirst: storesFindFirst },
        storeMembers: { findFirst: membershipsFindFirst },
      },
    },
    spies: { productsFindFirst, storesFindFirst, membershipsFindFirst },
  };
}

describe('Catalog publication visibility boundary', () => {
  it('allows authenticated buyers to read ACTIVE product details without store membership', async () => {
    const h = makeDb({ status: 'ACTIVE' });
    await expect(
      assertProductReadable(h as unknown as DatabaseService, buyer, 'product-a'),
    ).resolves.toBeUndefined();
    expect(h.spies.membershipsFindFirst).not.toHaveBeenCalled();
  });

  it('denies buyers access to DRAFT products', async () => {
    const h = makeDb({ status: 'DRAFT', membership: null });
    await expect(
      assertProductReadable(h as unknown as DatabaseService, buyer, 'product-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an active member of the owning store to read DRAFT product details', async () => {
    const h = makeDb({ status: 'DRAFT' });
    await expect(
      assertProductReadable(h as unknown as DatabaseService, merchant, 'product-a'),
    ).resolves.toBeUndefined();
    const membershipQueries = h.spies.membershipsFindFirst.mock.calls
      .filter(([input]) => input?.where)
      .map(([input]) => new PgDialect().sqlToQuery(input.where).params);
    expect(membershipQueries.some((params) =>
      params.includes('ACTIVE') && params.includes('merchant-a'),
    )).toBe(true);
  });

  it('denies a same-organization non-member access to DRAFT product details', async () => {
    const h = makeDb({ status: 'DRAFT', membership: null });
    await expect(
      assertProductReadable(h as unknown as DatabaseService, merchant, 'product-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a merchant whose active organization does not own the DRAFT product store', async () => {
    const h = makeDb({ status: 'DRAFT', storeOrgId: 'org-b' });
    await expect(
      assertProductReadable(h as unknown as DatabaseService, merchant, 'product-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.membershipsFindFirst).not.toHaveBeenCalled();
  });

  it('fails closed for missing or soft-deleted products', async () => {
    const h = makeDb({ productStoreId: null });
    await expect(
      assertProductReadable(h as unknown as DatabaseService, buyer, 'product-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not treat a same-organization non-member as a catalog manager', async () => {
    const h = makeDb({ membership: null });
    await expect(
      canManageStoreCatalog(h as unknown as DatabaseService, merchant, 'store-a'),
    ).resolves.toBe(false);
  });

  it('recognizes an active store member as a catalog manager for product variants', async () => {
    const h = makeDb();
    await expect(
      canManageProductCatalog(h as unknown as DatabaseService, merchant, 'product-a'),
    ).resolves.toBe(true);
    expect(h.spies.membershipsFindFirst).toHaveBeenCalled();
  });
});

function makeCatalogController(options?: {
  productStatus?: string;
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const productFindFirst = vi.fn().mockResolvedValue({
    storeId: 'store-a',
    status: options?.productStatus ?? 'ACTIVE',
  });
  const storeFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
    );
  const membershipFindFirst = vi.fn().mockResolvedValue(options?.membership ?? null);
  const catalogService = {
    listProductsByStore: vi.fn().mockResolvedValue([]),
    getProductDetail: vi.fn().mockResolvedValue({ id: 'product-a' }),
    listVariantsByProduct: vi.fn().mockResolvedValue([]),
    listMediaByProduct: vi.fn().mockResolvedValue([]),
  };
  const controller = new CatalogController(
    catalogService as any,
    {} as any,
    {} as any,
    {} as any,
    {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => {
                const membership = await membershipFindFirst();
                return membership ? [membership] : [];
              }),
            })),
          })),
        })),
        query: {
          products: { findFirst: productFindFirst },
          stores: { findFirst: storeFindFirst },
          storeMembers: { findFirst: membershipFindFirst },
        },
      },
      withActorContext: vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => operation()),
    } as unknown as DatabaseService,
    {} as any,
    {} as any,
  );
  return { controller, catalogService, productFindFirst, storeFindFirst, membershipFindFirst };
}

describe('Catalog publication visibility at controller boundaries', () => {
  it('forces ACTIVE status on store grids for buyers even if they request DRAFT', async () => {
    const h = makeCatalogController();
    await h.controller.listProducts('store-a', buyer as any, 'DRAFT');
    expect(h.catalogService.listProductsByStore).toHaveBeenCalledWith(
      'store-a',
      expect.objectContaining({ status: 'ACTIVE' }),
    );
  });

  it('denies a buyer product-detail request for a DRAFT product before service access', async () => {
    const h = makeCatalogController({ productStatus: 'DRAFT' });
    await expect(h.controller.getProduct('product-a', buyer as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.catalogService.getProductDetail).not.toHaveBeenCalled();
  });

  it('requests the public product-detail representation for a buyer', async () => {
    const h = makeCatalogController();
    await h.controller.getProduct('product-a', buyer as any);
    expect(h.catalogService.getProductDetail).toHaveBeenCalledWith('product-a', buyer, false);
  });

  it('preserves studio product-detail visibility for an active owning-store member', async () => {
    const h = makeCatalogController({
      productStatus: 'DRAFT',
      membership: { id: 'membership-a' },
    });
    await h.controller.getProduct('product-a', merchant as any);
    expect(h.catalogService.getProductDetail).toHaveBeenCalledWith('product-a', merchant, true);
  });

  it('requests only active variants on the buyer-facing variant endpoint', async () => {
    const h = makeCatalogController();
    await h.controller.listVariants('product-a', buyer as any);
    expect(h.catalogService.listVariantsByProduct).toHaveBeenCalledWith('product-a', false);
  });

  it('protects media reads for unpublished products', async () => {
    const h = makeCatalogController({ productStatus: 'DRAFT' });
    await expect(h.controller.listMedia('product-a', buyer as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.catalogService.listMediaByProduct).not.toHaveBeenCalled();
  });
});
