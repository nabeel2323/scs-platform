import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { OrdersService } from '../../modules/orders/orders.service';

/**
 * A4-7 — reorder must really put items back into the cart.
 *
 * The original implementation looped over the order, ensured a cart row existed,
 * and returned `{ message: 'Items re-added to cart' }` without adding anything.
 * These tests pin the two properties that would have caught it: every line is
 * handed to the validated cart path, and the response counts reflect what
 * actually happened.
 */

const MASTER_ID = 'master-001';
const SUB_RICE = 'sub-rice';
const SUB_OIL = 'sub-oil';
const BUYER_ID = 'buyer-001';

const item = (over: Record<string, any>) => ({
  id: `oi-${over['variantId']}`,
  variantId: 'v-1',
  sku: 'SKU-1',
  title: 'Item',
  quantity: 1,
  ...over,
});

const master = {
  id: MASTER_ID,
  buyerId: BUYER_ID,
  status: 'COMPLETED',
  subOrders: [
    {
      id: SUB_RICE,
      storeId: 'store-1',
      items: [
        // Confirmed quantity wins: the merchant agreed to 8, not the 10 asked.
        item({ variantId: 'v-rice', title: 'Rice 25kg', sku: 'RICE-25', quantity: 10, qtyConfirmed: 8 }),
        item({ variantId: 'v-oil', title: 'Oil 5L', sku: 'OIL-5', quantity: 3 }),
      ],
    },
    {
      id: SUB_OIL,
      storeId: 'store-2',
      items: [item({ variantId: 'v-dates', title: 'Dates', sku: 'DATES-1', quantity: 12 })],
    },
  ],
};

function createHarness(options: { failFor?: string; asSubOrder?: boolean } = {}) {
  const cartCalls: { userId: string; variantId: string; quantity: number }[] = [];
  const cart = {
    addItem: vi.fn(async (userId: string, input: { variantId: string; quantity: number }) => {
      if (options.failFor && input.variantId === options.failFor) {
        throw new BadRequestException('This item is no longer available');
      }
      cartCalls.push({ userId, variantId: input.variantId, quantity: input.quantity });
      return { id: 'cart-1', items: [] };
    }),
    // A4-7 residual: reorder now uses the batch path.
    addItems: vi.fn(async (userId: string, items: { variantId: string; quantity: number }[]) => {
      const added: string[] = [];
      const skipped: { variantId: string; reason: string }[] = [];
      for (const input of items) {
        if (options.failFor && input.variantId === options.failFor) {
          skipped.push({ variantId: input.variantId, reason: 'No longer available' });
        } else {
          cartCalls.push({ userId, variantId: input.variantId, quantity: input.quantity });
          added.push(input.variantId);
        }
      }
      return { id: 'cart-1', userId: BUYER_ID, status: 'ACTIVE', totalMinor: 0, items: [], added, skipped };
    }),
    getActiveCartWithItems: vi.fn(async () => ({
      id: 'cart-1',
      userId: BUYER_ID,
      status: 'ACTIVE',
      totalMinor: 0,
      items: [],
    })),
  };

  // First probe answers "is this id a master order?"; getMasterOrder then reads
  // it again. When the caller passed a sub-order id, the probe must miss.
  const masterFindFirst = options.asSubOrder
    ? vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(master)
    : vi.fn(async () => master);

  let itemCalls = 0;
  const db = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    // Mock transaction: executes callback with same mock db (no real tx needed in unit tests)
    transaction: vi.fn(async (cb: any) => cb(db)),
    query: {
      masterOrders: { findFirst: masterFindFirst },
      orders: {
        findFirst: vi.fn(async () => ({ id: SUB_RICE, masterOrderId: MASTER_ID, buyerId: BUYER_ID })),
        findMany: vi.fn(async () => master.subOrders),
      },
      // getMasterOrder reads the items of each sub-order in turn, so hand back
      // one set per call rather than pretending to interpret the WHERE clause.
      orderItems: {
        findMany: vi.fn(async () => master.subOrders[itemCalls++]?.items ?? []),
      },
      // A2-4: getMasterOrder names each seller and resolves each sub-order's
      // currency from one batched read.
      stores: {
        findMany: vi.fn(async () => [
          { id: 'store-1', displayName: 'Al Noor Trading', slug: 'al-noor', currency: 'SAR' },
          { id: 'store-2', displayName: 'Emirates Fresh', slug: 'emirates-fresh', currency: 'AED' },
        ]),
      },
    },
  };

  const service = new OrdersService(
    { db } as any,
    { publish: vi.fn(async () => undefined) } as any,
    { resolveApplicable: vi.fn(), calculateDiscount: vi.fn(), redeemPromotion: vi.fn() } as any,
    undefined,
    cart as any,
  );

  return { service, cart, cartCalls, db };
}

describe('Reorder (A4-7)', () => {
  it('re-adds every line through the validated cart path', async () => {
    const h = createHarness();

    const result = await h.service.reorder(MASTER_ID, BUYER_ID);

    expect(h.cartCalls).toEqual([
      { userId: BUYER_ID, variantId: 'v-rice', quantity: 8 },
      { userId: BUYER_ID, variantId: 'v-oil', quantity: 3 },
      { userId: BUYER_ID, variantId: 'v-dates', quantity: 12 },
    ]);
    expect(result.added).toHaveLength(3);
    expect(result.skipped).toEqual([]);
    expect(result.cart.items).toBeDefined();
  });

  it('resolves the sub-order id both clients actually send', async () => {
    const h = createHarness({ asSubOrder: true });

    const result = await h.service.reorder(SUB_RICE, BUYER_ID);

    expect(result.masterOrderId).toBe(MASTER_ID);
    expect(h.cartCalls).toHaveLength(3);
  });

  it('reports the lines that could not be re-added instead of failing silently', async () => {
    const h = createHarness({ failFor: 'v-dates' });

    const result = await h.service.reorder(MASTER_ID, BUYER_ID);

    expect(result.added.map((a: { title: string }) => a.title)).toEqual(['Rice 25kg', 'Oil 5L']);
    expect(result.skipped).toEqual([{ title: 'Dates', reason: 'No longer available' }]);
  });

  it('says so when nothing at all could be re-added', async () => {
    const h = createHarness({ failFor: 'v-rice' });
    h.cart.addItems.mockImplementationOnce(async (userId: string, items: { variantId: string; quantity: number }[]) => {
      const added: string[] = [];
      const skipped: { variantId: string; reason: string }[] = items.map(i => ({
        variantId: i.variantId,
        reason: 'No longer available',
      }));
      return { id: 'cart-1', userId: BUYER_ID, status: 'ACTIVE', totalMinor: 0, items: [], added, skipped };
    });

    const result = await h.service.reorder(MASTER_ID, BUYER_ID);

    expect(result.added).toEqual([]);
    expect(result.skipped).toHaveLength(3);
  });

  it('refuses another buyer’s order before touching the cart', async () => {
    const h = createHarness();

    await expect(h.service.reorder(MASTER_ID, 'someone-else')).rejects.toThrow(BadRequestException);
    expect(h.cartCalls).toEqual([]);
  });

  it('fails loudly when the cart service is not wired', async () => {
    const h = createHarness();
    const withoutCart = new OrdersService(
      { db: h.db } as any,
      { publish: vi.fn(async () => undefined) } as any,
      {} as any,
    );

    await expect(withoutCart.reorder(MASTER_ID, BUYER_ID)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
