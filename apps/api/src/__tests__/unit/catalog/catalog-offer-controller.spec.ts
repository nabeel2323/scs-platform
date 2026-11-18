import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogOfferController } from '../../../modules/catalog/catalog.offer.controller';
import type { CatalogOfferService } from '../../../modules/catalog/catalog.offer.service';
import type { DatabaseService } from '../../../common/database/database.service';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

function makeHarness(options?: {
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const storeFindFirst = vi.fn().mockResolvedValue(
    options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
  );
  const membershipFindFirst = vi.fn().mockResolvedValue(options?.membership === null ? null : { id: 'member-a' });

  const db = {
    db: {
      query: {
        stores: { findFirst: storeFindFirst },
        storeMembers: { findFirst: membershipFindFirst },
      },
    },
  } as unknown as DatabaseService;

  const service = {
    listOffersForStore: vi.fn().mockResolvedValue([{ id: 'offer-a' }]),
    listOfferAnalytics: vi.fn().mockResolvedValue([{ offerId: 'offer-a' }]),
    listOfferTrend: vi.fn().mockResolvedValue([{ bucket: '2026-11-18' }]),
  } as unknown as CatalogOfferService;

  return {
    controller: new CatalogOfferController(service, db),
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

describe('CatalogOfferController — merchant read tenant isolation', () => {
  it('allows an active store member to list their own offers', async () => {
    const h = makeHarness();
    await expect(h.controller.listMerchantOffers(merchantUser, 'store-a')).resolves.toEqual([
      { id: 'offer-a' },
    ]);
    expect(h.storeFindFirst).toHaveBeenCalledOnce();
    expect(h.membershipFindFirst).toHaveBeenCalledOnce();
    expect(h.service.listOffersForStore).toHaveBeenCalledWith('store-a');
  });

  it('denies a merchant from another organization before reading offers', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(
      h.controller.listMerchantOffers(foreignMerchant, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.membershipFindFirst).not.toHaveBeenCalled();
    expect(h.service.listOffersForStore).not.toHaveBeenCalled();
  });

  it('denies an organization member who is not an active store member', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.listMerchantOffers(merchantUser, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.listOffersForStore).not.toHaveBeenCalled();
  });

  it('scopes analytics to the authenticated merchant store', async () => {
    const h = makeHarness();
    await expect(
      h.controller.listMerchantOfferAnalytics(merchantUser, 'store-a'),
    ).resolves.toEqual([{ offerId: 'offer-a' }]);
    expect(h.service.listOfferAnalytics).toHaveBeenCalledWith('store-a');
  });

  it('denies cross-organization analytics access', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(
      h.controller.listMerchantOfferAnalytics(foreignMerchant, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.listOfferAnalytics).not.toHaveBeenCalled();
  });

  it('scopes trend analytics to the authenticated merchant store', async () => {
    const h = makeHarness();
    await expect(
      h.controller.listMerchantOfferTrend(merchantUser, 'store-a', 'offer-a', 'week'),
    ).resolves.toEqual([{ bucket: '2026-11-18' }]);
    expect(h.service.listOfferTrend).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-a',
        offerId: 'offer-a',
        granularity: 'week',
      }),
    );
  });

  it('denies cross-organization trend access', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(
      h.controller.listMerchantOfferTrend(foreignMerchant, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.listOfferTrend).not.toHaveBeenCalled();
  });

  it('does not query tenant data when storeId is omitted', async () => {
    const h = makeHarness();
    await expect(h.controller.listMerchantOffers(merchantUser)).resolves.toEqual([]);
    await expect(h.controller.listMerchantOfferAnalytics(merchantUser)).resolves.toEqual([]);
    await expect(h.controller.listMerchantOfferTrend(merchantUser)).resolves.toEqual([]);
    expect(h.storeFindFirst).not.toHaveBeenCalled();
    expect(h.membershipFindFirst).not.toHaveBeenCalled();
    expect(h.service.listOffersForStore).not.toHaveBeenCalled();
    expect(h.service.listOfferAnalytics).not.toHaveBeenCalled();
    expect(h.service.listOfferTrend).not.toHaveBeenCalled();
  });

  it('allows platform administrators through the explicit privileged-role policy', async () => {
    const h = makeHarness();
    const admin = { sub: 'admin-1', role: 'ADMIN', activeOrg: null } as JwtPayload;
    await expect(h.controller.listMerchantOffers(admin, 'store-a')).resolves.toEqual([
      { id: 'offer-a' },
    ]);
    expect(h.storeFindFirst).not.toHaveBeenCalled();
    expect(h.membershipFindFirst).not.toHaveBeenCalled();
  });
});
