import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShippingCarrierWorker } from '../../../modules/shipping/shipping-carrier.worker';
import { CarrierRetryPolicy } from '../../../modules/shipping/carrier-retry-policy';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShippingCarrierWorker event ownership', () => {
  it('dead-letters unknown carrier-prefixed events instead of acknowledging them', async () => {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn().mockReturnValue({ set });
    const db = { db: { update } };
    const worker = new ShippingCarrierWorker(
      db as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new CarrierRetryPolicy(),
      {} as any,
    );

    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const event = {
      id: '00000000-0000-4000-8000-000000000001',
      eventType: 'shipping.carrier.not_registered',
      aggregateId: 'shipment-1',
      attempts: 0,
    };

    await (worker as any).processEvent(event);

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DEAD_LETTER',
        attempts: 1,
        nextAttemptAt: null,
        lockedAt: null,
        lockedBy: null,
      }),
    );
    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISPATCHED' }),
    );
  });
});
