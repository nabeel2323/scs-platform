import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../../modules/inventory/inventory.service';
import {
  assertInventoryItemMember,
  assertVariantStoreMember,
  assertWarehouseMember,
} from '../../../common/tenant-scope';

vi.mock('../../../common/tenant-scope', () => ({
  assertInventoryItemMember: vi.fn(),
  assertVariantStoreMember: vi.fn(),
  assertWarehouseMember: vi.fn(),
  assertStoreInOrg: vi.fn(),
  assertStoreMember: vi.fn(),
  isTenantPrivileged: vi.fn(() => false),
}));

const caller = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

describe('InventoryService.transferStock store boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertWarehouseMember).mockImplementation(async (_db, _caller, warehouseId) =>
      warehouseId === 'warehouse-source' ? 'store-a' : 'store-b',
    );
    vi.mocked(assertVariantStoreMember).mockResolvedValue('store-a');
    vi.mocked(assertInventoryItemMember).mockResolvedValue(undefined);
  });

  it('rejects a destination warehouse belonging to another store before starting a transfer transaction', async () => {
    const transaction = vi.fn();
    const findFirst = vi.fn().mockResolvedValue({
      id: 'inventory-item-a',
      warehouseId: 'warehouse-source',
      variantId: 'variant-a',
      qtyOnHand: 12,
      qtyReserved: 0,
    });
    const db = {
      db: {
        query: {
          inventoryItems: { findFirst },
        },
        transaction,
      },
    };
    const service = new InventoryService(db as any, { publish: vi.fn() } as any);

    await expect(
      service.transferStock(
        {
          inventoryItemId: 'inventory-item-a',
          fromWarehouseId: 'warehouse-source',
          toWarehouseId: 'warehouse-destination',
          quantity: 2,
          userId: 'merchant-a',
        } as any,
        caller as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(assertWarehouseMember).toHaveBeenCalledTimes(2);
    expect(assertVariantStoreMember).toHaveBeenCalledWith(db, caller, 'variant-a');
    expect(assertInventoryItemMember).toHaveBeenCalledWith(db, caller, 'inventory-item-a');
    expect(transaction).not.toHaveBeenCalled();
  });
});
