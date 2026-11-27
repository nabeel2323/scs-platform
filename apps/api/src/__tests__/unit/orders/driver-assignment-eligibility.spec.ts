import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';

describe('OrdersService.assignDriver eligibility boundary', () => {
  function createService(shipping: any) {
    const service = Object.create(OrdersService.prototype) as any;
    service.getOrder = vi.fn().mockResolvedValue({
      id: 'order-a',
      status: 'READY',
      storeId: 'store-a',
      masterOrderId: 'master-a',
    });
    service.assertTransition = vi.fn();
    service.getShipmentByOrderId = vi.fn().mockResolvedValue({
      id: 'shipment-a',
      orderId: 'order-a',
      storeId: 'store-a',
      status: 'READY',
    });
    service.shipping = shipping;
    service.db = { db: { update: vi.fn() } };
    return service;
  }

  it('rejects an ineligible driver before changing order or shipment state', async () => {
    const assertDriverEligibleForStore = vi
      .fn()
      .mockRejectedValue(new BadRequestException('Driver is not eligible for this store'));
    const service = createService({ assertDriverEligibleForStore });

    await expect(
      service.assignDriver('order-a', 'driver-b', 'merchant-a'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(assertDriverEligibleForStore).toHaveBeenCalledWith('driver-b', 'store-a');
    expect(service.db.db.update).not.toHaveBeenCalled();
  });

  it('fails closed when the shipping eligibility contract is unavailable', async () => {
    const service = createService(undefined);

    await expect(
      service.assignDriver('order-a', 'driver-b', 'merchant-a'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(service.db.db.update).not.toHaveBeenCalled();
  });
});
