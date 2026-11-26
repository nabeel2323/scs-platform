import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertInventoryItemMember,
  assertVariantStoreMember,
  assertWarehouseMember,
} from '../../../common/tenant-scope';
import type { DatabaseService } from '../../../common/database/database.service';
import type { CallerContext } from '../../../common/tenant-scope';

const merchant: CallerContext = {
  sub: 'merchant-a',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-a',
};

function makeDb(options?: {
  warehouseStoreId?: string | null;
  variantProductId?: string | null;
  productStoreId?: string | null;
  inventoryWarehouseId?: string | null;
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const storesFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
    );
  const warehousesFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.warehouseStoreId === null
        ? null
        : { storeId: options?.warehouseStoreId ?? 'store-a' },
    );
  const variantsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.variantProductId === null
        ? null
        : { productId: options?.variantProductId ?? 'product-a' },
    );
  const productsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.productStoreId === null ? null : { storeId: options?.productStoreId ?? 'store-a' },
    );
  const inventoryFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.inventoryWarehouseId === null
        ? null
        : { warehouseId: options?.inventoryWarehouseId ?? 'warehouse-a' },
    );
  const membershipsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.membership === null ? null : (options?.membership ?? { id: 'membership-a' }),
    );
  const organizationMembershipsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.membership === null ? null : (options?.membership ?? { id: 'org-membership-a' }),
    );

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              const membership = await organizationMembershipsFindFirst();
              return membership ? [membership] : [];
            }),
          })),
        })),
      })),
      query: {
        stores: { findFirst: storesFindFirst },
        warehouses: { findFirst: warehousesFindFirst },
        productVariants: { findFirst: variantsFindFirst },
        products: { findFirst: productsFindFirst },
        inventoryItems: { findFirst: inventoryFindFirst },
        storeMembers: { findFirst: membershipsFindFirst },
      },
    },
    spies: {
      storesFindFirst,
      warehousesFindFirst,
      variantsFindFirst,
      productsFindFirst,
      inventoryFindFirst,
      membershipsFindFirst,
      organizationMembershipsFindFirst,
    },
  };
}

describe('Inventory tenant scope — active store membership', () => {
  it('allows an active member to access a warehouse in their active organization', async () => {
    const h = makeDb();
    await expect(
      assertWarehouseMember(h as unknown as DatabaseService, merchant, 'warehouse-a'),
    ).resolves.toBe('store-a');
    expect(h.spies.organizationMembershipsFindFirst).toHaveBeenCalledOnce();
    expect(h.spies.membershipsFindFirst).toHaveBeenCalledOnce();
  });

  it('denies a same-organization user who is not an active member of the warehouse store', async () => {
    const h = makeDb({ membership: null });
    await expect(
      assertWarehouseMember(h as unknown as DatabaseService, merchant, 'warehouse-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a warehouse whose store belongs to another active organization', async () => {
    const h = makeDb({ storeOrgId: 'org-b' });
    await expect(
      assertWarehouseMember(h as unknown as DatabaseService, merchant, 'warehouse-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.membershipsFindFirst).not.toHaveBeenCalled();
  });

  it('resolves variant ownership through product and requires active store membership', async () => {
    const h = makeDb();
    await expect(
      assertVariantStoreMember(h as unknown as DatabaseService, merchant, 'variant-a'),
    ).resolves.toBe('store-a');
    expect(h.spies.variantsFindFirst).toHaveBeenCalledOnce();
    expect(h.spies.productsFindFirst).toHaveBeenCalledOnce();
    expect(h.spies.membershipsFindFirst).toHaveBeenCalledOnce();
  });

  it('denies inventory access through an inactive store membership', async () => {
    const h = makeDb({ membership: null });
    await expect(
      assertInventoryItemMember(h as unknown as DatabaseService, merchant, 'inventory-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.inventoryFindFirst).toHaveBeenCalledOnce();
    expect(h.spies.warehousesFindFirst).toHaveBeenCalledOnce();
  });

  it('denies inventory items whose variant belongs to a different store than the warehouse', async () => {
    const h = makeDb({ productStoreId: 'store-b' });
    await expect(
      assertInventoryItemMember(h as unknown as DatabaseService, merchant, 'inventory-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when an inventory item has no resolvable warehouse', async () => {
    const h = makeDb({ inventoryWarehouseId: null });
    await expect(
      assertInventoryItemMember(h as unknown as DatabaseService, merchant, 'inventory-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.warehousesFindFirst).not.toHaveBeenCalled();
  });

  it('fails closed when a variant has no owning product/store', async () => {
    const h = makeDb({ productStoreId: null });
    await expect(
      assertVariantStoreMember(h as unknown as DatabaseService, merchant, 'variant-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.membershipsFindFirst).not.toHaveBeenCalled();
  });
});
