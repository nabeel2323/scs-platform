import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MerchantController } from '../../../modules/merchant/merchant.controller';
import { assertStoreInOrg, assertStoreMember } from '../../../common/tenant-scope';

vi.mock('../../../common/tenant-scope', () => ({
  assertStoreInOrg: vi.fn(),
  assertStoreMember: vi.fn(),
}));

describe('MerchantController store detail access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertStoreInOrg).mockResolvedValue(undefined as any);
    vi.mocked(assertStoreMember).mockResolvedValue(undefined);
  });

  it('requires active-org and store membership before returning an internal store record', async () => {
    const merchantService = {
      resolveStoreId: vi.fn().mockResolvedValue('store-a'),
      getStore: vi
        .fn()
        .mockResolvedValue({ id: 'store-a', orgId: 'org-a', metadata: { internal: true } }),
    };
    const db = {};
    const controller = new MerchantController(merchantService as any, {} as any, db as any);
    const user = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

    await expect(controller.getStore(user as any, 'store-a')).resolves.toEqual({
      id: 'store-a',
      orgId: 'org-a',
      metadata: { internal: true },
    });

    expect(merchantService.resolveStoreId).toHaveBeenCalledWith('store-a');
    expect(assertStoreInOrg).toHaveBeenCalledWith(db, user, 'store-a');
    expect(assertStoreMember).toHaveBeenCalledWith(db, user, 'store-a');
    expect(merchantService.getStore).toHaveBeenCalledWith('store-a');
  });

  it('does not return the internal store record when membership authorization fails', async () => {
    vi.mocked(assertStoreMember).mockRejectedValue(new Error('not a member'));
    const merchantService = {
      resolveStoreId: vi.fn().mockResolvedValue('store-a'),
      getStore: vi.fn(),
    };
    const controller = new MerchantController(merchantService as any, {} as any, {} as any);

    await expect(
      controller.getStore({ sub: 'buyer-a', role: 'BUYER', activeOrg: 'org-a' } as any, 'store-a'),
    ).rejects.toThrow('not a member');
    expect(merchantService.getStore).not.toHaveBeenCalled();
  });

  it('uses the public projection for slug-based storefront reads', async () => {
    const merchantService = {
      getPublicStoreBySlug: vi
        .fn()
        .mockResolvedValue({ id: 'store-a', slug: 'store-a', displayName: 'Store A' }),
    };
    const controller = new MerchantController(merchantService as any, {} as any, {} as any);

    await expect(controller.getStoreBySlug('store-a')).resolves.toEqual({
      id: 'store-a',
      slug: 'store-a',
      displayName: 'Store A',
    });
    expect(merchantService.getPublicStoreBySlug).toHaveBeenCalledWith('store-a');
  });
});
