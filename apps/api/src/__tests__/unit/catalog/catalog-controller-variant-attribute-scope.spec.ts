import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogController } from '../../../modules/catalog/catalog.controller';
import { assertProductEditableByMerchant } from '../../../common/tenant-scope';

vi.mock('../../../common/tenant-scope', () => ({
  assertProductEditableByMerchant: vi.fn(),
  assertStoreMember: vi.fn(),
  assertStoreInOrg: vi.fn(),
  assertProductReadable: vi.fn(),
  canManageStoreCatalog: vi.fn(),
  canManageProductCatalog: vi.fn(),
}));

const user = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

function createController(variantResult: unknown) {
  const findFirst = vi.fn().mockResolvedValue(variantResult);
  const taxonomyService = {
    getVariantAttributeValues: vi.fn().mockResolvedValue([{ attributeCode: 'ram-gb', value: 16 }]),
  };
  const db = { db: { query: { productVariants: { findFirst } } } };
  const controller = new CatalogController(
    {} as any,
    {} as any,
    {} as any,
    taxonomyService as any,
    db as any,
    {} as any,
    {} as any,
  );
  return { controller, findFirst, taxonomyService, db };
}

describe('CatalogController variant attribute ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertProductEditableByMerchant).mockResolvedValue(undefined);
  });

  it('rejects a variant that does not belong to the authorized product', async () => {
    const harness = createController(null);

    await expect(
      harness.controller.getVariantAttributeValues(user as any, 'product-a', 'variant-b'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(assertProductEditableByMerchant).toHaveBeenCalledOnce();
    expect(harness.findFirst).toHaveBeenCalledOnce();
    expect(harness.taxonomyService.getVariantAttributeValues).not.toHaveBeenCalled();
  });

  it('loads variant attributes only after confirming the product-variant relationship', async () => {
    const harness = createController({ id: 'variant-a' });

    await expect(
      harness.controller.getVariantAttributeValues(user as any, 'product-a', 'variant-a'),
    ).resolves.toEqual([{ attributeCode: 'ram-gb', value: 16 }]);

    expect(harness.findFirst).toHaveBeenCalledOnce();
    expect(harness.taxonomyService.getVariantAttributeValues).toHaveBeenCalledWith('variant-a');
  });
});
