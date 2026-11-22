import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogOfferService } from '../../../modules/catalog/catalog.offer.service';
import { assertStoreInOrg, assertStoreMember } from '../../../common/tenant-scope';

vi.mock('../../../common/tenant-scope', () => ({
  assertStoreInOrg: vi.fn(),
  assertStoreMember: vi.fn(),
}));

describe('CatalogOfferService product ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertStoreInOrg).mockResolvedValue(undefined);
    vi.mocked(assertStoreMember).mockResolvedValue(undefined);
  });

  it('does not allow a store to create an offer against another store private product', async () => {
    const productFindFirst = vi.fn().mockResolvedValue(null);
    const insert = vi.fn();
    const db = {
      db: {
        query: {
          priceLists: { findFirst: vi.fn() },
          warehouses: { findFirst: vi.fn() },
          products: { findFirst: productFindFirst },
          merchantOffers: { findFirst: vi.fn() },
        },
        insert,
      },
    };
    const service = new CatalogOfferService(db as any, { record: vi.fn() } as any);

    await expect(
      service.createOffer(
        {
          storeId: 'store-a',
          productId: 'private-product-store-b',
          status: 'DRAFT',
          basePriceMinor: 1000,
        },
        { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(productFindFirst).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });
});
