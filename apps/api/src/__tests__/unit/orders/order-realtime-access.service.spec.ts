import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../../common/database/database.service';
import { OrderRealtimeAccessService } from '../../../modules/orders/order-realtime-access.service';

describe('OrderRealtimeAccessService', () => {
  const orderFindFirst = vi.fn();
  const masterOrderFindFirst = vi.fn();
  const shipmentFindFirst = vi.fn();
  let service: OrderRealtimeAccessService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrderRealtimeAccessService({
      db: {
        query: {
          orders: { findFirst: orderFindFirst },
          masterOrders: { findFirst: masterOrderFindFirst },
          shipments: { findFirst: shipmentFindFirst },
        },
      },
    } as unknown as DatabaseService);
  });

  it('returns sub-order buyer and store scope without querying master orders', async () => {
    orderFindFirst.mockResolvedValue({ buyerId: 'buyer-a', storeId: 'store-a' });

    await expect(service.getRoomAccess('order-a')).resolves.toEqual({
      kind: 'order',
      buyerId: 'buyer-a',
      storeId: 'store-a',
    });
    expect(masterOrderFindFirst).not.toHaveBeenCalled();
  });

  it('falls back to master-order buyer scope when no sub-order exists', async () => {
    orderFindFirst.mockResolvedValue(undefined);
    masterOrderFindFirst.mockResolvedValue({ buyerId: 'buyer-a' });

    await expect(service.getRoomAccess('master-order-a')).resolves.toEqual({
      kind: 'masterOrder',
      buyerId: 'buyer-a',
    });
    expect(masterOrderFindFirst).toHaveBeenCalledOnce();
  });

  it('returns null for an unknown order identifier', async () => {
    orderFindFirst.mockResolvedValue(undefined);
    masterOrderFindFirst.mockResolvedValue(undefined);

    await expect(service.getRoomAccess('missing')).resolves.toBeNull();
  });

  it('only authorizes the driver assigned to the requested order', async () => {
    shipmentFindFirst.mockResolvedValue({ id: 'shipment-a' });
    await expect(service.isDriverAssignedToOrder('order-a', 'driver-a')).resolves.toBe(true);

    shipmentFindFirst.mockResolvedValue(undefined);
    await expect(service.isDriverAssignedToOrder('order-a', 'driver-b')).resolves.toBe(false);
    expect(shipmentFindFirst).toHaveBeenCalledTimes(2);
  });
});
