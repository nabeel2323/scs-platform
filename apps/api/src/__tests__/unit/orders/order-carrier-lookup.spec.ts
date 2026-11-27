import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';
import { OrdersService } from '../../../modules/orders/orders.service';

describe('OrdersService.findShipmentsByCarrierReference', () => {
  it('constrains provider, external reference and credential-owned stores, with ambiguity cap', async () => {
    const rows = [{ shipment: { id: 'shipment-a', storeId: 'store-a' } }];
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn((_predicate: SQL) => ({ limit }));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn(() => ({ from }));
    const service = Object.create(OrdersService.prototype) as any;
    service.db = { db: { select } };

    await expect(
      service.findShipmentsByCarrierReference('aramex', 'external-a', ['store-a', 'store-b']),
    ).resolves.toEqual([{ id: 'shipment-a', storeId: 'store-a' }]);

    expect(select).toHaveBeenCalledOnce();
    expect(innerJoin).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(2);
    const predicate = where.mock.calls[0]?.[0];
    if (!predicate) throw new Error('Expected the carrier lookup SQL predicate to be provided');
    const params = new PgDialect().sqlToQuery(predicate).params;
    expect(params).toContain('aramex');
    expect(params).toContain('external-a');
    expect(params).toContain('store-a');
    expect(params).toContain('store-b');
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
