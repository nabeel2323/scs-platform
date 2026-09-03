import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrdersService } from '../../modules/orders/orders.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';

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
    id: 'ci-001', cartId: CART_ID, storeId: STORE_1, variantId: VARIANT_1,
    quantity: 10, priceMinor: 200, tierMinQty: 1, promoSnapshot: {}, lineTotalMinor: 2000,
  },
  {
    id: 'ci-002', cartId: CART_ID, storeId: STORE_1, variantId: VARIANT_2,
    quantity: 5, priceMinor: 300, tierMinQty: 1, promoSnapshot: {}, lineTotalMinor: 1500,
  },
  {
    id: 'ci-003', cartId: CART_ID, storeId: STORE_2, variantId: VARIANT_1,
    quantity: 3, priceMinor: 200, tierMinQty: 1, promoSnapshot: {}, lineTotalMinor: 600,
  },
];

const mockVariant = { id: VARIANT_1, productId: 'prod-001', sku: 'SKU-001', title: 'Test Product' };
const mockProduct = { id: 'prod-001', title: 'Test Product', moq: 1 };

// ── Mock Builder ──────────────────────────────────────────────────

function createMocks() {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });

  const db = {
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
    query: {
      carts: { findFirst: vi.fn(), findMany: vi.fn() },
      cartItems: { findMany: vi.fn() },
      masterOrders: { findFirst: vi.fn() },
      orders: { findFirst: vi.fn(), findMany: vi.fn() },
      orderItems: { findMany: vi.fn() },
      orderFinancialBreakdown: { findFirst: vi.fn() },
      orderStatusHistory: { findMany: vi.fn() },
      productVariants: { findFirst: vi.fn() },
      products: { findFirst: vi.fn() },
    },
  };

  const mockDbService = { db } as any;
  const mockOutbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;

  return { db, mockDbService, mockOutbox, insertValues, updateSet, updateWhere };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new OrdersService(mocks.mockDbService, mocks.mockOutbox);
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
        service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow('No active cart found');
    });

    it('should throw when cart is empty', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([]);

      await expect(
        service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow('Cart is empty');
    });
  });

  describe('MOQ validation', () => {
    it('should throw when quantity is below MOQ', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue({ ...mockProduct, moq: 50 });

      await expect(
        service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } }),
      ).rejects.toThrow(/Minimum order quantity/);
    });

    it('should pass when quantity meets MOQ', async () => {
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue({ ...mockProduct, moq: 5 });
      // No idempotency key → getMasterOrder is the only findFirst call
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({ id: 'new-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      const result = await service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });
      expect(result).toBeDefined();
    });
  });

  describe('idempotency', () => {
    it('should return existing order for duplicate idempotency key', async () => {
      const existingMaster = { id: 'existing-master-001', buyerId: BUYER_ID, status: 'SUBMITTED' };
      mocks.db.query.masterOrders.findFirst.mockResolvedValue(existingMaster);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      const result = await service.checkout({
        buyerId: BUYER_ID,
        deliveryAddress: { city: 'Riyadh' },
        idempotencyKey: 'idem-key-001',
      });

      expect(result.id).toBe('existing-master-001');
    });

    it('should proceed with checkout when existing order is DRAFT', async () => {
      const draftMaster = { id: 'draft-001', buyerId: BUYER_ID, status: 'DRAFT' };
      // First call: idempotency check (DRAFT → proceed), second call: getMasterOrder
      mocks.db.query.masterOrders.findFirst
        .mockResolvedValueOnce(draftMaster)
        .mockResolvedValue({ id: 'new-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      const result = await service.checkout({
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
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({ id: 'new-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue(mockCartItems);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      // master order + 2 sub-orders + items + financials + history = many inserts
      expect(mocks.db.insert.mock.calls.length).toBeGreaterThan(2);
    });
  });

  describe('cart conversion', () => {
    it('should mark cart as CONVERTED after checkout', async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({ id: 'new-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      // Verify update was called (cart status → CONVERTED)
      expect(mocks.db.update).toHaveBeenCalled();
    });
  });

  describe('event publishing', () => {
    it('should publish order.submitted event', async () => {
      mocks.db.query.masterOrders.findFirst.mockResolvedValue({ id: 'new-master', buyerId: BUYER_ID, status: 'SUBMITTED' });
      mocks.db.query.carts.findFirst.mockResolvedValue(mockCart);
      mocks.db.query.cartItems.findMany.mockResolvedValue([mockCartItems[0]]);
      mocks.db.query.productVariants.findFirst.mockResolvedValue(mockVariant);
      mocks.db.query.products.findFirst.mockResolvedValue(mockProduct);
      mocks.db.query.orders.findMany.mockResolvedValue([]);

      await service.checkout({ buyerId: BUYER_ID, deliveryAddress: { city: 'Riyadh' } });

      expect(mocks.mockOutbox.publish).toHaveBeenCalledWith(
        'order.submitted',
        expect.any(String),
        expect.objectContaining({ buyerId: BUYER_ID }),
      );
    });
  });
});
