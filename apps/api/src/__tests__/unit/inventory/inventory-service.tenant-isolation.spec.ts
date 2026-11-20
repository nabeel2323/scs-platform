import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../../modules/inventory/inventory.service';
import type { CallerContext } from '../../../common/tenant-scope';

const merchant: CallerContext = {
  sub: 'merchant-a',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-a',
};

function makeService(options?: {
  memberships?: Array<{ storeId: string }>;
  memberStores?: Array<{ id: string }>;
  warehouses?: Array<{ id: string; storeId: string }>;
  warehouseStoreId?: string | null;
  productStoreId?: string | null;
  activeMembership?: { id: string } | null;
}) {
  const inventoryItemsFindMany = vi.fn().mockResolvedValue([{ id: 'inventory-a' }]);
  const storeMembersFindMany = vi
    .fn()
    .mockResolvedValue(options?.memberships ?? [{ storeId: 'store-a' }]);
  const storesFindMany = vi.fn().mockResolvedValue(options?.memberStores ?? [{ id: 'store-a' }]);
  const warehousesFindMany = vi
    .fn()
    .mockResolvedValue(options?.warehouses ?? [{ id: 'warehouse-a', storeId: 'store-a' }]);
  const warehousesFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.warehouseStoreId === null
        ? null
        : { storeId: options?.warehouseStoreId ?? 'store-a' },
    );
  const storesFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
  const storeMembersFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.activeMembership === null
        ? null
        : (options?.activeMembership ?? { id: 'membership-a' }),
    );
  const variantsFindFirst = vi.fn().mockResolvedValue({ productId: 'product-a' });
  const productsFindFirst = vi.fn().mockResolvedValue({
    storeId: options?.productStoreId === null ? null : (options?.productStoreId ?? 'store-a'),
  });
  const insert = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
  const db = {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              const membership = await storeMembersFindFirst();
              return membership ? [membership] : [];
            }),
          })),
        })),
      })),
      query: {
        inventoryItems: {
          findMany: inventoryItemsFindMany,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        storeMembers: {
          findMany: storeMembersFindMany,
          findFirst: storeMembersFindFirst,
        },
        stores: {
          findMany: storesFindMany,
          findFirst: storesFindFirst,
        },
        warehouses: {
          findMany: warehousesFindMany,
          findFirst: warehousesFindFirst,
        },
        productVariants: { findFirst: variantsFindFirst },
        products: { findFirst: productsFindFirst },
      },
      insert,
    },
  };
  const service = new InventoryService(db as any, { publish: vi.fn() } as any);
  return {
    service,
    db,
    spies: {
      inventoryItemsFindMany,
      storeMembersFindMany,
      storesFindMany,
      warehousesFindMany,
      warehousesFindFirst,
      storesFindFirst,
      storeMembersFindFirst,
      variantsFindFirst,
      productsFindFirst,
      insert,
    },
  };
}

describe('InventoryService — tenant-scoped low-stock and item creation', () => {
  it('limits unqualified low-stock results to active stores in the caller organization', async () => {
    const h = makeService({
      memberships: [{ storeId: 'store-a' }, { storeId: 'store-b' }],
      memberStores: [{ id: 'store-a' }],
      warehouses: [{ id: 'warehouse-a', storeId: 'store-a' }],
    });

    await expect(h.service.getLowStockItems(undefined, merchant)).resolves.toEqual([
      { id: 'inventory-a' },
    ]);

    expect(h.spies.storeMembersFindMany).toHaveBeenCalledOnce();
    expect(h.spies.storesFindMany).toHaveBeenCalledOnce();
    expect(h.spies.warehousesFindMany).toHaveBeenCalledOnce();
    expect(h.spies.inventoryItemsFindMany).toHaveBeenCalledOnce();
  });

  it('returns no low-stock items when the caller has no active store memberships', async () => {
    const h = makeService({ memberships: [] });

    await expect(h.service.getLowStockItems(undefined, merchant)).resolves.toEqual([]);

    expect(h.spies.storesFindMany).not.toHaveBeenCalled();
    expect(h.spies.warehousesFindMany).not.toHaveBeenCalled();
    expect(h.spies.inventoryItemsFindMany).not.toHaveBeenCalled();
  });

  it('fails closed when active organization is missing for unqualified low-stock reads', async () => {
    const h = makeService();
    await expect(
      h.service.getLowStockItems(undefined, { ...merchant, activeOrg: null }),
    ).resolves.toEqual([]);
    expect(h.spies.storeMembersFindMany).not.toHaveBeenCalled();
    expect(h.spies.inventoryItemsFindMany).not.toHaveBeenCalled();
  });

  it('denies an explicit warehouse low-stock read without active store membership', async () => {
    const h = makeService({ activeMembership: null });

    await expect(h.service.getLowStockItems('warehouse-a', merchant)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(h.spies.inventoryItemsFindMany).not.toHaveBeenCalled();
  });

  it('rejects creating inventory when the variant and warehouse belong to different stores', async () => {
    const h = makeService({ productStoreId: 'store-b' });

    await expect(
      h.service.createItem(
        {
          variantId: 'variant-a',
          warehouseId: 'warehouse-a',
          initialQty: 10,
        },
        merchant,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.spies.insert).not.toHaveBeenCalled();
  });

  it('denies creating inventory when the warehouse is outside the caller active organization', async () => {
    const h = makeService();
    h.spies.storesFindFirst.mockResolvedValue({ orgId: 'org-b' });

    await expect(
      h.service.createItem(
        {
          variantId: 'variant-a',
          warehouseId: 'warehouse-a',
        },
        merchant,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.spies.insert).not.toHaveBeenCalled();
  });
});
