import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ShippingService } from '../../../modules/shipping/shipping.service';

const caller = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

describe('ShippingService zone/method store boundaries', () => {
  it('filters methods returned for a zone to that zone store', async () => {
    const selectWhere = vi
      .fn()
      .mockResolvedValue([{ shippingMethodId: 'method-a' }, { shippingMethodId: 'method-b' }]);
    const from = vi.fn().mockReturnValue({ where: selectWhere });
    const select = vi.fn().mockReturnValue({ from });
    const findMany = vi.fn().mockResolvedValue([{ id: 'method-a', storeId: 'store-a' }]);
    const service = new ShippingService(
      { db: { select, query: { shippingMethods: { findMany } } } } as any,
      {} as any,
      {} as any,
    );
    vi.spyOn(service, 'getDeliveryZone').mockResolvedValue({
      id: 'zone-a',
      storeId: 'store-a',
    } as any);

    await expect(service.listMethodsForZone('zone-a', caller as any)).resolves.toEqual([
      { id: 'method-a', storeId: 'store-a' },
    ]);

    const query = findMany.mock.calls[0]?.[0] as { where: any };
    const compiled = new PgDialect().sqlToQuery(query.where);
    expect(compiled.params).toContain('store-a');
  });

  it('filters zones returned for a method to that method store', async () => {
    const selectWhere = vi.fn().mockResolvedValue([{ zoneId: 'zone-a' }, { zoneId: 'zone-b' }]);
    const from = vi.fn().mockReturnValue({ where: selectWhere });
    const select = vi.fn().mockReturnValue({ from });
    const findMany = vi.fn().mockResolvedValue([{ id: 'zone-a', storeId: 'store-a' }]);
    const service = new ShippingService(
      { db: { select, query: { deliveryZones: { findMany } } } } as any,
      {} as any,
      {} as any,
    );
    vi.spyOn(service, 'getShippingMethod').mockResolvedValue({
      id: 'method-a',
      storeId: 'store-a',
    } as any);

    await expect(service.listZonesForMethod('method-a', caller as any)).resolves.toEqual([
      { id: 'zone-a', storeId: 'store-a' },
    ]);

    const query = findMany.mock.calls[0]?.[0] as { where: any };
    const compiled = new PgDialect().sqlToQuery(query.where);
    expect(compiled.params).toContain('store-a');
  });

  it('does not detach a corrupted cross-store zone/method association', async () => {
    const deleteWhere = vi.fn().mockResolvedValue([]);
    const deleteBuilder = { where: deleteWhere };
    const deleteFn = vi.fn().mockReturnValue(deleteBuilder);
    const service = new ShippingService({ db: { delete: deleteFn } } as any, {} as any, {} as any);
    vi.spyOn(service, 'getDeliveryZone').mockResolvedValue({
      id: 'zone-a',
      storeId: 'store-a',
    } as any);
    vi.spyOn(service, 'getShippingMethod').mockResolvedValue({
      id: 'method-b',
      storeId: 'store-b',
    } as any);

    await expect(
      service.detachMethodFromZone('zone-a', 'method-b', caller as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteFn).not.toHaveBeenCalled();
  });
});
