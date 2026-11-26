import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { OrdersService } from '../../../modules/orders/orders.service';

describe('OrdersService.findShipmentsByCarrierReference', () => {
  it('constrains provider, external reference and credential-owned stores, with ambiguity cap', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'shipment-a', storeId: 'store-a' }]);
    const service = Object.create(OrdersService.prototype) as any;
    const select = vi.fn(() => {
      const query: any = {
        from: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        limit: vi.fn().mockResolvedValue([{ shipment: { id: 'shipment-a', storeId: 'store-a' } }]),
      };
      return query;
    });
    service.db = { db: { select, query: { shipments: { findMany } } } };

    await expect(
      service.findShipmentsByCarrierReference('aramex', 'external-a', ['store-a', 'store-b']),
    ).resolves.toEqual([{ id: 'shipment-a', storeId: 'store-a' }]);

    const query = findMany.mock.calls[0]?.[0] as { where: any; limit: number };
    const params = new PgDialect().sqlToQuery(query.where).params;
    expect(params).toContain('aramex');
    expect(params).toContain('external-a');
    expect(params).toContain('store-a');
    expect(params).toContain('store-b');
    expect(query.limit).toBe(2);
  });

  it('does not issue a shipment query for an empty authorized store set', async () => {
    const findMany = vi.fn();
    const service = Object.create(OrdersService.prototype) as any;
    service.db = { db: { query: { shipments: { findMany } } } };

    await expect(
      service.findShipmentsByCarrierReference('aramex', 'external-a', []),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
