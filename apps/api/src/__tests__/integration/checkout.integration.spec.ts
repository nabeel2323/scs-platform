import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrdersService } from '../../modules/orders/orders.service';
import { outboxEvents } from '../../modules/audit/audit.schema';

/**
 * Checkout Integration Tests
 *
 * Tests the full checkout flow:
 *   Cart → MOQ validation → Master order → Sub-orders → Order items
 *   → Financial breakdown → Status history → Cart conversion → Event publish
 *
 * DatabaseService and OutboxDispatcher are mocked to verify service orchestration.
 */

// ── Mock Data ─────────────────────────────────────────────────────

const BUYER_ID = 'buyer-001';
const CART_ID = 'cart-001';
const STORE_1 = 'store-001';
const STORE_2 = 'store-002';
const VARIANT_1 = 'variant-001';
const VARIANT_2 = 'variant-002';

const mockCart = {
  id: CART_ID,
  userId: BUYER_ID,
  status: 'ACTIVE',
  promoCode: null,
  promotionId: null,
  totalMinor: 5000,
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
    promoSnapshot: {},
    lineTotalMinor: 2000,
    offerId: 'offer-store-1-v1',
  },
  {
    id: 'ci-002',
    cartId: CART_ID,
    storeId: STORE_1,
    variantId: VARIANT_2,
    quantity: 5,
    priceMinor: 300,
    tierMinQty: 1,
    promoSnapshot: {},
    lineTotalMinor: 1500,
    offerId: 'offer-store-1-v2',
  },
  {
    id: 'ci-003',
    cartId: CART_ID,
    storeId: STORE_2,
    variantId: VARIANT_1,
    quantity: 3,
    priceMinor: 200,
    tierMinQty: 1,
    promoSnapshot: {},
    lineTotalMinor: 600,
    offerId: 'offer-store-2-v1',
  },
];

const mockVariant = { id: VARIANT_1, productId: 'prod-001', sku: 'SKU-001', title: 'Test Product' };
const mockProduct = {
  id: 'prod-001',
  title: 'Test Product',
  moq: 1,
  storeId: null,
  status: 'ACTIVE',
  deletedAt: null,
};
const mockOffers = [
  { id: 'offer-store-1-v1', storeId: STORE_1, productId: 'prod-001', variantId: VARIANT_1, status: 'ACTIVE', isAvailable: true, moq: 1, orderIncrement: 1, currency: 'SAR', priceListId: null, warehouseId: null, basePriceMinor: 200, compareAtPriceMinor: null, leadTimeDays: null },
  { id: 'offer-store-1-v2', storeId: STORE_1, productId: 'prod-001', variantId: VARIANT_2, status: 'ACTIVE', isAvailable: true, moq: 1, orderIncrement: 1, currency: 'SAR', priceListId: null, warehouseId: null, basePriceMinor: 300, compareAtPriceMinor: null, leadTimeDays: null },
  { id: 'offer-store-2-v1', storeId: STORE_2, productId: 'prod-001', variantId: VARIANT_1, status: 'ACTIVE', isAvailable: true, moq: 1, orderIncrement: 1, currency: 'SAR', priceListId: null, warehouseId: null, basePriceMinor: 200, compareAtPriceMinor: null, leadTimeDays: null },
];

// ── Mock Builder ──────────────────────────────────────────────────

function createMocks() {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const forUpdateRows: unknown[][] = [[mockProduct], mockOffers];
  const forUpdate = vi.fn().mockImplementation(async () => forUpdateRows.shift() ?? []);
  const updateWhere = vi.fn().mockImplementation(() => Object.assign(
    Promise.resolve(undefined),
    { returning: vi.fn().mockResolvedValue([{ id: 'updated-row' }]) },
  ));
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

  const db = {
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          for: forUpdate,
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
    // Mock transaction: executes callback with same mock db (no real tx needed in unit tests)
    transaction: vi.fn(async (cb: any) => cb(db)),
    query: {
      carts: { findFirst: vi.fn(), findMany: vi.fn() },
      cartItems: { findMany: vi.fn() },
      masterOrders: { findFirst: vi.fn() },
      orders: { findFirst: vi.fn(), findMany: vi.fn() },
      orderItems: { findMany: vi.fn() },
      orderFinancialBreakdown: { findFirst: vi.fn() },
      orderStatusHistory: { findMany: vi.fn() },
      productVariants: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: VARIANT_1, productId: 'prod-001', isActive: true },
          { id: VARIANT_2, productId: 'prod-001', isActive: true },
        ]),
      },
      merchantOffers: { findMany: vi.fn().mockResolvedValue(mockOffers) },
      products: { findFirst: vi.fn() },
      // Checkout fixtures use two active, verified stores by default. Tests
      // covering unreadable seller metadata explicitly override this with [].
      stores: {
        findMany: vi.fn().mockResolvedValue([
          { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
          { id: STORE_2, currency: 'SAR', orgId: 'org-2', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
        ]),
      },
      // A4-4: transitions now consult the stock ledger before writing the status.
      stockMovements: { findMany: vi.fn().mockResolvedValue([]) },
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
    redeemPromotion: vi
      .fn()
      .mockResolvedValue({ redemptionId: 'redemption-001', discountMinor: 0 }),
  } as any;

  return {
    db,
    mockDbService,
    mockOutbox,
    mockPromotions,
    insertValues,
    updateSet,
    updateWhere,
    forUpdate,
    forUpdateRows,
  };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new OrdersService(mocks.mockDbService, mocks.mockOutbox, mocks.mockPromotions);
}

function checkoutAsBuyer(service: OrdersService, input: any) {
  return service.checkout(input, { sub: BUYER_ID, role: 'BUYER' });
}



// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('Checkout Integration', () => {
  let service: OrdersService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  describe('cart validation', () => {
    it('should throw when no active cart exists', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(undefined);

      await expect(
        checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow('No active cart found');
    });

    it('should throw when cart is empty', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([]);

      await expect(
        checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow('Cart is empty');
    });
  });

  describe('MOQ validation', () => {
    it('should throw when quantity is below MOQ', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue({ ...mockProduct, moq: 50 });
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);

      await expect(
        checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow(/Minimum order quantity/);
    });

    it('revalidates locked offer terms when they change after cart validation', async () => {
      const cartLine = { ...mockCartItems[0], offerId: 'offer-001', quantity: 8 };
      const originalOffer = {
        id: 'offer-001',
        storeId: STORE_1,
        productId: 'prod-001',
        variantId: VARIANT_1,
        status: 'ACTIVE',
        isAvailable: true,
        moq: 5,
        orderIncrement: 3,
        currency: 'SAR',
        priceListId: null,
        warehouseId: null,
        basePriceMinor: 200,
        compareAtPriceMinor: null,
        leadTimeDays: null,
      };
      const updatedOffer = { ...originalOffer, orderIncrement: 4 };
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([cartLine]);
      mocks.db.query.merchantOffers.findMany.mockResolvedValue([originalOffer]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      // First FOR UPDATE result
      // First FOR UPDATE result is the product row; second is the current offer row.
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);
      mocks.forUpdateRows.splice(1, 1, [updatedOffer]);

      await expect(
        checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow('increments of 4');

      expect(mocks.forUpdate).toHaveBeenCalledTimes(2);
      expect(mocks.db.insert).not.toHaveBeenCalled();
    });

    it('should pass when quantity meets MOQ', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue({ ...mockProduct, moq: 5 });
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);
      // No idempotency key → getMasterOrder is the only findFirst call
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      const result = await checkoutAsBuyer(service, {
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
      });
      expect(result).toBeDefined();
    });
  });

  describe('idempotency', () => {
    it('should return existing order for duplicate idempotency key', async () => {
      const existingMaster = { id: 'existing-master-001', buyerId: BUYER_ID, status: 'SUBMITTED' };
      mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      const result = await checkoutAsBuyer(service, {
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
      });

      expect(result.id).toBe('existing-master-001');
    });

    it('should proceed with checkout when existing order is DRAFT', async () => {
      const draftMaster = { id: 'draft-001', buyerId: BUYER_ID, status: 'DRAFT' };
      // PHASE 1.1: masterOrders.findFirst is called 3 times:
      //   1. Pre-check (DRAFT -> fall through)
      //   2. Fingerprint check (no existing -> fall through)
      //   3. getMasterOrder (return created order)
      mocks.db.query.masterOrders.findFirst
        .mockResolvedValueOnce(draftMaster)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({ id: 'new-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);
      mocks.db.query.orders.findMany.mockResolvedValue([]);
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);

      await checkoutAsBuyer(service, {
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-002',
      });

      // Verify insert was called (new checkout proceeded past the DRAFT check)
      expect(mocks.db.insert).toHaveBeenCalled();
    });
  });

  describe('multi-store grouping', () => {
    it('should create separate sub-orders per store', async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue(mockCartItems);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      // master order + 2 sub-orders + items + financials + history = many inserts
      expect(mocks.db.insert.mock.calls.length).toBeGreaterThan(2);
    });
  });

  describe('cart conversion', () => {
    it('should mark cart as CONVERTED after checkout', async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      // Verify update was called (cart status → CONVERTED)
      expect(mocks.db.update).toHaveBeenCalled();
    });
  });

  describe('event publishing', () => {
    it('should publish order.submitted event', async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      // Checkout now writes the outbox event inside the DB transaction
      // (transactional outbox pattern) rather than calling outbox.publish().
      expect(mocks.db.insert).toHaveBeenCalledWith(outboxEvents);
    });
  });

  describe('checkout pricing (API-B4)', () => {
    // Find the first .values(...) argument that owns a given column.
    function findInsert(mockCalls: any[], key: string) {
      return mockCalls.map((c) => c[0]).find((v) => v && key in v);
    }

    it('applies promo discount + 15% VAT and populates the financial breakdown', async () => {
      const cartWithPromo = { ...mockCart, promoCode: 'SAVE500', promotionId: 'promo-001' };
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.carts.findFirst.mockResolvedValue(cartWithPromo);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]); // STORE_1, lineTotal 2000
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      // STORE_1 subtotal = 2000; promo yields a flat 500 discount.
      mocks.mockPromotions.resolveApplicable.mockResolvedValue({
        id: 'promo-001',
        storeId: STORE_1,
        code: 'SAVE500',
      });
      mocks.mockPromotions.calculateDiscount.mockReturnValue(500);

      await checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      // netGoods = 1500; VAT = round(1500 * 0.15) = 225; total = 1725.
      const orderRow = findInsert(mocks.insertValues.mock.calls, 'totalMinor');
      expect(orderRow).toMatchObject({
        storeId: STORE_1,
        subtotalMinor: 2000,
        discountMinor: 500,
        taxMinor: 225,
        totalMinor: 1725,
        promotionId: 'promo-001',
        promoCode: 'SAVE500',
      });

      // commission = round(1500 * 0.05) = 75; merchantNet = 1425.
      const breakdownRow = findInsert(mocks.insertValues.mock.calls, 'merchantNetMinor');
      expect(breakdownRow).toMatchObject({
        productsMinor: 2000,
        discountMinor: 500,
        taxMinor: 225,
        commissionMinor: 75,
        merchantNetMinor: 1425,
      });

      // The promo was redeemed against the sub-order.
      expect(mocks.mockPromotions.redeemPromotion).toHaveBeenCalledWith(
        'promo-001',
        BUYER_ID,
        expect.any(String),
        500,
      );
    });

    it('charges 15% VAT with no discount and no delivery fee on PICKUP', async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart); // no promo
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]); // subtotal 2000
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await checkoutAsBuyer(service, {
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        fulfillmentMethod: 'PICKUP',
      });

      // No promo -> discount 0; PICKUP -> delivery 0; VAT = round(2000 * 0.15) = 300; total = 2300.
      const orderRow = findInsert(mocks.insertValues.mock.calls, 'totalMinor');
      expect(orderRow).toMatchObject({
        discountMinor: 0,
        deliveryFeeMinor: 0,
        taxMinor: 300,
        totalMinor: 2300,
      });
      expect(mocks.mockPromotions.redeemPromotion).not.toHaveBeenCalled();
    });
  });

  describe('currency snapshot (A2-4)', () => {
    const runCheckout = async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({
        id: 'new-master',
        buyerId: BUYER_ID,
        status: 'SUBMITTED',
      });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      // Three lines across two suppliers, so grouping yields two sub-orders.
      mocks.db.query.cartItems.findMany.mockResolvedValue(mockCartItems);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      return checkoutAsBuyer(service, { buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });
    };

    const insertedOrders = () =>
      mocks.insertValues.mock.calls
        .map((c: any[]) => c[0])
        .filter((v: any) => v && 'currency' in v);

    it("records each supplier's own currency on its own sub-order", async () => {
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: 'SAR', orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
        { id: STORE_2, currency: 'AED', orgId: 'org-2', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);

      await runCheckout();

      const rows = insertedOrders();
      expect(rows).toHaveLength(2);
      expect(rows.find((r: any) => r['storeId'] === STORE_1)?.['currency']).toBe('SAR');
      expect(rows.find((r: any) => r['storeId'] === STORE_2)?.['currency']).toBe('AED');
      // One batch read for the whole checkout, not one per supplier.
      expect(mocks.db.query.stores.findMany).toHaveBeenCalledTimes(1);
    });

    it('stores nothing rather than a guessed code', async () => {
      // The seller is still present and eligible; only its currency is unknown.
      // Do not invent a currency code for the invoice snapshot.
      mocks.db.query.stores.findMany.mockResolvedValue([
        { id: STORE_1, currency: null, orgId: 'org-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
        { id: STORE_2, currency: null, orgId: 'org-2', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ]);

      await runCheckout();

      const rows = insertedOrders();
      expect(rows).toHaveLength(2);
      expect(rows.every((r: any) => r['currency'] === null)).toBe(true);
    });
  });
});
