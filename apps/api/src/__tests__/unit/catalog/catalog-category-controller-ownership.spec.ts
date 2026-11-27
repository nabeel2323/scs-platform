import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogController } from '../../../modules/catalog/catalog.controller';

function buildController(options?: {
  category?: { id: string; storeId: string | null; isActive: boolean };
  storeOrgId?: string;
  member?: boolean;
}) {
  const service = {
    getCategory: vi.fn().mockResolvedValue(
      options?.category ?? { id: 'category-1', storeId: null, isActive: true },
    ),
    getCategoryContents: vi.fn().mockResolvedValue({ id: 'category-1' }),
    listCategoryProductTypes: vi.fn().mockResolvedValue([]),
    getCategoryProducts: vi.fn().mockResolvedValue({ direct: [], descendant: [] }),
    listCategories: vi.fn().mockResolvedValue([]),
    getTopCategories: vi.fn().mockResolvedValue([]),
  };
  const storeFindFirst = vi.fn().mockResolvedValue(
    options?.storeOrgId ? { orgId: options.storeOrgId } : null,
  );
  const storeMemberFindFirst = vi.fn().mockResolvedValue(
    options?.member === false ? null : { id: 'membership-1' },
  );
  const membershipWhere = vi.fn().mockResolvedValue([{ id: 'membership-1' }]);
  const db = {
    db: {
      query: {
        stores: { findFirst: storeFindFirst },
        storeMembers: { findFirst: storeMemberFindFirst },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: membershipWhere })),
        })),
      })),
    },
  };
  const controller = new CatalogController(
    service as any,
    {} as any,
    {} as any,
    {} as any,
    db as any,
    {} as any,
    {} as any,
  );
  return { controller, service, storeFindFirst, storeMemberFindFirst, membershipWhere };
}

const buyer = {
  sub: 'buyer-1',
  role: 'BUYER',
  activeOrg: 'org-a',
  perms: [],
} as any;

describe('CatalogController category tenant visibility (G-002)', () => {
  it('returns platform categories by default and ignores buyer includeInactive requests', async () => {
    const h = buildController();

    await h.controller.listCategories(buyer, undefined, undefined, 'true', 'true');

    expect(h.service.listCategories).toHaveBeenCalledWith({
      storeId: undefined,
      parentId: undefined,
      all: true,
      isActive: true,
    });
    expect(h.storeFindFirst).not.toHaveBeenCalled();
  });

  it('allows an active store member to list that store category scope', async () => {
    const h = buildController({ storeOrgId: 'org-a', member: true });

    await h.controller.listCategories(buyer, 'store-a');

    expect(h.storeFindFirst).toHaveBeenCalledOnce();
    expect(h.storeMemberFindFirst).toHaveBeenCalledOnce();
    expect(h.service.listCategories).toHaveBeenCalledWith({
      storeId: 'store-a',
      parentId: undefined,
      all: false,
      isActive: true,
    });
  });

  it('requires organization and active store membership before listing store categories', async () => {
    const h = buildController({ storeOrgId: 'org-b' });

    await expect(
      h.controller.listCategories(buyer, 'store-b'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.service.listCategories).not.toHaveBeenCalled();
    expect(h.membershipWhere).not.toHaveBeenCalled();
  });

  it('requires store membership before returning store-scoped search categories', async () => {
    const h = buildController({ storeOrgId: 'org-b' });

    await expect(h.controller.getTopCategories('store-b', buyer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.service.getTopCategories).not.toHaveBeenCalled();
  });

  it('does not disclose a foreign store category through the detail route', async () => {
    const h = buildController({
      category: { id: 'category-foreign', storeId: 'store-b', isActive: true },
      storeOrgId: 'org-b',
    });

    await expect(
      h.controller.getCategory('category-foreign', buyer),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.service.getCategoryContents).not.toHaveBeenCalled();
  });

  it('hides inactive platform categories from ordinary buyers', async () => {
    const h = buildController({
      category: { id: 'category-hidden', storeId: null, isActive: false },
    });

    await expect(h.controller.getCategory('category-hidden', buyer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.service.getCategoryContents).not.toHaveBeenCalled();
  });

  it('allows a category manager to request inactive categories', async () => {
    const h = buildController();
    const admin = {
      sub: 'admin-1',
      role: 'ADMIN',
      activeOrg: null,
      perms: ['catalog:categories:write'],
      iat: 1_700_000_000,
      exp: 1_800_000_000,
    };

    await h.controller.listCategories(admin, undefined, undefined, 'true', 'true');

    expect(h.service.listCategories).toHaveBeenCalledWith({
      storeId: undefined,
      parentId: undefined,
      all: true,
      isActive: undefined,
    });
  });
});
