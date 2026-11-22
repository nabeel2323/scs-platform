import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { resolveShipmentForCredential } from '../../../modules/shipping/carrier-webhook-routing';

describe('resolveShipmentForCredential', () => {
  it('scopes shipment lookup to the credential organization and provider', async () => {
    const storesFindMany = vi.fn().mockResolvedValue([{ id: 'store-a' }, { id: 'store-b' }]);
    const shipment = { id: 'shipment-a', storeId: 'store-a' };
    const shipmentsFindMany = vi.fn().mockResolvedValue([shipment]);
    const db = {
      db: {
        query: {
          stores: { findMany: storesFindMany },
          shipments: { findMany: shipmentsFindMany },
        },
      },
    };

    await expect(
      resolveShipmentForCredential(db as any, { orgId: 'org-a', providerKey: 'aramex' }, 'aramex', 'external-a'),
    ).resolves.toEqual({ status: 'FOUND', shipment });

    expect(storesFindMany).toHaveBeenCalledOnce();
    const query = shipmentsFindMany.mock.calls[0]?.[0] as { where: any };
    const compiled = new PgDialect().sqlToQuery(query.where);
    expect(compiled.params).toContain('external-a');
    expect(compiled.params).toContain('aramex');
    expect(compiled.params).toContain('store-a');
    expect(compiled.params).toContain('store-b');
  });

  it('returns AMBIGUOUS instead of selecting the first of multiple matches', async () => {
    const storesFindMany = vi.fn().mockResolvedValue([{ id: 'store-a' }]);
    const shipmentsFindMany = vi.fn().mockResolvedValue([
      { id: 'shipment-a' },
      { id: 'shipment-b' },
    ]);
    const db = {
      db: {
        query: {
          stores: { findMany: storesFindMany },
          shipments: { findMany: shipmentsFindMany },
        },
      },
    };

    await expect(
      resolveShipmentForCredential(db as any, { orgId: 'org-a' }, 'aramex', 'external-a'),
    ).resolves.toEqual({ status: 'AMBIGUOUS' });
  });

  it('does not query shipments when the credential organization has no stores', async () => {
    const storesFindMany = vi.fn().mockResolvedValue([]);
    const shipmentsFindMany = vi.fn();
    const db = {
      db: {
        query: {
          stores: { findMany: storesFindMany },
          shipments: { findMany: shipmentsFindMany },
        },
      },
    };

    await expect(
      resolveShipmentForCredential(db as any, { orgId: 'org-empty', providerKey: 'aramex' }, 'aramex', 'external-a'),
    ).resolves.toEqual({ status: 'NOT_FOUND' });
    expect(shipmentsFindMany).not.toHaveBeenCalled();
  });
});
