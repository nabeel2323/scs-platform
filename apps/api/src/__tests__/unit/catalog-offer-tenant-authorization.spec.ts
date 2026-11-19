import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { CatalogOfferController } from '../../modules/catalog/catalog.offer.controller';
import type { CatalogOfferService } from '../../modules/catalog/catalog.offer.service';
import type { DatabaseService } from '../../common/database/database.service';
import type { JwtPayload } from '../../common/guards/current-user.decorator';
import { assertStoreInOrg, assertStoreMember } from '../../common/tenant-scope';

vi.mock('../../common/tenant-scope', () => ({
  assertStoreInOrg: vi.fn(),
  assertStoreMember: vi.fn(),
}));

const caller: JwtPayload = {
  sub: 'merchant-user',
  role: 'MERCHANT',
  activeOrg: 'merchant-org',
  iat: 1,
  exp: 2,
};

describe('CatalogOfferController merchant read tenant authorization', () => {
  let controller: CatalogOfferController;
  let offerService: {
    listOffersForStore: ReturnType<typeof vi.fn>;
    listOfferAnalytics: ReturnType<typeof vi.fn>;
    listOfferTrend: ReturnType<typeof vi.fn>;
  };

  const endpoints = [
    {
      name: 'offer list',
      invoke: (target: CatalogOfferController) =>
        target.listMerchantOffers(caller, 'foreign-or-owned-store'),
      serviceMethod: 'listOffersForStore' as const,
    },
    {
      name: 'offer analytics',
      invoke: (target: CatalogOfferController) =>
        target.listMerchantOfferAnalytics(caller, 'foreign-or-owned-store'),
      serviceMethod: 'listOfferAnalytics' as const,
    },
    {
      name: 'offer trend',
      invoke: (target: CatalogOfferController) =>
        target.listMerchantOfferTrend(caller, 'foreign-or-owned-store'),
      serviceMethod: 'listOfferTrend' as const,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertStoreInOrg).mockResolvedValue(undefined);
    vi.mocked(assertStoreMember).mockResolvedValue(undefined);

    offerService = {
      listOffersForStore: vi.fn().mockResolvedValue([]),
      listOfferAnalytics: vi.fn().mockResolvedValue([]),
      listOfferTrend: vi.fn().mockResolvedValue([]),
    };

    controller = new CatalogOfferController(
      offerService as unknown as CatalogOfferService,
      {} as DatabaseService,
    );
  });

  it.each(endpoints)('$name checks organization and active store membership before reading', async ({ invoke, serviceMethod }) => {
    await invoke(controller);

    expect(assertStoreInOrg).toHaveBeenCalledWith(
      expect.anything(),
      {
        sub: caller.sub,
        role: caller.role,
        activeOrg: caller.activeOrg,
      },
      'foreign-or-owned-store',
    );
    expect(assertStoreMember).toHaveBeenCalledWith(
      expect.anything(),
      {
        sub: caller.sub,
        role: caller.role,
        activeOrg: caller.activeOrg,
      },
      'foreign-or-owned-store',
    );
    expect(offerService[serviceMethod]).toHaveBeenCalledTimes(1);
  });

  it.each(endpoints)('$name rejects cross-organization access before querying offer data', async ({ invoke, serviceMethod }) => {
    vi.mocked(assertStoreInOrg).mockRejectedValueOnce(
      new ForbiddenException('You do not have access to this store'),
    );

    await expect(invoke(controller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(offerService[serviceMethod]).not.toHaveBeenCalled();
  });

  it.each(endpoints)('$name rejects callers without active store membership', async ({ invoke, serviceMethod }) => {
    vi.mocked(assertStoreMember).mockRejectedValueOnce(
      new ForbiddenException('You are not authorized for this store'),
    );

    await expect(invoke(controller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(offerService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('returns an empty list when storeId is omitted without querying the service', async () => {
    await expect(controller.listMerchantOffers(caller)).resolves.toEqual([]);
    await expect(controller.listMerchantOfferAnalytics(caller)).resolves.toEqual([]);
    await expect(controller.listMerchantOfferTrend(caller)).resolves.toEqual([]);

    expect(assertStoreInOrg).not.toHaveBeenCalled();
    expect(assertStoreMember).not.toHaveBeenCalled();
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
    expect(offerService.listOfferAnalytics).not.toHaveBeenCalled();
    expect(offerService.listOfferTrend).not.toHaveBeenCalled();
  });
});
