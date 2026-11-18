import { describe, expect, it, vi } from 'vitest';
import { CatalogController } from '../../../modules/catalog/catalog.controller';
import type { DatabaseService } from '../../../common/database/database.service';

function makeController(membership: { id: string } | null) {
  const productFindFirst = vi.fn().mockResolvedValue({
    storeId: 'store-a',
    status: 'ACTIVE',
  });
  const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
  const membershipFindFirst = vi.fn().mockResolvedValue(membership);
  const getVariantMatrix = vi.fn().mockResolvedValue({ combinations: [] });

  const controller = new CatalogController(
    { getVariantMatrix } as any,
    {} as any,
    {} as any,
    {} as any,
    {
      db: {
        query: {
          products: { findFirst: productFindFirst },
          stores: { findFirst: storeFindFirst },
          storeMembers: { findFirst: membershipFindFirst },
        },
      },
    } as unknown as DatabaseService,
    {} as any,
    {} as any,
  );

  return { controller, getVariantMatrix, productFindFirst, storeFindFirst, membershipFindFirst };
}

describe('Catalog variant matrix publication visibility', () => {
  it('excludes inactive variants for a buyer viewing an ACTIVE product', async () => {
    const h = makeController(null);

    await h.controller.getVariantMatrix('product-a', {
      sub: 'buyer-a',
      role: 'BUYER',
      activeOrg: null,
    } as any);

    expect(h.getVariantMatrix).toHaveBeenCalledWith('product-a', false);
    expect(h.membershipFindFirst).not.toHaveBeenCalled();
  });

  it('includes inactive variants for an active member of the owning store', async () => {
    const h = makeController({ id: 'membership-a' });

    await h.controller.getVariantMatrix('product-a', {
      sub: 'merchant-a',
      role: 'MERCHANT_OWNER',
      activeOrg: 'org-a',
    } as any);

    expect(h.getVariantMatrix).toHaveBeenCalledWith('product-a', true);
    expect(h.membershipFindFirst).toHaveBeenCalledOnce();
  });
});
