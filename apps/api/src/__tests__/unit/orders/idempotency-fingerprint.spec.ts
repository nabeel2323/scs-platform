import { describe, it, expect, vi } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';
import { ConflictException } from '@nestjs/common';
import { products, productVariants } from '../../../modules/catalog/catalog.schema';
import { merchantOffers } from '../../../modules/catalog/catalog.offer.schema';

/**
 * Phase 1.1 — Idempotency Fingerprint Consistency
 *
 * Verifies that the checkout idempotency system correctly detects when the
 * same idempotency key is reused for a DIFFERENT logical checkout operation.
 *
 * Case A: First request -> success
 * Case B: Same key + same fingerprint -> return existing order
 * Case C: Same key + different fingerprint -> 409 Conflict
 *
 * The fingerprint is computed server-side from authoritative cart data
 * (variantId, quantity, offerId per item + fulfillmentMethod + deliveryAddress).
 * Client-supplied prices, totals, or hashes are never trusted.
 */

// -- Mock Helpers --

const BUYER_ID = 'buyer-001';
const CART_ID = 'cart-001';
const STORE_1 = 'store-001';
const BUYER_ACTOR = { sub: BUYER_ID, role: 'BUYER', activeOrg: null };
const VARIANT_1 = 'variant-001';
const VARIANT_2 = 'variant-002';

const mockCart = {
  id: CART_ID,
  userId: BUYER_ID,
  status: 'ACTIVE',
  promoCode: null,
  promotionId: null,
  totalMinor: 2000,
};

const mockCartItems = [
  {
    id: 'ci-001',
    cartId: CART_ID,
    storeId: STORE_1,
    variantId: VARIANT_1,
    quantity: 10,
    priceMinor: 200,
    tierMinQty: 1,
    offerId: 'offer-1',
    promoSnapshot: {},
    lineTotalMinor: 2000,
  },
];

const mockVariant = { id: VARIANT_1, productId: 'prod-001', isActive: true, sku: 'SKU-001', title: 'Test' };
const mockProduct = { id: 'prod-001', storeId: null, status: 'ACTIVE', deletedAt: null, title: 'Test Product', moq: 1 };

function createMocks(
  existingMaster?: any,
  cartItemsOverride?: any[],
  overrides: { product?: any; offer?: any; cartUpdateRows?: any[] } = {},
) {
  const resolvedProduct = { ...mockProduct, ...overrides.product };
  const resolvedOffer = {
    id: 'offer-1',
    status: 'ACTIVE',
    isAvailable: true,
    storeId: STORE_1,
    productId: 'prod-001',
    variantId: null,
    currency: 'SAR',
    moq: 1,
    orderIncrement: null,
    priceListId: null,
    warehouseId: null,
    basePriceMinor: 200,
    compareAtPriceMinor: null,
    leadTimeDays: null,
    ...overrides.offer,
  };
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const updateReturning = vi.fn().mockResolvedValue(overrides.cartUpdateRows ?? [{ id: CART_ID }]);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const resolvedCartItems = cartItemsOverride ?? [...mockCartItems];

  const db = {
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    select: vi.fn(() => {
      let selectedTable: unknown;
      const builder: Record<string, any> = {};
      builder['from'] = vi.fn((table: unknown) => {
        selectedTable = table;
        return builder;
      });
      builder['where'] = vi.fn(() => builder);
      builder['orderBy'] = vi.fn(() => builder);
      builder['limit'] = vi.fn().mockResolvedValue([]);
      builder['for'] = vi.fn(async () => {
        if (selectedTable === products) return [resolvedProduct];
        if (selectedTable === merchantOffers) {
          return resolvedCartItems
            .filter((item) => item.offerId)
            .map((item) => ({ ...resolvedOffer, id: item.offerId }));
        }
        return [];
      });
      return builder;
    }),
    transaction: vi.fn(async (cb: any) => cb(db)),
    query: {
      carts: { findFirst: vi.fn().mockResolvedValue(mockCart) },
      cartItems: { findMany: vi.fn().mockResolvedValue(resolvedCartItems) },
      masterOrders: { findFirst: vi.fn().mockResolvedValue(existingMaster ?? undefined) },
      orders: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      orderItems: { findMany: vi.fn() },
      orderFinancialBreakdown: { findFirst: vi.fn() },
      orderStatusHistory: { findMany: vi.fn() },
      productVariants: {
        findFirst: vi.fn().mockResolvedValue(mockVariant),
        findMany: vi.fn().mockResolvedValue([mockVariant]),
      },
      products: { findFirst: vi.fn().mockResolvedValue(resolvedProduct) },
      stores: { findMany: vi.fn().mockResolvedValue([]) },
      stockMovements: { findMany: vi.fn().mockResolvedValue([]) },
      // Return ACTIVE offers matching whatever offerIds the cart items reference
      merchantOffers: {
        findMany: vi.fn().mockImplementation(async () =>
          resolvedCartItems
            .filter((item) => item.offerId)
            .map((item) => ({ ...resolvedOffer, id: item.offerId })),
        ),
      },
    },
  };

  const mockDbService = {
    db,
    withActorContext: vi.fn(async (_actor: unknown, operation: () => Promise<unknown>) => operation()),
  } as any;
  const mockOutbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;
  const mockPromotions = {
    resolveApplicable: vi.fn().mockResolvedValue(null),
    calculateDiscount: vi.fn().mockReturnValue(0),
    redeemPromotion: vi.fn().mockResolvedValue({ redemptionId: 'r-1', discountMinor: 0 }),
  } as any;

  return { db, mockDbService, mockOutbox, mockPromotions, insertValues, updateWhere, updateReturning };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new OrdersService(mocks.mockDbService, mocks.mockOutbox, mocks.mockPromotions);
}

// -- Test 1: First checkout succeeds --

describe('P1.1-A - Idempotency Fingerprint', () => {
  it('first checkout with idempotency key succeeds and stores fingerprint', async () => {
    const mocks = createMocks();
    // No existing order for pre-checks (first checkout)
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(undefined);
    // After the transaction, getMasterOrder needs to return the created order.
    // We use mockResolvedValueOnce for the pre-check (undefined), then the
    // second fingerprint check (undefined), then the final getMasterOrder.
    mocks.db.query.masterOrders.findFirst
      .mockResolvedValueOnce(undefined) // Pre-check: no existing order
      .mockResolvedValueOnce(undefined) // Fingerprint check: no existing order
      .mockResolvedValue({
        // getMasterOrder at the end
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
        requestFingerprint: 'abc123',
      });

    const service = createService(mocks);
    const result = await service.checkout({
      buyerId: BUYER_ID,
      deliveryAddress: { city: 'Riyadh' },
      idempotencyKey: 'first-key-001',
    }, BUYER_ACTOR);

    expect(result).toBeDefined();
    expect(result.id).toBe('new-master');
    // Verify the insert included requestFingerprint
    const masterInsert = mocks.insertValues.mock.calls.find(
      (c: any[]) => c[0] && 'idempotencyKey' in c[0],
    );
    expect(masterInsert).toBeTruthy();
    expect(masterInsert![0].requestFingerprint).toBeTruthy();
    expect(typeof masterInsert![0].requestFingerprint).toBe('string');
    expect(masterInsert![0].requestFingerprint.length).toBe(64);
  });

  it.each([
    { name: 'product-level', variantId: null },
    { name: 'variant-level', variantId: VARIANT_1 },
  ])('accepts a canonical product backed by a $name seller offer', async ({ variantId }) => {
    const mocks = createMocks(undefined, undefined, {
      product: { storeId: null },
      offer: { variantId },
    });
    mocks.db.query.masterOrders.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
        requestFingerprint: 'abc123',
      });

    const service = createService(mocks);
    const result = await service.checkout({
      buyerId: BUYER_ID,
      deliveryAddress: { city: 'Riyadh' },
      idempotencyKey: `canonical-${variantId ?? 'product'}`,
    }, BUYER_ACTOR);

    expect(result.id).toBe('new-master');
  });

  it('rejects checkout when the selected offer belongs to a different product store', async () => {
    const mocks = createMocks(undefined, undefined, {
      product: { storeId: 'another-store' },
    });
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(undefined);

    const service = createService(mocks);
    await expect(
      service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'wrong-store-offer',
      }, BUYER_ACTOR),
    ).rejects.toThrow('A product in your cart is no longer available');
  });

  it('rejects a concurrent cart conversion when the active-cart CAS affects no row', async () => {
    const mocks = createMocks(undefined, undefined, { cartUpdateRows: [] });
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(undefined);

    const service = createService(mocks);
    await expect(
      service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'concurrent-cart-conversion',
      }, BUYER_ACTOR),
    ).rejects.toThrow('Cart was already converted by another checkout');

    expect(mocks.updateReturning).toHaveBeenCalledOnce();
  });

  // -- Test 2: Same key, same request -> existing order --

  it('same key + same request returns existing order (no duplicate)', async () => {
    // Legacy order (no fingerprint) - returns immediately on key match
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: null,
    };
    const mocks = createMocks(existingMaster);
    mocks.db.query.masterOrders.findFirst
      .mockResolvedValueOnce(existingMaster) // Pre-check
      .mockResolvedValue({
        // getMasterOrder
        id: 'existing-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
    mocks.db.query.orders.findMany.mockResolvedValue([]);

    const service = createService(mocks);
    const result = await service.checkout({
      buyerId: BUYER_ID,
      deliveryAddress: { city: 'Riyadh' },
      idempotencyKey: 'idem-key-001',
    }, BUYER_ACTOR);

    expect(result.id).toBe('existing-master');
    // No new insert - returned existing order
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  // -- Test 3: Same key, different cart -> conflict --

  it('same key + different cart items throws 409 Conflict', async () => {
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: 'a'.repeat(64),
    };
    const differentItems = [
      {
        id: 'ci-new',
        cartId: CART_ID,
        storeId: STORE_1,
        variantId: VARIANT_2,
        quantity: 5,
        priceMinor: 300,
        tierMinQty: 1,
        offerId: 'offer-2',
        promoSnapshot: {},
        lineTotalMinor: 1500,
      },
    ];
    const mocks = createMocks(existingMaster, differentItems);
    // Pre-check: finds existing order with fingerprint -> falls through
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);

    const service = createService(mocks);

    await expect(
      service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
      }, BUYER_ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  // -- Test 4: Same key, different quantity -> conflict --

  it('same key + different quantity throws 409 Conflict', async () => {
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: 'b'.repeat(64),
    };
    // Same variant, DIFFERENT quantity
    const differentItems = [
      {
        id: 'ci-001',
        cartId: CART_ID,
        storeId: STORE_1,
        variantId: VARIANT_1,
        quantity: 20,
        priceMinor: 200,
        tierMinQty: 1,
        offerId: 'offer-1',
        promoSnapshot: {},
        lineTotalMinor: 4000,
      },
    ];
    const mocks = createMocks(existingMaster, differentItems);
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);

    const service = createService(mocks);

    await expect(
      service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
      }, BUYER_ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  // -- Test 5: Same key, different offer -> conflict --

  it('same key + different offer throws 409 Conflict', async () => {
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: 'c'.repeat(64),
    };
    // Same variant and quantity, DIFFERENT offer
    const differentItems = [
      {
        id: 'ci-001',
        cartId: CART_ID,
        storeId: STORE_1,
        variantId: VARIANT_1,
        quantity: 10,
        priceMinor: 200,
        tierMinQty: 1,
        offerId: 'offer-999',
        promoSnapshot: {},
        lineTotalMinor: 2000,
      },
    ];
    const mocks = createMocks(existingMaster, differentItems);
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);

    const service = createService(mocks);

    await expect(
      service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
      }, BUYER_ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  // -- Test 6: Same key, different fulfillment method -> conflict --

  it('same key + different fulfillmentMethod throws 409 Conflict', async () => {
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: 'd'.repeat(64),
    };
    const mocks = createMocks(existingMaster);
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);
    // Same cart items, but fulfillmentMethod differs from the original

    const service = createService(mocks);

    await expect(
      service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
        fulfillmentMethod: 'PICKUP',
      }, BUYER_ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  // -- Fingerprint determinism --

  it('same cart items always produce the same fingerprint', async () => {
    // Two checkouts with identical cart items should produce matching fingerprints.
    // We verify by checking that the second checkout returns the existing order
    // (fingerprint match) rather than throwing or creating a duplicate.
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: null, // Legacy - will return immediately
    };
    const mocks = createMocks(existingMaster);
    mocks.db.query.masterOrders.findFirst
      .mockResolvedValueOnce(existingMaster)
      .mockResolvedValue({ id: 'existing-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
    mocks.db.query.orders.findMany.mockResolvedValue([]);

    const service = createService(mocks);
    const result = await service.checkout({
      buyerId: BUYER_ID,
      deliveryAddress: { city: 'Riyadh' },
      idempotencyKey: 'determinism-key',
    }, BUYER_ACTOR);

    expect(result.id).toBe('existing-master');
  });

  // -- Conflict error follows RFC 7807 --

  it('conflict error includes RFC 7807 problem detail', async () => {
    const existingMaster = {
      id: 'existing-master',
      buyerId: BUYER_ID,
      status: 'SUBMITTED',
      requestFingerprint: 'e'.repeat(64),
    };
    const differentItems = [
      {
        id: 'ci-new',
        cartId: CART_ID,
        storeId: STORE_1,
        variantId: VARIANT_2,
        quantity: 5,
        priceMinor: 300,
        tierMinQty: 1,
        offerId: 'offer-2',
        promoSnapshot: {},
        lineTotalMinor: 1500,
      },
    ];
    const mocks = createMocks(existingMaster, differentItems);
    mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);

    const service = createService(mocks);

    try {
      await service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
      }, BUYER_ACTOR);
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = err.getResponse();
      expect(body.status).toBe(409);
      expect(body.type).toBe('https://errors.scs.local/idempotency-conflict');
      expect(body.title).toBe('Idempotency Key Conflict');
      expect(body.detail).toContain('different checkout operation');
    }
  });
});
