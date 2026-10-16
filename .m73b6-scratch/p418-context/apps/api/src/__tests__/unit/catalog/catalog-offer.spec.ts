import { describe, it, expect } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
}

interface Harness {
  svc: CatalogOfferService;
  inserted: unknown[];
  updated: unknown[];
}

function makeHarness(queries: HarnessQueries = {}): Harness {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  const firstFn = (spec?: Row | Array<Row | null> | null) => {
    if (Array.isArray(spec)) {
      let i = 0;
      return async () => spec[Math.min(i++, spec.length - 1)] ?? null;
    }
    return async () => (spec as Row | undefined | null) ?? null;
  };

  const q = (cfg?: QueryConfig) => ({
    findFirst: firstFn(cfg?.findFirst),
    findMany: async () => cfg?.findMany ?? [],
  });

  const db = {
    db: {
      query: {
        merchantOffers: q(queries.merchantOffers),
        products: q(queries.products),
        productVariants: q(queries.productVariants),
        priceLists: q(queries.priceLists),
        warehouses: q(queries.warehouses),
      },
      insert: () => ({
        values: (rows: unknown) => {
          inserted.push(rows);
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (patch: unknown) => ({
          where: () => {
            updated.push(patch);
            return Promise.resolve();
          },
        }),
      }),
    },
  };

  // @ts-expect-error — partial mock is sufficient for the service's call surface
  const svc = new CatalogOfferService(db, { record: async () => {} });
  return { svc, inserted, updated };
}

describe('CatalogOfferService — create', () => {
  it('rejects an initial status other than DRAFT/PROPOSED', async () => {
    const { svc } = makeHarness();
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', status: 'ACTIVE' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects MOQ below 1', async () => {
    const { svc } = makeHarness({ products: { findFirst: { id: 'p1' } } });
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', moq: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a variant that is not on the product', async () => {
    const { svc } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      productVariants: { findFirst: null },
    });
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', variantId: 'v-other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate store offer for the same variant', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      productVariants: { findFirst: { id: 'v1', productId: 'p1' } },
      merchantOffers: { findFirst: { id: 'existing', status: 'DRAFT' } },
    });
    await expect(
      svc.createOffer({ storeId: 's1', productId: 'p1', variantId: 'v1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(inserted.length).toBe(0);
  });

  it('inserts a product-level DRAFT offer then reads it back', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p1' } },
      // 1st merchantOffers.findFirst = dup check (none), 2nd = getOffer read-back.
      merchantOffers: { findFirst: [null, { id: 'o1', status: 'DRAFT', storeId: 's1' }] },
    });
    const offer = await svc.createOffer({ storeId: 's1', productId: 'p1', moq: 5 });
    expect(inserted[0]).toMatchObject({ storeId: 's1', productId: 'p1', status: 'DRAFT', moq: 5 });
    expect((offer as Row)['id']).toBe('o1');
  });
});

describe('CatalogOfferService — lifecycle', () => {
  it('refuses an illegal transition (DRAFT → ACTIVE)', async () => {
    const { svc } = makeHarness({ merchantOffers: { findFirst: { id: 'o1', status: 'DRAFT' } } });
    await expect(svc.approveOffer('o1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason to reject a proposed offer', async () => {
    const { svc } = makeHarness({ merchantOffers: { findFirst: { id: 'o1', status: 'PROPOSED' } } });
    await expect(svc.rejectOffer('o1', 'admin-1', '  ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the offer does not exist', async () => {
    const { svc } = makeHarness({ merchantOffers: { findFirst: null } });
    await expect(svc.suspendOffer('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CatalogOfferService — pricing/stock linkage', () => {
  it('rejects a price list owned by a different store', async () => {
    const { svc } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      priceLists: { findFirst: { id: 'pl1', storeId: 's2' } },
    });
    await expect(svc.updateOfferPricing('o1', { priceListId: 'pl1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a warehouse owned by a different store', async () => {
    const { svc } = makeHarness({
      merchantOffers: { findFirst: { id: 'o1', storeId: 's1', status: 'DRAFT' } },
      warehouses: { findFirst: { id: 'wh1', storeId: 's2' } },
    });
    await expect(svc.updateOfferPricing('o1', { warehouseId: 'wh1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('updates terms when the price list belongs to the offer store', async () => {
    const { svc, updated } = makeHarness({
      merchantOffers: { findFirst: [{ id: 'o1', storeId: 's1', status: 'DRAFT' }, { id: 'o1', storeId: 's1', status: 'DRAFT' }] },
      priceLists: { findFirst: { id: 'pl1', storeId: 's1' } },
    });
    await svc.updateOfferPricing('o1', { priceListId: 'pl1', basePriceMinor: 1200 });
    expect(updated[0]).toMatchObject({ priceListId: 'pl1', basePriceMinor: 1200 });
  });
});
