import { describe, expect, it, vi } from 'vitest';
import { ShipmentOperationsController } from '../../modules/shipping/shipment-operations.controller';

const shipment = {
  id: 'shipment-1',
  carrierShipmentId: 'waybill-1',
  shippingProviderKey: 'aramex',
};

function makeController(results: unknown[][]) {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const tx = {
    select: vi.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        for: () => Promise.resolve(results.shift() ?? []),
        limit: () => Promise.resolve(results.shift() ?? []),
      };
      return chain;
    }),
    insert: vi.fn(() => ({ values: insertValues })),
  };
  const controller = Object.create(ShipmentOperationsController.prototype) as any;
  controller.db = {
    db: {
      query: { shipments: { findFirst: vi.fn().mockResolvedValue(shipment) } },
      transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => callback(tx)),
    },
  };
  controller.registry = {
    findProvider: vi.fn().mockReturnValue({ capabilities: { canGenerateLabel: true } }),
  };
  controller.assertShipmentAccessible = vi.fn().mockResolvedValue(undefined);
  return { controller, tx, insertValues };
}

const caller = { sub: 'merchant-1', role: 'MERCHANT', activeOrg: 'org-1' };

describe('ShipmentOperationsController.requestLabel (G-010)', () => {
  it('queues one carrier label event under a shipment row lock', async () => {
    const { controller, tx, insertValues } = makeController([
      [{ id: 'shipment-1' }],
      [],
      [],
    ]);

    const result = await controller.requestLabel('shipment-1', caller);

    expect(result).toMatchObject({ shipmentId: 'shipment-1', status: 'QUEUED' });
    expect(tx.select).toHaveBeenCalledTimes(3);
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'shipping.carrier.label',
      aggregateId: 'shipment-1',
      metadata: { providerKey: 'aramex' },
      status: 'PENDING',
    }));
  });

  it('returns the existing active label instead of queueing a duplicate', async () => {
    const { controller, tx, insertValues } = makeController([
      [{ id: 'shipment-1' }],
      [{ id: 'label-1' }],
    ]);

    const result = await controller.requestLabel('shipment-1', caller);

    expect(result).toEqual({ shipmentId: 'shipment-1', status: 'AVAILABLE', labelId: 'label-1' });
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('returns the existing pending request instead of queueing a duplicate', async () => {
    const { controller, tx, insertValues } = makeController([
      [{ id: 'shipment-1' }],
      [],
      [{ id: 'event-1' }],
    ]);

    const result = await controller.requestLabel('shipment-1', caller);

    expect(result).toEqual({ shipmentId: 'shipment-1', status: 'IN_PROGRESS', eventId: 'event-1' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('rejects label requests before an external carrier shipment exists', async () => {
    const { controller, tx, insertValues } = makeController([]);
    controller.db.db.query.shipments.findFirst.mockResolvedValue({
      ...shipment,
      carrierShipmentId: null,
    });

    await expect(controller.requestLabel('shipment-1', caller))
      .rejects.toThrow('Create the carrier shipment');
    expect(tx.select).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });
});
