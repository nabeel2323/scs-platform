import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrdersService } from '../../modules/orders/orders.service';

/**
 * Order Lifecycle Integration Tests
 *
 * Tests the full order lifecycle using a stateful mock database
 * that tracks status changes through update().set() calls.
 */

const ORDER_ID = 'order-001';
const STORE_ID = 'store-001';
const BUYER_ID = 'buyer-001';
const MERCHANT_ID = 'merchant-001';

/**
 * Creates a stateful mock that tracks order status changes.
 * When update().set({ status: 'X' }) is called, subsequent findFirst()
 * calls return the order with the updated status.
 */
function createStatefulMocks(initialStatus: string) {
  let currentOrder: Record<string, any> = {
    id: ORDER_ID,
    masterOrderId: 'master-001',
    storeId: STORE_ID,
    buyerId: BUYER_ID,
    status: initialStatus,
    fulfillmentMethod: 'PLATFORM_DELIVERY',
    subtotalMinor: 5000,
    discountMinor: 0,
    deliveryFeeMinor: 500,
    taxMinor: 750,
    totalMinor: 6250,
  };

  const insertValues = vi.fn().mockResolvedValue(undefined);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockImplementation((values: Record<string, any>) => {
    // Track status changes in the mock order
    if (values['status']) currentOrder = { ...currentOrder, status: values['status'] };
    if (values['subtotalMinor'] !== undefined) currentOrder = { ...currentOrder, subtotalMinor: values['subtotalMinor'] };
    if (values['totalMinor'] !== undefined) currentOrder = { ...currentOrder, totalMinor: values['totalMinor'] };
    return { where: updateWhere };
  });

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
      orders: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(currentOrder ? { ...currentOrder } : undefined)),
      },
      orderItems: { findMany: vi.fn().mockResolvedValue([]) },
      orderFinancialBreakdown: { findFirst: vi.fn() },
      orderStatusHistory: { findMany: vi.fn().mockResolvedValue([]) },
      masterOrders: { findFirst: vi.fn() },
      productVariants: { findFirst: vi.fn() },
      products: { findFirst: vi.fn() },
      carts: { findFirst: vi.fn() },
      cartItems: { findMany: vi.fn() },
    },
  };

  const mockDbService = { db } as any;
  const mockOutbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;

  return { db, mockDbService, mockOutbox, insertValues, updateSet, updateWhere, getOrder: () => currentOrder };
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('Order Lifecycle Integration', () => {
  describe('accept order', () => {
    it('should transition SUBMITTED → ACCEPTED', async () => {
      const mocks = createStatefulMocks('SUBMITTED');
      mocks.db.query.orderItems.findMany.mockResolvedValue([]);
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const result = await service.acceptOrder(ORDER_ID, MERCHANT_ID);

      expect(result.status).toBe('ACCEPTED');
      expect(mocks.mockOutbox.publish).toHaveBeenCalledWith(
        'order.accepted', ORDER_ID,
        expect.objectContaining({ orderId: ORDER_ID }),
      );
    });

    it('should reject ACCEPTED → ACCEPTED (double accept)', async () => {
      const mocks = createStatefulMocks('ACCEPTED');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await expect(service.acceptOrder(ORDER_ID, MERCHANT_ID)).rejects.toThrow(ConflictException);
    });

    it('should reject DELIVERED → ACCEPTED', async () => {
      const mocks = createStatefulMocks('DELIVERED');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await expect(service.acceptOrder(ORDER_ID, MERCHANT_ID)).rejects.toThrow(ConflictException);
    });
  });

  describe('reject order', () => {
    it('should transition SUBMITTED → REJECTED', async () => {
      const mocks = createStatefulMocks('SUBMITTED');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const result = await service.rejectOrder(ORDER_ID, MERCHANT_ID, 'Out of stock');

      expect(result.status).toBe('REJECTED');
      expect(mocks.mockOutbox.publish).toHaveBeenCalledWith(
        'order.rejected', ORDER_ID,
        expect.objectContaining({ reason: 'Out of stock' }),
      );
    });

    it('should reject ACCEPTED → REJECTED', async () => {
      const mocks = createStatefulMocks('ACCEPTED');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await expect(service.rejectOrder(ORDER_ID, MERCHANT_ID, 'Changed mind')).rejects.toThrow(ConflictException);
    });
  });

  describe('full lifecycle flow', () => {
    it('should support PENDING_CONFIRMATION → ACCEPTED → PREPARING → READY → DELIVERED → COMPLETED', async () => {
      const mocks = createStatefulMocks('PENDING_CONFIRMATION');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const transitions = [
        { to: 'ACCEPTED', actor: MERCHANT_ID, role: 'MERCHANT' },
        { to: 'PREPARING', actor: MERCHANT_ID, role: 'MERCHANT' },
        { to: 'READY', actor: MERCHANT_ID, role: 'MERCHANT' },
        { to: 'OUT_FOR_DELIVERY', actor: MERCHANT_ID, role: 'MERCHANT' },
        { to: 'DELIVERED', actor: MERCHANT_ID, role: 'MERCHANT' },
        { to: 'COMPLETED', actor: MERCHANT_ID, role: 'MERCHANT' },
      ];

      for (const { to, actor, role } of transitions) {
        const result = await service.transitionStatus(ORDER_ID, to, actor, role);
        expect(result.status).toBe(to);
      }
    });

    it('should publish correct events for each transition', async () => {
      const eventMap: Record<string, [string, string]> = {
        'ACCEPTED': ['PENDING_CONFIRMATION', 'order.accepted'],
        'PREPARING': ['ACCEPTED', 'order.preparing'],
        'READY': ['PREPARING', 'order.ready'],
        'OUT_FOR_DELIVERY': ['READY', 'order.out_for_delivery'],
        'DELIVERED': ['OUT_FOR_DELIVERY', 'order.delivered'],
        'COMPLETED': ['DELIVERED', 'order.completed'],
      };

      for (const [toStatus, [fromStatus, expectedEvent]] of Object.entries(eventMap)) {
        if (toStatus === 'ACCEPTED') continue; // acceptOrder has different flow
        const mocks = createStatefulMocks(fromStatus);
        const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

        await service.transitionStatus(ORDER_ID, toStatus, MERCHANT_ID, 'MERCHANT');

        expect(mocks.mockOutbox.publish).toHaveBeenCalledWith(
          expectedEvent, ORDER_ID,
          expect.objectContaining({ status: toStatus }),
        );
      }
    });

    it('should record status history on each transition', async () => {
      const mocks = createStatefulMocks('PENDING_CONFIRMATION');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await service.transitionStatus(ORDER_ID, 'ACCEPTED', MERCHANT_ID, 'MERCHANT');

      // insert called for status history record
      expect(mocks.db.insert).toHaveBeenCalled();
    });
  });

  describe('cancel order', () => {
    const cancellableStatuses = ['PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY', 'PAYMENT_PENDING'] as const;

    it.each(cancellableStatuses)('should allow cancel from %s', async (status) => {
      const mocks = createStatefulMocks(status);
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const result = await service.cancelOrder(ORDER_ID, BUYER_ID, 'Changed my mind');
      expect(result.status).toBe('CANCELLED');
    });

    it.each(['SUBMITTED', 'DELIVERED', 'COMPLETED', 'OUT_FOR_DELIVERY'])(
      'should reject cancel from %s',
      async (status) => {
        const mocks = createStatefulMocks(status);
        const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

        await expect(
          service.cancelOrder(ORDER_ID, BUYER_ID, 'Too late'),
        ).rejects.toThrow(ConflictException);
      },
    );

    it('should publish order.cancelled event', async () => {
      const mocks = createStatefulMocks('PENDING_CONFIRMATION');
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await service.cancelOrder(ORDER_ID, BUYER_ID, 'No longer needed');

      expect(mocks.mockOutbox.publish).toHaveBeenCalledWith(
        'order.cancelled', ORDER_ID,
        expect.objectContaining({ status: 'CANCELLED' }),
      );
    });
  });

  describe('query operations', () => {
    it('should throw NotFoundException for non-existent order', async () => {
      const mocks = createStatefulMocks('SUBMITTED');
      mocks.db.query.orders.findFirst.mockResolvedValue(undefined);
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await expect(service.getOrder('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return order with items and financial breakdown', async () => {
      const mocks = createStatefulMocks('ACCEPTED');
      mocks.db.query.orderItems.findMany.mockResolvedValue([
        { id: 'item-1', orderId: ORDER_ID, variantId: 'v1', sku: 'SKU-1', title: 'Item 1', quantity: 5, unitPriceMinor: 200, lineTotalMinor: 1000 },
      ]);
      mocks.db.query.orderFinancialBreakdown.findFirst.mockResolvedValue({
        orderId: ORDER_ID, productsMinor: 5000, commissionMinor: 313, merchantNetMinor: 5937,
      });
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const result = await service.getOrderWithItems(ORDER_ID);

      expect(result.items).toHaveLength(1);
      expect(result.financialBreakdown).toBeDefined();
      expect(result.status).toBe('ACCEPTED');
    });

    it('should return status history', async () => {
      const mocks = createStatefulMocks('ACCEPTED');
      const history = [
        { id: 'h1', orderId: ORDER_ID, fromStatus: null, toStatus: 'SUBMITTED', createdAt: new Date('2024-01-01') },
        { id: 'h2', orderId: ORDER_ID, fromStatus: 'SUBMITTED', toStatus: 'ACCEPTED', createdAt: new Date('2024-01-02') },
      ];
      mocks.db.query.orderStatusHistory.findMany.mockResolvedValue(history);
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const result = await service.getStatusHistory(ORDER_ID);
      expect(result).toHaveLength(2);
      expect(result[0]!.toStatus).toBe('SUBMITTED');
      expect(result[1]!.toStatus).toBe('ACCEPTED');
    });
  });

  describe('partial accept', () => {
    it('should transition SUBMITTED → PARTIALLY_ACCEPTED', async () => {
      const mocks = createStatefulMocks('SUBMITTED');
      mocks.db.query.orderItems.findMany.mockResolvedValue([
        { id: 'item-1', orderId: ORDER_ID, quantity: 10, qtyConfirmed: null, unitPriceMinor: 200 },
        { id: 'item-2', orderId: ORDER_ID, quantity: 5, qtyConfirmed: null, unitPriceMinor: 300 },
      ]);
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      const result = await service.partiallyAcceptOrder(ORDER_ID, MERCHANT_ID, [
        { itemId: 'item-1', qtyConfirmed: 8 },
        { itemId: 'item-2', qtyConfirmed: 5 },
      ]);

      expect(result.status).toBe('PARTIALLY_ACCEPTED');
    });

    it('should recalculate subtotal based on confirmed quantities', async () => {
      const mocks = createStatefulMocks('SUBMITTED');
      mocks.db.query.orderItems.findMany.mockResolvedValue([
        { id: 'item-1', orderId: ORDER_ID, quantity: 10, qtyConfirmed: 5, unitPriceMinor: 200 },
      ]);
      const service = new OrdersService(mocks.mockDbService, mocks.mockOutbox);

      await service.partiallyAcceptOrder(ORDER_ID, MERCHANT_ID, [
        { itemId: 'item-1', qtyConfirmed: 5 },
      ]);

      // New subtotal should be 5 * 200 = 1000 (not 10 * 200 = 2000)
      expect(mocks.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ subtotalMinor: 1000 }),
      );
    });
  });
});
