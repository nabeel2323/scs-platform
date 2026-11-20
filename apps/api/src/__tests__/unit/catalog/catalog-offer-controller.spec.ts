import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { CatalogOfferController } from '../../../modules/catalog/catalog.offer.controller';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

const merchant = {
  sub: 'merchant-user-1',
  role: 'MERCHANT',
  activeOrg: 'org-1',
} as JwtPayload;

function makeController(opts: { orgId?: string | null; member?: boolean } = {}) {
  const offerService = {
    listOffersForProduct: vi.fn().mockResolvedValue([{ id: 'active-offer' }]),
    listOffersForStore: vi.fn().mockResolvedValue([{ id: 'offer-1' }]),
    listOfferAnalytics: vi.fn().mockResolvedValue([{ offerId: 'offer-1' }]),
    listOfferTrend: vi.fn().mockResolvedValue([{ bucket: '2026-11-20' }]),
    proposeOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    createOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    approveOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    rejectOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    suspendOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    reactivateOffer: vi.fn().mockResolvedValue({ id: 'offer-1' }),
    getOffer: vi.fn().mockResolvedValue({ id: 'offer-1', storeId: 'store-1' }),
  };
  const db = {
    db: {
      query: {
        stores: {
          findFirst: vi
            .fn()
            .mockResolvedValue(
              opts.orgId === undefined
                ? { orgId: 'org-1' }
                : opts.orgId
                  ? { orgId: opts.orgId }
                  : null,
            ),
        },
        storeMembers: {
          findFirst: vi
            .fn()
            .mockResolvedValue(opts.member === false ? null : { id: 'membership-1' }),
        },
      },
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

describe('CatalogOfferController — merchant offer tenant authorization (G-001)', () => {
  it('allows an active store member to list only the requested store offers', async () => {
    const { controller, offerService } = makeController();
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

  it('uses the authenticated principal instead of a client-supplied proposal actor', async () => {
    const { controller, offerService } = makeController();
    await controller.proposeOffer(merchant, 'offer-1', { proposedBy: 'attacker-user' });
    expect(offerService.proposeOffer).toHaveBeenCalledWith('offer-1', merchant.sub, {
      sub: merchant.sub,
      role: merchant.role,
      activeOrg: merchant.activeOrg,
    });
  });
});

describe('CatalogOfferController — create offer actor attribution (G-001)', () => {
  it('overrides a forged proposedBy value with the authenticated principal', async () => {
    const { controller, offerService } = makeController();
    await controller.createOffer(merchant, {
      storeId: 'store-1',
      productId: 'product-1',
      status: 'PROPOSED',
      proposedBy: 'attacker-user',
    });
    expect(offerService.createOffer).toHaveBeenCalledWith({
      storeId: 'store-1',
      productId: 'product-1',
      status: 'PROPOSED',
      proposedBy: merchant.sub,
    });
  });
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
  it('allows an active member of the owning store to read offer detail', async () => {
    const { controller, offerService } = makeController();
    await expect(controller.getOffer(merchant, 'offer-1')).resolves.toMatchObject({
      id: 'offer-1',
    });
    expect(offerService.getOffer).toHaveBeenCalledWith('offer-1');
  });

  it('denies a same-organization non-member from reading offer detail', async () => {
    const { controller, offerService } = makeController({ member: false });
    await expect(controller.getOffer(merchant, 'offer-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(offerService.getOffer).toHaveBeenCalledWith('offer-1');
  });

  it('denies an admin-role caller without offer governance permission', async () => {
    const adminWithoutPermission = {
      ...merchant,
      role: 'ADMIN',
      perms: [],
    } as JwtPayload;
    const { controller } = makeController();
    await expect(controller.getOffer(adminWithoutPermission, 'offer-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a privileged admin with offer governance permission', async () => {
    const admin = {
      ...merchant,
      role: 'ADMIN',
      perms: ['catalog:offers:govern'],
    } as JwtPayload;
    const { controller } = makeController();
    await expect(controller.getOffer(admin, 'offer-1')).resolves.toMatchObject({ id: 'offer-1' });
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
});
