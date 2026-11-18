import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertProductReadable,
  canManageProductCatalog,
  canManageStoreCatalog,
} from '../../../common/tenant-scope';
import type { DatabaseService } from '../../../common/database/database.service';
import type { CallerContext } from '../../../common/tenant-scope';

const buyer: CallerContext = { sub: 'buyer-a', role: 'BUYER', activeOrg: null };
const merchant: CallerContext = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

function makeDb(options?: {
  status?: string;
  productStoreId?: string | null;
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const productsFindFirst = vi.fn().mockResolvedValue(
    options?.productStoreId === null
      ? null
      : { storeId: options?.productStoreId ?? 'store-a', status: options?.status ?? 'DRAFT' },
  );
  const storesFindFirst = vi.fn().mockResolvedValue(
    options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
  );
  const membershipsFindFirst = vi.fn().mockResolvedValue(
    options?.membership === null ? null : options?.membership ?? { id: 'membership-a' },
  );

  return {
    db: {
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
    expect(h.spies.membershipsFindFirst).toHaveBeenCalledOnce();
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
    expect(h.spies.membershipsFindFirst).toHaveBeenCalledOnce();
  });
});
