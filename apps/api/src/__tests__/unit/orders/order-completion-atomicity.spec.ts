import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeService(options?: { failShipmentEvent?: boolean; loseCompletionRace?: boolean }) {
  const order = {
    id: 'order-1',
    status: 'DELIVERED',
    storeId: 'store-1',
    masterOrderId: 'master-1',
  };
  const shipment = { id: 'shipment-1', status: 'DELIVERED' };
  let committed = false;
  let rolledBack = false;

  const updateValues: Array<Record<string, unknown>> = [];
  const tx = {
    query: {
      shipments: {
        findFirst: vi.fn().mockResolvedValue(shipment),
      },
    },
    update: vi.fn(() => {
      const builder: any = {
        set: vi.fn((values: Record<string, unknown>) => {
          updateValues.push(values);
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn().mockResolvedValue(options?.loseCompletionRace && updateValues.length === 1 ? [] : [{ id: order.id }]),
      };
      return builder;
    }),
    insert: vi.fn(() => ({
      values: options?.failShipmentEvent
        ? vi.fn().mockRejectedValue(new Error('shipment event write failed'))
        : vi.fn().mockResolvedValue(undefined),
    })),
  };

  const transaction = vi.fn(async (callback: (executor: any) => Promise<unknown>) => {
    try {
      const result = await callback(tx);
      committed = true;
      return result;
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });
  const db = {
    db: {
      transaction,
      update: vi.fn(),
      insert: vi.fn(),
    },
  };
  const outbox = { publish: vi.fn().mockResolvedValue('outbox-1') };
  const emit = vi.fn(() => {
    expect(committed).toBe(true);
  });
  const realtime = { server: { to: vi.fn(() => ({ emit })) } };
  const service = new OrdersService(db as any, outbox as any, {} as any, realtime as any);
  vi.spyOn(service, 'getOrder').mockResolvedValue(order as any);
  const recalculate = vi.spyOn(service, 'recalculateMasterOrderStatus').mockResolvedValue('COMPLETED');

  return { service, db, tx, outbox, realtime, emit, transaction, recalculate, updateValues, committed: () => committed, rolledBack: () => rolledBack, order };
}

describe('OrdersService.recalculateMasterOrderStatus concurrency', () => {
  it('locks the master row before reading its current status', async () => {
    const calls: string[] = [];
    const tx = {
      execute: vi.fn(async () => {
        calls.push('lock');
        return { rows: [] };
      }),
      query: {
        masterOrders: {
          findFirst: vi.fn(async () => {
            calls.push('master');
            return { id: 'master-1', status: 'ACCEPTED', buyerId: 'buyer-1' };
          }),
        },
        orders: {
          findMany: vi.fn(async () => {
            calls.push('suborders');
            return [{ status: 'COMPLETED' }, { status: 'ACCEPTED' }];
          }),
        },
      },
      update: vi.fn(),
    };
    const outbox = { publish: vi.fn() };
    const service = new OrdersService(
      { db: { transaction: vi.fn() } } as any,
      outbox as any,
      {} as any,
    );

    const status = await service.recalculateMasterOrderStatus('master-1', tx);

    expect(calls).toEqual(['lock', 'master', 'suborders']);
    expect(status).toBe('ACCEPTED');
    expect(tx.update).not.toHaveBeenCalled();
    expect(outbox.publish).not.toHaveBeenCalled();
  });
});

describe('OrdersService.completeOrder atomicity', () => {
  it('commits order, shipment, history, outbox and master status in one transaction before realtime', async () => {
    const fixture = makeService();

    await fixture.service.completeOrder('order-1', 'system', 'SYSTEM', 'AUTO_COMPLETION');

    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.tx.update).toHaveBeenCalledTimes(2);
    expect(fixture.tx.insert).toHaveBeenCalledTimes(2);
    expect(fixture.db.db.update).not.toHaveBeenCalled();
    expect(fixture.db.db.insert).not.toHaveBeenCalled();
    expect(fixture.outbox.publish).toHaveBeenCalledWith(
      'order.completed',
      'order-1',
      { orderId: 'order-1', storeId: 'store-1', source: 'AUTO_COMPLETION' },
      {},
      null,
      fixture.tx,
    );
    expect(fixture.recalculate).toHaveBeenCalledWith('master-1', fixture.tx);
    expect(fixture.realtime.server.to).toHaveBeenCalledWith('order:order-1');
    expect(fixture.emit).toHaveBeenCalledWith('order:updated', {
      orderId: 'order-1',
      status: 'COMPLETED',
    });
  });

  it('fences auto-completion by the active lease owner and clears the lease in the same transaction', async () => {
    const fixture = makeService();
    await fixture.service.completeOrder('order-1', 'system', 'SYSTEM', 'AUTO_COMPLETION', 'auto-complete-worker-1');
    expect(fixture.updateValues[0]).toEqual(expect.objectContaining({ status: 'COMPLETED', autoCompleteClaimedAt: null, autoCompleteClaimedBy: null }));
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.outbox.publish).toHaveBeenCalledTimes(1);
    expect(fixture.committed()).toBe(true);
  });
  it('rejects a worker whose lease was lost before the fenced status update', async () => {
    const fixture = makeService({ loseCompletionRace: true });
    await expect(fixture.service.completeOrder('order-1', 'system', 'SYSTEM', 'AUTO_COMPLETION', 'stale-worker')).rejects.toThrow('Order status already changed — concurrent completion rejected');
    expect(fixture.rolledBack()).toBe(true);
    expect(fixture.outbox.publish).not.toHaveBeenCalled();
    expect(fixture.recalculate).not.toHaveBeenCalled();
    expect(fixture.realtime.server.to).not.toHaveBeenCalled();
  });
  it('rejects automatic completion without a lease owner', async () => {
    const fixture = makeService();
    await expect(fixture.service.completeOrder('order-1', 'system', 'SYSTEM', 'AUTO_COMPLETION')).rejects.toThrow('Auto-completion requires an active worker claim');
    expect(fixture.transaction).not.toHaveBeenCalled();
  });
  it('does not publish or emit realtime when a transactional shipment write fails', async () => {
    const fixture = makeService({ failShipmentEvent: true });

    await expect(
      fixture.service.completeOrder('order-1', 'system', 'SYSTEM', 'AUTO_COMPLETION'),
    ).rejects.toThrow('shipment event write failed');

    expect(fixture.rolledBack()).toBe(true);
    expect(fixture.outbox.publish).not.toHaveBeenCalled();
    expect(fixture.recalculate).not.toHaveBeenCalled();
    expect(fixture.realtime.server.to).not.toHaveBeenCalled();
  });

  it('records buyer confirmation in the same transaction as completion', async () => {
    const fixture = makeService({ failShipmentEvent: true });

    await expect(
      fixture.service.confirmDelivery('order-1', 'buyer-1'),
    ).rejects.toThrow('shipment event write failed');

    expect(fixture.rolledBack()).toBe(true);
    expect(fixture.db.db.update).not.toHaveBeenCalled();
    expect(fixture.updateValues[0]).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        buyerConfirmedAt: expect.any(Date),
      }),
    );
    expect(fixture.outbox.publish).not.toHaveBeenCalled();
    expect(fixture.realtime.server.to).not.toHaveBeenCalled();
  });
});
