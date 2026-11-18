import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MerchantController } from '../../../modules/merchant/merchant.controller';
import type { MerchantService } from '../../../modules/merchant/merchant.service';
import type { DatabaseService } from '../../../common/database/database.service';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';
import type { StorageService } from '../../../common/storage/storage.service';

function makeHarness(options?: {
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const storeFindFirst = vi.fn().mockResolvedValue(
    options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
  );
  const membershipFindFirst = vi.fn().mockResolvedValue(
    options?.membership === null ? null : { id: 'member-a' },
  );
  const db = {
    db: {
      query: {
        stores: { findFirst: storeFindFirst },
        storeMembers: { findFirst: membershipFindFirst },
      },
    },
  } as unknown as DatabaseService;

  const service = {
    updateStore: vi.fn().mockResolvedValue({ id: 'store-a' }),
    createWarehouse: vi.fn().mockResolvedValue({ id: 'warehouse-a' }),
    listWarehousesByStore: vi.fn().mockResolvedValue([{ id: 'warehouse-a' }]),
    getWarehouse: vi.fn().mockResolvedValue({ id: 'warehouse-a', storeId: 'store-a' }),
    updateWarehouse: vi.fn().mockResolvedValue({ id: 'warehouse-a' }),
    submitVerification: vi.fn().mockResolvedValue({ id: 'verification-a' }),
  } as unknown as MerchantService;

  return {
    controller: new MerchantController(service, {} as StorageService, db),
    service,
    storeFindFirst,
    membershipFindFirst,
  };
}

const merchantUser = {
  sub: 'merchant-a',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-a',
} as JwtPayload;

const foreignMerchant = {
  sub: 'merchant-b',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-b',
} as JwtPayload;

describe('MerchantController — store and warehouse tenant isolation', () => {
  it('allows an active store member to list warehouses', async () => {
    const h = makeHarness();
    await expect(h.controller.listWarehouses(merchantUser, 'store-a')).resolves.toEqual([
      { id: 'warehouse-a' },
    ]);
    expect(h.service.listWarehousesByStore).toHaveBeenCalledWith('store-a');
  });

  it('denies cross-organization warehouse reads', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(
      h.controller.listWarehouses(foreignMerchant, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.listWarehousesByStore).not.toHaveBeenCalled();
  });

  it('denies same-organization users without active store membership', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.listWarehouses(merchantUser, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.listWarehousesByStore).not.toHaveBeenCalled();
  });

  it('checks target-store membership before updating a store', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.updateStore(merchantUser, 'store-a', { displayName: 'Changed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.updateStore).not.toHaveBeenCalled();
  });

  it('checks target-store membership before creating a warehouse', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(
      h.controller.createWarehouse(foreignMerchant, 'store-a', { name: 'Foreign warehouse' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.createWarehouse).not.toHaveBeenCalled();
  });

  it('resolves a warehouse parent store before updating it', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.updateWarehouse(merchantUser, 'warehouse-a', { name: 'Changed' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.getWarehouse).toHaveBeenCalledWith('warehouse-a');
    expect(h.service.updateWarehouse).not.toHaveBeenCalled();
  });

  it('checks store membership before submitting verification', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.submitVerification('store-a', merchantUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.submitVerification).not.toHaveBeenCalled();
  });
});
