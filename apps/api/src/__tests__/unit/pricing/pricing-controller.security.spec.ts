import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PricingController } from '../../../modules/pricing/pricing.controller';
import type { PricingService } from '../../../modules/pricing/pricing.service';
import type { DatabaseService } from '../../../common/database/database.service';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

function makeHarness(options?: {
  storeOrgId?: string | null;
  membership?: { id: string } | null;
  variantStoreId?: string | null;
}) {
  const storeFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
    );
  const membershipFindFirst = vi
    .fn()
    .mockResolvedValue(options?.membership === null ? null : { id: 'member-a' });
  const db = {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              const membership = await membershipFindFirst();
              return membership ? [membership] : [];
            }),
          })),
        })),
      })),
      query: {
        stores: { findFirst: storeFindFirst },
        storeMembers: { findFirst: membershipFindFirst },
      },
    },
  } as unknown as DatabaseService;

  const service = {
    createPriceList: vi.fn().mockResolvedValue({ id: 'list-a', storeId: 'store-a' }),
    getPriceList: vi.fn().mockResolvedValue({ id: 'list-a', storeId: 'store-a' }),
    listPriceListsByStore: vi.fn().mockResolvedValue([{ id: 'list-a' }]),
    updatePriceList: vi.fn().mockResolvedValue({ id: 'list-a' }),
    addTier: vi.fn().mockResolvedValue({ id: 'tier-a' }),
    getTier: vi.fn().mockResolvedValue({
      id: 'tier-a',
      priceListId: 'list-a',
      variantId: 'variant-a',
    }),
    listTiersByPriceList: vi.fn().mockResolvedValue([{ id: 'tier-a' }]),
    getProductPricing: vi.fn().mockResolvedValue([{ priceListId: 'list-a' }]),
    listTiersByVariant: vi.fn().mockResolvedValue([{ id: 'tier-a' }]),
    updateTier: vi.fn().mockResolvedValue({ id: 'tier-a' }),
    removeTier: vi.fn().mockResolvedValue({ success: true }),
    resolvePrice: vi.fn().mockResolvedValue({ unitPriceMinor: 1000, tierId: 'tier-a' }),
  } as unknown as PricingService;

  const catalogService = {
    getVariantStoreId: vi
      .fn()
      .mockResolvedValue(
        options?.variantStoreId === null ? null : (options?.variantStoreId ?? 'store-a'),
      ),
  } as any;

  return {
    controller: new PricingController(service, db, catalogService),
    service,
    catalogService,
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

describe('PricingController — tenant isolation', () => {
  it('allows an active store member to list their price lists', async () => {
    const h = makeHarness();
    await expect(h.controller.listPriceLists(merchantUser, 'store-a')).resolves.toEqual([
      { id: 'list-a' },
    ]);
    expect(h.service.listPriceListsByStore).toHaveBeenCalledWith('store-a');
  });

  it('denies cross-organization price-list reads', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(h.controller.listPriceLists(foreignMerchant, 'store-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.service.listPriceListsByStore).not.toHaveBeenCalled();
  });

  it('denies same-organization users without active store membership', async () => {
    const h = makeHarness({ membership: null });
    await expect(h.controller.listPriceLists(merchantUser, 'store-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.service.listPriceListsByStore).not.toHaveBeenCalled();
  });

  it('checks the price-list owner before returning a price list', async () => {
    const h = makeHarness({ membership: null });
    await expect(h.controller.getPriceList(merchantUser, 'list-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('checks both the price list and variant store before adding a tier', async () => {
    const h = makeHarness({ variantStoreId: 'store-b' });
    await expect(
      h.controller.addTier(merchantUser, 'list-a', {
        variantId: 'variant-a',
        unitPriceMinor: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.addTier).not.toHaveBeenCalled();
  });

  it('denies pricing resolution for a variant from another organization', async () => {
    const h = makeHarness({ variantStoreId: 'store-b', storeOrgId: 'org-b' });
    await expect(
      h.controller.resolvePrice(merchantUser, 'variant-a', 'list-a', '1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.resolvePrice).not.toHaveBeenCalled();
  });

  it('checks the owning price list before updating a tier', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.updateTier(merchantUser, 'tier-a', { unitPriceMinor: 500 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.updateTier).not.toHaveBeenCalled();
  });

  it('checks the owning price list before deleting a tier', async () => {
    const h = makeHarness({ membership: null });
    await expect(h.controller.removeTier(merchantUser, 'tier-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.service.removeTier).not.toHaveBeenCalled();
  });

  it('rejects a variant/store mismatch instead of returning another store price', async () => {
    const h = makeHarness({ variantStoreId: 'store-b' });
    await expect(
      h.controller.getProductPricing(merchantUser, 'variant-a', 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.getProductPricing).not.toHaveBeenCalled();
  });
});
