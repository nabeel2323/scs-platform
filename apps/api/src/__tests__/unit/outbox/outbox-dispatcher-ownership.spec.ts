import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outboxEvents } from '../../../modules/audit/audit.schema';
import { OutboxDispatcher } from '../../../common/outbox/outbox-dispatcher.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OutboxDispatcher delivery safety', () => {
  it('does not start a placeholder poller without a delivery adapter', () => {
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const service = new OutboxDispatcher({} as any);

    service.onModuleInit();

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('no generic delivery adapter is configured'),
    );
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });

  it('persists new events as PENDING instead of claiming they were delivered', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const service = new OutboxDispatcher({ db: { insert } } as any);

    const id = await service.publish('order.completed', '00000000-0000-4000-8000-000000000001', {
      orderId: '00000000-0000-4000-8000-000000000001',
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(insert).toHaveBeenCalledWith(outboxEvents);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        eventType: 'order.completed',
        status: 'PENDING',
      }),
    );
  });
});
