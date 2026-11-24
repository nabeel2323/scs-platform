import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogTaxonomyController } from '../../../modules/catalog/catalog.taxonomy.controller';

function buildController(status = 'DRAFT') {
  const taxonomy = {
    listProductTypes: vi.fn().mockResolvedValue([]),
    getProductType: vi.fn().mockResolvedValue({ id: 'type-1', status }),
    getProductTypeSchema: vi.fn().mockResolvedValue({ id: 'type-1' }),
    hasPublicCategoryBinding: vi.fn().mockResolvedValue(true),
  };
  const catalogService = {
    getProductsByProductType: vi.fn().mockResolvedValue([]),
  };
  const controller = new CatalogTaxonomyController(
    taxonomy as any,
    {} as any,
    catalogService as any,
  );
  return { controller, taxonomy, catalogService };
}

const buyer = { role: 'BUYER', perms: [] };
const productTypeManager = { role: 'ADMIN', perms: ['catalog:product-types:manage'] };

describe('CatalogTaxonomyController product-type visibility (G-002)', () => {
  it('restricts non-published list filters to product-type managers', async () => {
    const h = buildController();

    expect(() => h.controller.listProductTypes(undefined, 'ALL', buyer)).toThrow(
      ForbiddenException,
    );
    expect(h.taxonomy.listProductTypes).not.toHaveBeenCalled();
  });

  it('allows public users to list published product types', async () => {
    const h = buildController();

    await h.controller.listProductTypes('category-1', 'PUBLISHED', buyer);

    expect(h.taxonomy.listProductTypes).toHaveBeenCalledWith({
      categoryId: 'category-1',
      status: 'PUBLISHED',
    });
  });

  it('hides unpublished product type details and schemas from buyers', async () => {
    const h = buildController('DRAFT');

    await expect(h.controller.getProductType('type-1', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.controller.getProductTypeSchema('type-1', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.controller.getProductsByProductType('type-1', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(h.taxonomy.getProductTypeSchema).not.toHaveBeenCalled();
    expect(h.catalogService.getProductsByProductType).not.toHaveBeenCalled();
  });

  it('hides even published product types bound to legacy tenant categories', async () => {
    const h = buildController('PUBLISHED');
    h.taxonomy.hasPublicCategoryBinding.mockResolvedValue(false);

    await expect(h.controller.getProductType('type-1', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.controller.getProductTypeSchema('type-1', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.controller.getProductsByProductType('type-1', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.taxonomy.hasPublicCategoryBinding).toHaveBeenCalledTimes(3);
  });

  it('allows product-type managers to inspect draft product type details and schemas', async () => {
    const h = buildController('DRAFT');

    await expect(h.controller.getProductType('type-1', productTypeManager)).resolves.toMatchObject({
      id: 'type-1',
      status: 'DRAFT',
    });
    await expect(
      h.controller.getProductTypeSchema('type-1', productTypeManager),
    ).resolves.toMatchObject({ id: 'type-1' });
    await expect(
      h.controller.getProductsByProductType('type-1', productTypeManager),
    ).resolves.toEqual([]);

    expect(h.taxonomy.getProductTypeSchema).toHaveBeenCalledOnce();
    expect(h.catalogService.getProductsByProductType).toHaveBeenCalledOnce();
  });
});
