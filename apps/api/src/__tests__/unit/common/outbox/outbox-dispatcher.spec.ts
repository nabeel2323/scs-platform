import { describe, expect, it, vi } from 'vitest';
import { OutboxDispatcher } from '../../../../common/outbox/outbox-dispatcher.service';

describe('OutboxDispatcher delivery boundary', () => {
  it('keeps automatic polling disabled until a generic delivery adapter exists', () => {
    const dispatcher = new OutboxDispatcher({ db: {} } as any);
    const warning = vi.spyOn((dispatcher as any).logger, 'warn').mockImplementation(() => undefined);

    dispatcher.onModuleInit();

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Automatic outbox polling is disabled'),
    );
    expect((dispatcher as any).poll).toBeUndefined();
    expect((dispatcher as any).dispatch).toBeUndefined();
  });

  it('persists events as PENDING and supports an existing transaction client', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const rootDb = { insert };
    const dispatcher = new OutboxDispatcher({ db: rootDb } as any);
    const txValues = vi.fn().mockResolvedValue(undefined);
    const txInsert = vi.fn().mockReturnValue({ values: txValues });
    const txClient = { insert: txInsert };

    const id = await dispatcher.publish(
      'order.created',
      'order-1',
      { orderId: 'order-1' },
      { organizationId: 'org-1' },
      null,
      txClient,
    );

    expect(id).toEqual(expect.any(String));
    expect(txInsert).toHaveBeenCalledOnce();
    expect(txValues).toHaveBeenCalledWith(expect.objectContaining({
      id,
      eventType: 'order.created',
      aggregateId: 'order-1',
      payload: { orderId: 'order-1' },
      metadata: { organizationId: 'org-1' },
      status: 'PENDING',
      nextAttemptAt: null,
    }));
    expect(insert).not.toHaveBeenCalled();
  });

  it('uses the root database when no transaction client is supplied', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const dispatcher = new OutboxDispatcher({ db: { insert } } as any);

    await dispatcher.publish('return.created', 'return-1', { returnId: 'return-1' });

    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'return.created',
      aggregateId: 'return-1',
      status: 'PENDING',
      metadata: {},
      nextAttemptAt: null,
    }));
  });
});
