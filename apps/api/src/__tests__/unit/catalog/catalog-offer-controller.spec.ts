import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CatalogOfferController } from '../../../modules/catalog/catalog.offer.controller';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

const merchant = {
  sub: 'merchant-user-1',
  role: 'MERCHANT',
  activeOrg: 'org-1',
} as JwtPayload;

function makeController(
  opts: { orgId?: string | null; storeStatus?: string; member?: boolean; offerAccessDenied?: boolean } = {},
) {
  const offerService = {
    listOffersForProduct: vi.fn().mockResolvedValue([{ id: 'active-offer' }]),
    listOffersForStore: vi.fn().mockResolvedValue([{ id: 'offer-1' }]),
    listOfferAnalytics: vi.fn().mockResolvedValue([{ offerId: 'offer-1' }]),
    listOfferTrend: vi.fn().mockResolvedValue([{ bucket: '2026-11-20' }]),
    proposeOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    createOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    updateOfferPricing: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    withdrawOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    approveOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    rejectOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    suspendOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    reactivateOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    getOffer: vi.fn().mockResolvedValue({ id: 'offer-1', storeId: 'store-1' }),
    getOfferForMerchant: vi.fn().mockImplementation(async () => {
      if (opts.offerAccessDenied) throw new NotFoundException('Offer not found');
      return { id: 'offer-1', storeId: 'store-1' };
    }),
  };
  const db = {
    db: {
      query: {
        stores: {
          findFirst: vi
            .fn()
            .mockResolvedValue(
              opts.orgId === undefined
                ? { orgId: 'org-1', status: opts.storeStatus ?? 'ACTIVE' }
                : opts.orgId
                  ? { orgId: opts.orgId, status: opts.storeStatus ?? 'ACTIVE' }
                  : null,
            ),
        },
        storeMembers: {
          findFirst: vi
            .fn()
            .mockResolvedValue(opts.member === false ? null : { id: 'membership-1' }),
        },
      },
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => (opts.member === false ? [] : [{ id: 'membership-1' }]),
          }),
        }),
      })),
    },
  };
  // @ts-expect-error — only the database query surface used by tenant-scope is needed.
  return { controller: new CatalogOfferController(offerService as never, db), offerService, db };
}

describe('CatalogOfferController — buyer product offer visibility (G-001)', () => {
  it('does not accept a caller-selected status filter on the buyer endpoint', async () => {
    const { controller, offerService } = makeController();
    await expect(controller.listOffersForProduct('product-1')).resolves.toEqual([
      { id: 'active-offer' },
    ]);
    expect(offerService.listOffersForProduct).toHaveBeenCalledWith('product-1');
  });
});

describe('CatalogOfferController — merchant role acceptance (G-001)', () => {
  it.each(['MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT'])(
    'allows an active store member with the %s role to read merchant offers',
    async (role) => {
      const caller = { ...merchant, role } as JwtPayload;
      const { controller, offerService } = makeController();
      await expect(controller.listMerchantOffers(caller, 'store-1')).resolves.toEqual([
        { id: 'offer-1' },
      ]);
      await expect(controller.listMerchantOfferAnalytics(caller, 'store-1')).resolves.toEqual([
        { offerId: 'offer-1' },
      ]);
      await expect(controller.listMerchantOfferTrend(caller, 'store-1')).resolves.toEqual([
        { bucket: '2026-11-20' },
      ]);
      await expect(controller.getOffer(caller, 'offer-1')).resolves.toMatchObject({
        id: 'offer-1',
      });
      expect(offerService.listOffersForStore).toHaveBeenCalledWith('store-1');
      expect(offerService.listOfferAnalytics).toHaveBeenCalledWith('store-1');
      expect(offerService.listOfferTrend).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'store-1' }),
      );
      expect(offerService.getOfferForMerchant).toHaveBeenCalledWith(
        'offer-1',
        expect.objectContaining({ sub: caller.sub, activeOrg: caller.activeOrg }),
      );
    },
  );

  it('denies a buyer from merchant offer lists even if a store membership row exists', async () => {
    const buyer = { ...merchant, role: 'BUYER' } as JwtPayload;
    const { controller, offerService, db } = makeController();
    await expect(controller.listMerchantOffers(buyer, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
  });

  it('denies a buyer from merchant offer detail before loading the target offer', async () => {
    const buyer = { ...merchant, role: 'BUYER' } as JwtPayload;
    const { controller, offerService } = makeController();
    await expect(controller.getOffer(buyer, 'offer-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(offerService.getOffer).not.toHaveBeenCalled();
    expect(offerService.getOfferForMerchant).not.toHaveBeenCalled();
  });
});

describe('CatalogOfferController — merchant offer tenant authorization (G-001)', () => {
  it('allows an active store member to list only the requested store offers', async () => {
    const { controller, offerService } = makeController();
    await expect(controller.listMerchantOffers(merchant, 'store-1')).resolves.toEqual([
      { id: 'offer-1' },
    ]);
    expect(offerService.listOffersForStore).toHaveBeenCalledWith('store-1');
  });

  it('preserves merchant management access to a DRAFT store before buyer activation', async () => {
    const { controller, offerService } = makeController({ storeStatus: 'DRAFT' });
    await expect(controller.listMerchantOffers(merchant, 'store-1')).resolves.toEqual([
      { id: 'offer-1' },
    ]);
    expect(offerService.listOffersForStore).toHaveBeenCalledWith('store-1');
  });

  it('denies a same-organization user who is not an active member', async () => {
    const { controller, offerService } = makeController({ member: false });
    await expect(controller.listMerchantOffers(merchant, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
  });

  it('denies a foreign-organization merchant from the offer list before querying offers', async () => {
    const { controller, offerService } = makeController({ orgId: 'org-2' });
    await expect(controller.listMerchantOffers(merchant, 'store-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
  });

  it('denies a merchant without an active organization from store-scoped reads', async () => {
    const noActiveOrg = { ...merchant, activeOrg: null } as JwtPayload;
    const { controller, offerService } = makeController();
    await expect(controller.listMerchantOffers(noActiveOrg, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
  });

  it('denies a store belonging to another organization before querying offers', async () => {
    const { controller, offerService } = makeController({ orgId: 'org-2' });
    await expect(controller.listMerchantOfferAnalytics(merchant, 'store-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOfferAnalytics).not.toHaveBeenCalled();
  });

  it('applies the same membership check to analytics trends', async () => {
    const { controller, offerService } = makeController({ member: false });
    await expect(controller.listMerchantOfferTrend(merchant, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOfferTrend).not.toHaveBeenCalled();
  });

  it('denies foreign-organization access to merchant offer trends before querying data', async () => {
    const { controller, offerService } = makeController({ orgId: 'org-2' });
    await expect(controller.listMerchantOfferTrend(merchant, 'store-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOfferTrend).not.toHaveBeenCalled();
  });

  it('denies a revoked or inactive store member from analytics before querying data', async () => {
    const { controller, offerService } = makeController({ member: false });
    await expect(controller.listMerchantOfferAnalytics(merchant, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOfferAnalytics).not.toHaveBeenCalled();
  });

  it('applies the same membership check to store-wide analytics', async () => {
    const { controller, offerService } = makeController();
    await expect(controller.listMerchantOfferAnalytics(merchant, 'store-1')).resolves.toEqual([
      { offerId: 'offer-1' },
    ]);
    expect(offerService.listOfferAnalytics).toHaveBeenCalledWith('store-1');
  });

  it('does not query merchant data when storeId is omitted', async () => {
    const { controller, offerService, db } = makeController();
    await expect(controller.listMerchantOffers(merchant)).resolves.toEqual([]);
    expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
  });

  it('passes authenticated caller context instead of a client-supplied proposal actor', async () => {
    const { controller, offerService } = makeController();
    await controller.proposeOffer(merchant, 'offer-1', { proposedBy: 'attacker-user' });
    expect(offerService.proposeOffer).toHaveBeenCalledWith('offer-1', {
      sub: merchant.sub,
      role: merchant.role,
      activeOrg: merchant.activeOrg,
    });
  });
});

describe('CatalogOfferController — create offer actor attribution (G-001)', () => {
  it('passes tenant context while leaving actor attribution to the service', async () => {
    const { controller, offerService } = makeController();
    await controller.createOffer(merchant, {
      storeId: 'store-1',
      productId: 'product-1',
      status: 'PROPOSED',
      proposedBy: 'attacker-user',
    });
    expect(offerService.createOffer).toHaveBeenCalledWith(
      {
        storeId: 'store-1',
        productId: 'product-1',
        status: 'PROPOSED',
        proposedBy: 'attacker-user',
      },
      { sub: merchant.sub, role: merchant.role, activeOrg: merchant.activeOrg },
    );
  });
});

describe('CatalogOfferController — merchant mutation role authorization (G-001)', () => {
  it.each(['MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT'])(
    'allows %s to use merchant offer mutations when store membership is active',
    async (role) => {
      const caller = { ...merchant, role } as JwtPayload;
      const { controller, offerService } = makeController();

      await controller.createOffer(caller, {
        storeId: 'store-1',
        productId: 'product-1',
        status: 'PROPOSED',
      });
      await controller.proposeOffer(caller, 'offer-1', {});
      await controller.updateOfferPricing(caller, 'offer-1', { basePriceMinor: 1200 });
      await controller.withdrawOffer(caller, 'offer-1');

      expect(offerService.createOffer).toHaveBeenCalled();
      expect(offerService.proposeOffer).toHaveBeenCalled();
      expect(offerService.updateOfferPricing).toHaveBeenCalled();
      expect(offerService.withdrawOffer).toHaveBeenCalled();
    },
  );

  it.each(['BUYER', 'FINANCE', 'ADMIN', 'MODERATOR', 'SYSTEM', 'SUPER_ADMIN'])(
    'denies %s from merchant mutations even when merchant permissions are present',
    async (role) => {
      const caller = {
        ...merchant,
        role,
        perms: ['catalog:offers:write', 'catalog:offers:govern'],
      } as JwtPayload;
      const { controller, offerService, db } = makeController();

      await expect(
        controller.createOffer(caller, { storeId: 'store-1', productId: 'product-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.proposeOffer(caller, 'offer-1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        controller.updateOfferPricing(caller, 'offer-1', { basePriceMinor: 1200 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.withdrawOffer(caller, 'offer-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
      expect(offerService.createOffer).not.toHaveBeenCalled();
      expect(offerService.proposeOffer).not.toHaveBeenCalled();
      expect(offerService.updateOfferPricing).not.toHaveBeenCalled();
      expect(offerService.withdrawOffer).not.toHaveBeenCalled();
    },
  );
});

describe('CatalogOfferController — admin offer actor attribution (G-001)', () => {
  const admin = { sub: 'admin-user-1', role: 'ADMIN', activeOrg: null } as JwtPayload;

  it('uses the authenticated admin for approval, not a body-supplied reviewer', async () => {
    const { controller, offerService } = makeController();
    await controller.approveOffer(admin, 'offer-1');
    expect(offerService.approveOffer).toHaveBeenCalledWith('offer-1', admin.sub);
  });

  it('uses the authenticated admin for rejection, not a body-supplied reviewer', async () => {
    const { controller, offerService } = makeController();
    await controller.rejectOffer(admin, 'offer-1', { reason: 'Policy violation' });
    expect(offerService.rejectOffer).toHaveBeenCalledWith('offer-1', admin.sub, 'Policy violation');
  });
});

describe('CatalogOfferController — suspension actor attribution (G-001)', () => {
  const admin = { sub: 'admin-user-1', role: 'ADMIN', activeOrg: null } as JwtPayload;

  it('uses the authenticated admin for suspension', async () => {
    const { controller, offerService } = makeController();
    await controller.suspendOffer(admin, 'offer-1');
    expect(offerService.suspendOffer).toHaveBeenCalledWith('offer-1', admin.sub);
  });

  it('uses the authenticated admin for reactivation', async () => {
    const { controller, offerService } = makeController();
    await controller.reactivateOffer(admin, 'offer-1');
    expect(offerService.reactivateOffer).toHaveBeenCalledWith('offer-1', admin.sub);
  });
});

describe('CatalogOfferController — offer detail object authorization (G-001)', () => {
  it('delegates merchant detail reads to the scope-first service boundary', async () => {
    const { controller, offerService } = makeController();
    await expect(controller.getOffer(merchant, 'offer-1')).resolves.toMatchObject({
      id: 'offer-1',
    });
    expect(offerService.getOfferForMerchant).toHaveBeenCalledWith(
      'offer-1',
      expect.objectContaining({ sub: merchant.sub, activeOrg: merchant.activeOrg }),
    );
    expect(offerService.getOffer).not.toHaveBeenCalled();
  });

  it('returns not found for a same-organization non-member', async () => {
    const { controller, offerService } = makeController({
      member: false,
      offerAccessDenied: true,
    });
    await expect(controller.getOffer(merchant, 'offer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(offerService.getOfferForMerchant).toHaveBeenCalled();
    expect(offerService.getOffer).not.toHaveBeenCalled();
  });

  it('returns not found for a foreign-organization merchant', async () => {
    const { controller, offerService } = makeController({
      orgId: 'org-2',
      offerAccessDenied: true,
    });
    await expect(controller.getOffer(merchant, 'offer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(offerService.getOfferForMerchant).toHaveBeenCalled();
    expect(offerService.getOffer).not.toHaveBeenCalled();
  });

  it('returns not found when the merchant has no active organization', async () => {
    const noActiveOrg = { ...merchant, activeOrg: null } as JwtPayload;
    const { controller, offerService } = makeController({ offerAccessDenied: true });
    await expect(controller.getOffer(noActiveOrg, 'offer-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(offerService.getOfferForMerchant).toHaveBeenCalled();
    expect(offerService.getOffer).not.toHaveBeenCalled();
  });

  it('denies an admin-role caller without governance permission before lookup', async () => {
    const adminWithoutPermission = {
      ...merchant,
      role: 'ADMIN',
      perms: [],
    } as JwtPayload;
    const { controller, offerService } = makeController();
    await expect(controller.getOffer(adminWithoutPermission, 'offer-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.getOffer).not.toHaveBeenCalled();
    expect(offerService.getOfferForMerchant).not.toHaveBeenCalled();
  });

  it('allows a privileged admin with governance permission through the admin read', async () => {
    const admin = {
      ...merchant,
      role: 'ADMIN',
      perms: ['catalog:offers:govern'],
    } as JwtPayload;
    const { controller, offerService } = makeController();
    await expect(controller.getOffer(admin, 'offer-1')).resolves.toMatchObject({
      id: 'offer-1',
    });
    expect(offerService.getOffer).toHaveBeenCalledWith('offer-1');
    expect(offerService.getOfferForMerchant).not.toHaveBeenCalled();
  });
});

describe('CatalogOfferController — privileged merchant-list policy (G-001)', () => {
  it('allows a privileged administrator through the explicit tenant policy', async () => {
    const admin = {
      sub: 'admin-user-1',
      role: 'ADMIN',
      activeOrg: null,
      perms: ['catalog:offers:govern'],
      iat: 1,
      exp: 2,
    } as JwtPayload;
    const { controller, offerService, db } = makeController();
    await expect(controller.listMerchantOffers(admin, 'store-1')).resolves.toEqual([
      { id: 'offer-1' },
    ]);
    expect(offerService.listOffersForStore).toHaveBeenCalledWith('store-1');
    expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
    expect(db.db.query.storeMembers.findFirst).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'MODERATOR', 'SYSTEM', 'SUPER_ADMIN'])(
    'allows %s to inspect merchant offer surfaces only through governance permission',
    async (role) => {
      const privileged = {
        sub: 'platform-user-1',
        role,
        activeOrg: null,
        perms: ['catalog:offers:govern'],
        iat: 1,
        exp: 2,
      } as JwtPayload;
      const { controller, offerService, db } = makeController();

      await expect(controller.listMerchantOffers(privileged, 'store-1')).resolves.toEqual([
        { id: 'offer-1' },
      ]);
      await expect(controller.listMerchantOfferAnalytics(privileged, 'store-1')).resolves.toEqual([
        { offerId: 'offer-1' },
      ]);
      await expect(controller.listMerchantOfferTrend(privileged, 'store-1')).resolves.toEqual([
        { bucket: '2026-11-20' },
      ]);
      await expect(controller.getOffer(privileged, 'offer-1')).resolves.toMatchObject({
        id: 'offer-1',
      });

      expect(offerService.listOffersForStore).toHaveBeenCalledWith('store-1');
      expect(offerService.listOfferAnalytics).toHaveBeenCalledWith('store-1');
      expect(offerService.listOfferTrend).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'store-1' }),
      );
      expect(offerService.getOffer).toHaveBeenCalledWith('offer-1');
      expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
      expect(db.db.query.storeMembers.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['ADMIN', 'MODERATOR', 'FINANCE', 'SYSTEM', 'SUPER_ADMIN'])(
    'denies %s from every privileged offer read without governance permission before object lookup',
    async (role) => {
      const privileged = {
        sub: 'platform-user-1',
        role,
        activeOrg: null,
        perms: [],
        iat: 1,
        exp: 2,
      } as JwtPayload;
      const { controller, offerService, db } = makeController();

      await expect(controller.listMerchantOffers(privileged, 'store-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        controller.listMerchantOfferAnalytics(privileged, 'store-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.listMerchantOfferTrend(privileged, 'store-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(controller.getOffer(privileged, 'offer-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(offerService.listOffersForStore).not.toHaveBeenCalled();
      expect(offerService.listOfferAnalytics).not.toHaveBeenCalled();
      expect(offerService.listOfferTrend).not.toHaveBeenCalled();
      expect(offerService.getOffer).not.toHaveBeenCalled();
      expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
      expect(db.db.query.storeMembers.findFirst).not.toHaveBeenCalled();
    },
  );

  it('denies a privileged administrator without offer governance permission', async () => {
    const admin = {
      sub: 'admin-user-1',
      role: 'ADMIN',
      activeOrg: null,
      perms: [],
      iat: 1,
      exp: 2,
    } as JwtPayload;
    const { controller, offerService, db } = makeController();
    await expect(controller.listMerchantOffers(admin, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.listOffersForStore).not.toHaveBeenCalled();
    expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
  });

  it('denies privileged analytics and trend reads without governance permission', async () => {
    const admin = {
      sub: 'admin-user-1',
      role: 'ADMIN',
      activeOrg: null,
      perms: [],
      iat: 1,
      exp: 2,
    } as JwtPayload;
    const { controller, offerService, db } = makeController();

    await expect(controller.listMerchantOfferAnalytics(admin, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.listMerchantOfferTrend(admin, 'store-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(offerService.listOfferAnalytics).not.toHaveBeenCalled();
    expect(offerService.listOfferTrend).not.toHaveBeenCalled();
    expect(db.db.query.stores.findFirst).not.toHaveBeenCalled();
  });
});
