import { describe, expect, it, vi } from 'vitest';
import { CarrierWebhookRoutingService } from '../../../modules/shipping/carrier-webhook-routing';

function makeService(storeIds: string[], shipments: any[]) {
  const merchant = { listStoreIdsForOrgSystem: vi.fn().mockResolvedValue(storeIds) };
  const orders = { findShipmentsByCarrierReference: vi.fn().mockResolvedValue(shipments) };
  return {
    service: new CarrierWebhookRoutingService(merchant as any, orders as any),
    merchant,
    orders,
  };
}

describe('CarrierWebhookRoutingService', () => {
  it('routes only within stores owned by the authenticated credential organization', async () => {
    const shipment = { id: 'shipment-a', storeId: 'store-a' };
    const h = makeService(['store-a', 'store-b'], [shipment]);

    await expect(
      h.service.resolveShipmentForCredential(
        { orgId: 'org-a', providerKey: 'aramex' },
        'aramex',
        'external-a',
      ),
    ).resolves.toEqual({ status: 'FOUND', shipment });

    expect(h.merchant.listStoreIdsForOrgSystem).toHaveBeenCalledWith('org-a');
    expect(h.orders.findShipmentsByCarrierReference).toHaveBeenCalledWith(
      'aramex',
      'external-a',
      ['store-a', 'store-b'],
    );
  });

  it('rejects a credential whose provider does not match the event provider', async () => {
    const h = makeService(['store-a'], []);

    await expect(
      h.service.resolveShipmentForCredential(
        { orgId: 'org-a', providerKey: 'dhl' },
        'aramex',
        'external-a',
      ),
    ).rejects.toThrow('Webhook credential provider does not match event provider');

    expect(h.merchant.listStoreIdsForOrgSystem).not.toHaveBeenCalled();
    expect(h.orders.findShipmentsByCarrierReference).not.toHaveBeenCalled();
  });

  it('returns AMBIGUOUS instead of choosing the first matching shipment', async () => {
    const h = makeService(['store-a'], [{ id: 'shipment-a' }, { id: 'shipment-b' }]);

    await expect(
      h.service.resolveShipmentForCredential(
        { orgId: 'org-a', providerKey: 'aramex' },
        'aramex',
        'external-a',
      ),
    ).resolves.toEqual({ status: 'AMBIGUOUS' });
  });

  it('does not query Orders when the credential organization has no stores', async () => {
    const h = makeService([], []);

    await expect(
      h.service.resolveShipmentForCredential(
        { orgId: 'org-empty', providerKey: 'aramex' },
        'aramex',
        'external-a',
      ),
    ).resolves.toEqual({ status: 'NOT_FOUND' });

    expect(h.orders.findShipmentsByCarrierReference).not.toHaveBeenCalled();
  });
});
