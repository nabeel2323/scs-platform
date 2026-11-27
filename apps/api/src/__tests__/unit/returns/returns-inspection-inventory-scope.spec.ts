import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ReturnsService } from '../../../modules/returns/returns.service';

describe('ReturnsService — inspection inventory tenant scope', () => {
  it('only loads inventory from warehouses owned by the return order store', async () => {
    const ret = {
      id: 'return-a',
      subOrderId: 'order-a',
      status: 'RECEIVED',
      buyerId: 'buyer-a',
    };
    const inventoryWhere = vi.fn().mockResolvedValue([]);
    const innerJoin = vi.fn().mockReturnValue({ where: inventoryWhere });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });

    const returning = vi.fn().mockResolvedValue([{ id: 'return-a' }]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: updateSet });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const txInsert = vi.fn(() => ({ values: insertValues }));
    const tx = { update: txUpdate, insert: txInsert };

    const returnItemsFindMany = vi.fn().mockResolvedValue([]);
    const orderItemsFindMany = vi
      .fn()
      .mockResolvedValue([{ id: 'item-a', variantId: 'variant-a' }]);
    const ordersFindFirst = vi.fn().mockResolvedValue({ storeId: 'store-a' });
    const returnRequestFindFirst = vi.fn().mockResolvedValue(ret);
    const returnEventsFindMany = vi.fn().mockResolvedValue([]);

    const db = {
      db: {
        select,
        transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(tx)),
        query: {
          orders: { findFirst: ordersFindFirst },
          orderItems: { findMany: orderItemsFindMany },
          returnRequestItems: { findMany: returnItemsFindMany },
          returnRequests: { findFirst: returnRequestFindFirst },
          returnRequestEvents: { findMany: returnEventsFindMany },
        },
      },
    };
    const outbox = { publish: vi.fn().mockResolvedValue(undefined) };
    const service = new ReturnsService(
      db as any,
      outbox as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { isEnforced: vi.fn().mockResolvedValue(false) } as any,
    );

    await (service as any).inspectReturn(
      ret,
      { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' },
      { condition: 'GOOD' },
    );

    expect(ordersFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ columns: { storeId: true } }),
    );
    expect(innerJoin).toHaveBeenCalled();

    const compiled = new PgDialect().sqlToQuery(inventoryWhere.mock.calls[0]?.[0]);
    expect(compiled.params).toContain('store-a');
    expect(compiled.params).toContain('variant-a');
    expect(compiled.sql).toContain('warehouses');
  });
});
