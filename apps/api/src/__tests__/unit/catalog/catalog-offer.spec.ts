import { describe, it, expect } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CatalogOfferService } from '../../../modules/catalog/catalog.offer.service';

/**
 * PHASE 4 — CatalogOfferService invariants (§ Merchant Offer, Rule 10).
 *
 * The backend stays authoritative: a new offer starts DRAFT/PROPOSED, MOQ ≥ 1, a
 * variant must belong to its product, a store may not duplicate an offer for the
 * same product/variant, status changes follow the governed lifecycle, and a
 * price list / warehouse linked to an offer must belong to the SAME store. We
 * drive the service with a mock DatabaseService shaped exactly like the Drizzle
 * surface it touches (`db.query.X.findFirst/findMany`, chainable insert/update).
 */

type Row = Record<string, unknown>;

const caller = { sub: 'merchant-user-1', role: 'MERCHANT', activeOrg: 'org-1' };

interface QueryConfig {
  // A single row (or null) for every call, or an ARRAY to return successive
  // rows on successive findFirst calls (e.g. dup-check → null, read-back → row).
  findFirst?: Row | Array<Row | null> | null;
  findMany?: Row[];
}

interface HarnessQueries {
  merchantOffers?: QueryConfig;
  products?: QueryConfig;
  productVariants?: QueryConfig;
  priceLists?: QueryConfig;
  warehouses?: QueryConfig;
  stores?: QueryConfig;
  storeMembers?: QueryConfig;
  organizationMembers?: QueryConfig;
  organizations?: QueryConfig;
}

interface Harness {
  svc: CatalogOfferService;
  inserted: unknown[];
  updated: unknown[];
  auditRecords: unknown[];
  findManyCalls: unknown[];
  merchantOfferFindFirstCalls: unknown[];
  updateConditions: unknown[];
}

function makeHarness(queries: HarnessQueries = {}): Harness {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const auditRecords: unknown[] = [];
  const findManyCalls: unknown[] = [];
  const merchantOfferFindFirstCalls: unknown[] = [];
  const updateConditions: unknown[] = [];

  const firstFn = (spec?: Row | Array<Row | null> | null, calls?: unknown[]) => {
    if (Array.isArray(spec)) {
      let i = 0;
      return async (config?: unknown) => {
        calls?.push(config);
        return spec[Math.min(i++, spec.length - 1)] ?? null;
      };
    }
    return async (config?: unknown) => {
      calls?.push(config);
      return (spec as Row | undefined | null) ?? null;
    };
  };

  const q = (cfg?: QueryConfig, calls?: unknown[]) => ({
    findFirst: firstFn(cfg?.findFirst, calls),
    findMany: async (config?: unknown) => {
      findManyCalls.push(config);
      return cfg?.findMany ?? [];
    },
  });

  const db = {
    db: {
      // The ranked-offer service uses a query-builder aggregate after loading
      // offers. Membership checks use the relational query API above, so this
      // generic aggregate mock must not be coupled to store membership fixtures.
      select: () => ({
        from: () => ({
          where: (condition?: unknown) => ({
            getSQL: () => sql`SELECT id FROM stores WHERE ${condition}`,
            groupBy: async () => [],
            limit: async () => [],
          }),
        }),
      }),
      query: {
        merchantOffers: q(queries.merchantOffers, merchantOfferFindFirstCalls),
        products: q(queries.products),
        productVariants: q(queries.productVariants),
        priceLists: q(queries.priceLists),
        warehouses: q(queries.warehouses),
        stores: q(queries.stores ?? { findFirst: { orgId: 'org-1' } }),
        storeMembers: q(queries.storeMembers ?? { findFirst: { id: 'membership-1' } }),
        organizationMembers: q(queries.organizationMembers ?? { findFirst: { id: 'org-membership-1' } }),
        organizations: q(queries.organizations ?? { findFirst: { id: 'org-1', isActive: true } }),
      },
      insert: () => ({
        values: (rows: unknown) => {
          inserted.push(rows);
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (patch: unknown) => ({
          where: (condition: unknown) => {
            updated.push(patch);
            updateConditions.push(condition);
            return {
              returning: async () => [{ id: 'updated-offer' }],
            };
          },
        }),
      }),
    },
  };

  // @ts-expect-error — partial mock is sufficient for the service's call surface
  const svc = new CatalogOfferService(db, {
    record: async (entry: unknown) => {
      auditRecords.push(entry);
    },
  });
  return { svc, inserted, updated, auditRecords, findManyCalls, merchantOfferFindFirstCalls, updateConditions };
}

describe('CatalogOfferService — create', () => {
  it('rejects an initial status other than DRAFT/PROPOSED', async () => {
    const { svc } = makeHarness();
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', status: 'ACTIVE' as never }, caller),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects MOQ below 1', async () => {
    const { svc } = makeHarness({ products: { findFirst: { id: 'p1' } } });
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', moq: 0 }, caller),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a variant that is not on the product', async () => {
    const { svc } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      productVariants: { findFirst: null },
    });
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', variantId: 'v-other' }, caller),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate store offer for the same variant', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      productVariants: { findFirst: { id: 'v1', productId: 'p1' } },
      merchantOffers: { findFirst: { id: 'existing', status: 'DRAFT' } },
    });
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', variantId: 'v1' }, caller),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(inserted.length).toBe(0);
  });

  it('inserts a product-level DRAFT offer then reads it back', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      // 1st merchantOffers.findFirst = dup check (none), 2nd = getOffer read-back.
      merchantOffers: { findFirst: [null, { id: 'o1', status: 'DRAFT', storeId: 's1' }] },
    });
    const offer = await svc.createOffer({ storeId: 's1', productId: 'p1', moq: 5 }, caller);
    expect(inserted[0]).toMatchObject({ storeId: 's1', productId: 'p1', status: 'DRAFT', moq: 5 });
    expect((offer as Row)['id']).toBe('o1');
  });
});

describe('CatalogOfferService — create-time store reference ownership (G-001)', () => {
  it('rejects a price list owned by another store before inserting an offer', async () => {
    const { svc, inserted } = makeHarness({
      priceLists: { findFirst: { id: 'foreign-price-list', storeId: 's2' } },
    });

    await expect(
      svc.createOffer(
        { storeId: 's1', productId: 'p1', priceListId: 'foreign-price-list' },
        caller,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted).toHaveLength(0);
  });

  it('rejects a warehouse owned by another store before inserting an offer', async () => {
    const { svc, inserted } = makeHarness({
      warehouses: { findFirst: { id: 'foreign-warehouse', storeId: 's2' } },
    });

    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', warehouseId: 'foreign-warehouse' }, caller),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted).toHaveLength(0);
  });

  it('accepts price list and warehouse references owned by the offer store', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      priceLists: { findFirst: { id: 'price-list-1', storeId: 's1' } },
      warehouses: { findFirst: { id: 'warehouse-1', storeId: 's1' } },
      merchantOffers: { findFirst: [null, { id: 'o1', status: 'DRAFT', storeId: 's1' }] },
    });

    await svc.createOffer(
      {
        storeId: 's1',
        productId: 'p1',
        priceListId: 'price-list-1',
        warehouseId: 'warehouse-1',
      },
      caller,
    );

    expect(inserted[0]).toMatchObject({
      storeId: 's1',
      priceListId: 'price-list-1',
      warehouseId: 'warehouse-1',
    });
  });
});

describe('CatalogOfferService — buyer product offer visibility (G-001)', () => {
  it('requires an ACTIVE store and ACTIVE, available offers for a canonical product', async () => {
    const { svc, findManyCalls } = makeHarness();
    await svc.listOffersForProduct('product-1');

    expect(findManyCalls).toHaveLength(1);
    const query = findManyCalls[0] as {
      where?: unknown;
      columns?: Record<string, boolean>;
    };
    expect(query.columns).toEqual({
      id: true,
      storeId: true,
      productId: true,
      variantId: true,
      status: true,
      currency: true,
      basePriceMinor: true,
      compareAtPriceMinor: true,
      moq: true,
      orderIncrement: true,
      leadTimeDays: true,
      isAvailable: true,
    });
    const compiled = new PgDialect().sqlToQuery(query.where as SQL);
    expect(compiled.sql.toLowerCase()).toContain(' in ');
    expect(compiled.sql).toContain('stores');
    expect(compiled.params).toContain('ACTIVE');
    expect(compiled.params).toContain(true);
  });

  it('applies the same ACTIVE-store predicate to ranked buyer offers', async () => {
    const { svc, findManyCalls } = makeHarness();
    await expect(svc.listOffersForProductRanked('product-1')).resolves.toEqual([]);

    expect(findManyCalls).toHaveLength(1);
    const query = findManyCalls[0] as { where?: unknown };
    const compiled = new PgDialect().sqlToQuery(query.where as SQL);
    expect(compiled.sql.toLowerCase()).toContain(' in ');
    expect(compiled.sql).toContain('stores');
    expect(compiled.params).toContain('ACTIVE');
    expect(compiled.params).toContain(true);
  });

  it('returns an allowlisted buyer projection from ranked offers', async () => {
    const { svc } = makeHarness({
      merchantOffers: {
        findMany: [
          {
            id: 'offer-1',
            storeId: 'store-1',
            productId: 'product-1',
            variantId: null,
            currency: 'SAR',
            basePriceMinor: 1200,
            moq: 1,
            leadTimeDays: 3,
            activatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
      stores: {
        findMany: [
          {
            id: 'store-1',
            displayName: 'Store One',
            slug: 'store-one',
            currency: 'SAR',
            verificationStatus: 'VERIFIED',
            hidePopularityBadge: false,
          },
        ],
      },
    });

    const ranked = await svc.listOffersForProductRanked('product-1');
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      offerId: 'offer-1',
      storeId: 'store-1',
      storeName: 'Store One',
      basePriceMinor: 1200,
      moq: 1,
    });
    expect(ranked[0]).not.toHaveProperty('priceListId');
  });
});

describe('CatalogOfferService — lifecycle', () => {
  it('refuses an illegal transition (DRAFT → ACTIVE)', async () => {
    const { svc } = makeHarness({ merchantOffers: { findFirst: { id: 'o1', status: 'DRAFT' } } });
    await expect(svc.approveOffer('o1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason to reject a proposed offer', async () => {
    const { svc } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', status: 'PROPOSED' } },
    });
    await expect(svc.rejectOffer('o1', 'admin-1', '  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when the offer does not exist', async () => {
    const { svc } = makeHarness({ merchantOffers: { findFirst: null } });
    await expect(svc.suspendOffer('missing', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CatalogOfferService — conditional ownership predicates (G-002)', () => {
  it('uses offer ID, current lifecycle status and owning store for merchant transitions', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'DRAFT' };
    const { svc, updateConditions } = makeHarness({
      merchantOffers: { findFirst: [offer, offer, { ...offer, status: 'PROPOSED' }] },
    });

    await svc.proposeOffer('o1', caller);

    expect(updateConditions).toHaveLength(1);
    const compiled = new PgDialect().sqlToQuery(updateConditions[0] as SQL);
    expect(compiled.params).toContain('o1');
    expect(compiled.params).toContain('DRAFT');
    expect(compiled.params).toContain('s1');
  });

  it('uses the previously-read updatedAt value for merchant pricing writes', async () => {
    const updatedAt = new Date('2026-11-25T10:00:00.000Z');
    const offer = { id: 'o1', storeId: 's1', status: 'DRAFT', updatedAt };
    const { svc, updateConditions } = makeHarness({
      merchantOffers: { findFirst: [offer, offer, offer] },
    });

    await svc.updateOfferPricing('o1', { basePriceMinor: 1250 }, caller);

    expect(updateConditions).toHaveLength(1);
    const compiled = new PgDialect().sqlToQuery(updateConditions[0] as SQL);
    expect(compiled.params).toContain('o1');
    expect(compiled.params).toContain('s1');
    expect(compiled.params.some((value) => new Date(value as any).getTime() === updatedAt.getTime())).toBe(true);
  });

  it('uses the previously-read lifecycle status as a compare-and-set predicate for governance transitions', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'PROPOSED' };
    const { svc, updateConditions } = makeHarness({
      merchantOffers: { findFirst: [offer, { ...offer, status: 'ACTIVE' }] },
    });

    await svc.approveOffer('o1', 'admin-1');

    expect(updateConditions).toHaveLength(1);
    const compiled = new PgDialect().sqlToQuery(updateConditions[0] as SQL);
    expect(compiled.params).toContain('o1');
    expect(compiled.params).toContain('PROPOSED');
  });
});

describe('CatalogOfferService — pricing/stock linkage', () => {
  it('rejects a price list owned by a different store', async () => {
    const { svc } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      priceLists: { findFirst: { id: 'pl1', storeId: 's2' } },
    });
    await expect(
      svc.updateOfferPricing(
        'o1',
        { priceListId: 'pl1' },
        { sub: 'merchant-user-1', role: 'MERCHANT', activeOrg: 'org-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a warehouse owned by a different store', async () => {
    const { svc } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      warehouses: { findFirst: { id: 'wh1', storeId: 's2' } },
    });
    await expect(
      svc.updateOfferPricing(
        'o1',
        { warehouseId: 'wh1' },
        { sub: 'merchant-user-1', role: 'MERCHANT', activeOrg: 'org-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates terms when the price list belongs to the offer store', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: {
        findFirst: [
          { id: 'o1', storeId: 's1', status: 'DRAFT', updatedAt: new Date('2026-11-25T10:00:00.000Z') },
          { id: 'o1', storeId: 's1', status: 'DRAFT', updatedAt: new Date('2026-11-25T10:00:00.000Z') },
          { id: 'o1', storeId: 's1', status: 'DRAFT', updatedAt: new Date('2026-11-25T10:00:00.000Z') },
        ],
      },
      priceLists: { findFirst: { id: 'pl1', storeId: 's1' } },
    });
    await svc.updateOfferPricing(
      'o1',
      { priceListId: 'pl1', basePriceMinor: 1200 },
      { sub: 'merchant-user-1', role: 'MERCHANT', activeOrg: 'org-1' },
    );
    expect(updated[0]).toMatchObject({ priceListId: 'pl1', basePriceMinor: 1200 });
  });
});

describe('CatalogOfferService — merchant principal boundary (G-001)', () => {
  it.each(['BUYER', 'FINANCE', 'ADMIN', 'MODERATOR', 'SYSTEM', 'SUPER_ADMIN'])(
    'rejects %s from merchant service entry points before database access',
    async (role) => {
      const unauthorized = { ...caller, role };
      const { svc, inserted, updated, merchantOfferFindFirstCalls } = makeHarness();

      await expect(
        svc.createOffer({ storeId: 's1', productId: 'p1' }, unauthorized),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.getOfferForMerchant('o1', unauthorized)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(svc.proposeOffer('o1', unauthorized)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        svc.updateOfferPricing('o1', { basePriceMinor: 100 }, unauthorized),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.withdrawOffer('o1', unauthorized)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(inserted).toHaveLength(0);
      expect(updated).toHaveLength(0);
      expect(merchantOfferFindFirstCalls).toHaveLength(0);
    },
  );

  it.each(['MERCHANT', 'MERCHANT_OWNER', 'MERCHANT_STAFF'])(
    'allows an active %s member to create an offer',
    async (role) => {
      const merchantCaller = { ...caller, role };
      const { svc, inserted } = makeHarness({
        products: { findFirst: { id: 'p1' } },
        merchantOffers: { findFirst: [null, { id: 'o1', status: 'DRAFT', storeId: 's1' }] },
      });

      await expect(
        svc.createOffer({ storeId: 's1', productId: 'p1' }, merchantCaller),
      ).resolves.toMatchObject({ id: 'o1' });
      expect(inserted[0]).toMatchObject({ storeId: 's1', productId: 'p1', status: 'DRAFT' });
    },
  );
});

describe('CatalogOfferService — merchant offer existence confidentiality (G-001)', () => {
  it('returns not found for a foreign-organization offer before loading full detail', async () => {
    const { svc, merchantOfferFindFirstCalls } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's2' } },
      stores: { findFirst: { orgId: 'org-2' } },
    });
    await expect(svc.getOfferForMerchant('o1', caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(merchantOfferFindFirstCalls).toHaveLength(1);
  });

  it('returns the same not-found response for a same-organization non-member', async () => {
    const { svc, merchantOfferFindFirstCalls } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1' } },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: null },
    });
    await expect(svc.getOfferForMerchant('o1', caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(merchantOfferFindFirstCalls).toHaveLength(1);
  });

  it('loads full offer detail only after active organization and membership checks', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'DRAFT' };
    const { svc, merchantOfferFindFirstCalls } = makeHarness({
      merchantOffers: { findFirst: [{ storeId: 's1' }, offer] },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: { id: 'membership-1' } },
    });
    await expect(svc.getOfferForMerchant('o1', caller)).resolves.toMatchObject({ id: 'o1' });
    expect(merchantOfferFindFirstCalls).toHaveLength(2);
  });
});

describe('CatalogOfferService — merchant mutation tenant authorization (G-001)', () => {
  it('denies a same-organization non-member from withdrawing an offer', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: null },
    });
    await expect(svc.withdrawOffer('o1', caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(updated).toHaveLength(0);
  });

  it('allows an active store member to withdraw an offer in their organization', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'DRAFT' };
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: [offer, offer, { ...offer, status: 'WITHDRAWN' }] },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: { id: 'membership-1' } },
    });
    await expect(svc.withdrawOffer('o1', caller)).resolves.toMatchObject({ status: 'WITHDRAWN' });
    expect(updated[0]).toMatchObject({ status: 'WITHDRAWN', isAvailable: false });
  });

  it('denies a member when the offer store belongs to another organization', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      stores: { findFirst: { orgId: 'org-2' } },
      storeMembers: { findFirst: { id: 'membership-1' } },
    });
    await expect(svc.withdrawOffer('o1', caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(updated).toHaveLength(0);
  });

  it('attributes pricing audit events to the authenticated member, not the original proposer', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'DRAFT', proposedBy: 'original-proposer' };
    const { svc, auditRecords } = makeHarness({
      merchantOffers: { findFirst: [offer, offer, offer] },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: { id: 'membership-1' } },
    });
    await svc.updateOfferPricing('o1', { basePriceMinor: 2500 }, caller);
    expect(auditRecords[0]).toMatchObject({
      actorType: 'MERCHANT',
      actorId: caller.sub,
      action: 'offer.pricing_updated',
    });
  });
});

describe('CatalogOfferService — admin governance audit attribution (G-001)', () => {
  it('records the authenticated reviewer for suspension', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'ACTIVE' };
    const { svc, auditRecords } = makeHarness({
      merchantOffers: { findFirst: [offer, { ...offer, status: 'SUSPENDED' }] },
    });
    await svc.suspendOffer('o1', 'admin-authenticated');
    expect(auditRecords[0]).toMatchObject({
      actorType: 'ADMIN',
      actorId: 'admin-authenticated',
      action: 'offer.suspended',
    });
  });

  it('records the authenticated reviewer for reactivation', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'SUSPENDED' };
    const { svc, auditRecords } = makeHarness({
      merchantOffers: { findFirst: [offer, { ...offer, status: 'ACTIVE' }] },
    });
    await svc.reactivateOffer('o1', 'admin-authenticated');
    expect(auditRecords[0]).toMatchObject({
      actorType: 'ADMIN',
      actorId: 'admin-authenticated',
      action: 'offer.reactivated',
    });
  });
});

describe('CatalogOfferService — proposal and pricing mutation membership enforcement (G-001)', () => {
  const caller = { sub: 'merchant-user-1', role: 'MERCHANT', activeOrg: 'org-1' };

  it('denies a same-organization non-member from proposing an offer', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: null },
    });
    await expect(svc.proposeOffer('o1', caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(updated).toHaveLength(0);
  });

  it('denies a same-organization non-member from changing offer pricing', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: null },
    });
    await expect(
      svc.updateOfferPricing('o1', { basePriceMinor: 2500 }, caller),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updated).toHaveLength(0);
  });
});

describe('CatalogOfferService — cross-tenant merchant mutation denial (G-001)', () => {
  const caller = { sub: 'merchant-user-1', role: 'MERCHANT', activeOrg: 'org-1' };

  it('denies a foreign-organization merchant from proposing an offer', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's2', status: 'DRAFT' } },
      stores: { findFirst: { orgId: 'org-2' } },
    });

    await expect(svc.proposeOffer('o1', caller)).rejects.toBeInstanceOf(NotFoundException);
    expect(updated).toHaveLength(0);
  });

  it('denies a foreign-organization merchant from changing offer pricing', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's2', status: 'DRAFT' } },
      stores: { findFirst: { orgId: 'org-2' } },
    });

    await expect(
      svc.updateOfferPricing('o1', { basePriceMinor: 2500 }, caller),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updated).toHaveLength(0);
  });

  it('allows an active member to propose and attributes the event to that member', async () => {
    const offer = { id: 'o1', storeId: 's1', status: 'DRAFT' };
    const { svc, updated, auditRecords } = makeHarness({
      merchantOffers: { findFirst: [offer, offer, { ...offer, status: 'PROPOSED' }] },
      stores: { findFirst: { orgId: 'org-1' } },
      storeMembers: { findFirst: { id: 'membership-1' } },
    });

    await expect(svc.proposeOffer('o1', caller)).resolves.toMatchObject({
      status: 'PROPOSED',
    });
    expect(updated[0]).toMatchObject({ status: 'PROPOSED', proposedBy: caller.sub });
    expect(auditRecords[0]).toMatchObject({
      actorType: 'MERCHANT',
      actorId: caller.sub,
      action: 'offer.proposed',
    });
  });
});

describe('CatalogOfferService — create tenant authorization (G-001)', () => {
  it('denies a foreign-organization merchant from creating an offer', async () => {
    const { svc, inserted } = makeHarness({
      stores: { findFirst: { orgId: 'org-2' } },
    });
    await expect(svc.createOffer({ storeId: 's2', productId: 'p1' }, caller)).rejects.toThrow(
      'You do not have access to this store',
    );
    expect(inserted).toHaveLength(0);
  });

  it('uses the authenticated caller for proposal and audit attribution', async () => {
    const { svc, inserted, auditRecords } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      merchantOffers: { findFirst: [null, { id: 'o1', status: 'PROPOSED', storeId: 's1' }] },
    });
    await svc.createOffer(
      { storeId: 's1', productId: 'p1', status: 'PROPOSED', proposedBy: 'forged-user' },
      caller,
    );
    expect(inserted[0]).toMatchObject({ proposedBy: caller.sub, status: 'PROPOSED' });
    expect(auditRecords[0]).toMatchObject({ actorId: caller.sub, action: 'offer.created' });
  });
});
