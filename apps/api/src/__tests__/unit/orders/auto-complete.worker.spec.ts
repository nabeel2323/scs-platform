import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AutoCompleteWorker } from '../../../modules/orders/auto-complete.worker';

describe('AutoCompleteWorker durable claims', () => {
  it('claims one order with a persisted lease and passes its owner to the fenced completion path', async () => {
    const order = { id: 'order-1', status: 'DELIVERED' };
    let actorDepth = 0;
    const withActorContext = vi.fn(
      async (_context: unknown, operation: () => Promise<unknown>) => {
        actorDepth += 1;
        try {
          return await operation();
        } finally {
          actorDepth -= 1;
        }
      },
    );
    const results = [{ rows: [order] }, { rows: [] }, { rows: [] }];
    const execute = vi.fn(async (..._args: any[]) => {
      expect(actorDepth).toBeGreaterThan(0);
      return results.shift() ?? { rows: [] };
    });
    const completeOrder = vi.fn(async (..._args: unknown[]) => {
      expect(actorDepth).toBeGreaterThan(0);
      return order;
    });
    const worker = new AutoCompleteWorker(
      { db: { execute }, withActorContext } as any,
      { completeOrder } as any,
    );

    await (worker as any).poll();

    expect(completeOrder).toHaveBeenCalledTimes(1);
    const [orderId, actorId, actorType, source, owner] = completeOrder.mock.calls[0]!;
    expect([orderId, actorId, actorType, source]).toEqual([
      'order-1',
      'system',
      'SYSTEM',
      'AUTO_COMPLETION',
    ]);
    expect(owner).toMatch(/^auto-complete-/);
    expect(withActorContext).toHaveBeenCalledTimes(3);
    for (const [context] of withActorContext.mock.calls) {
      expect(context).toMatchObject({ actorKind: 'worker', workerId: owner });
    }

    const claimQuery = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(claimQuery.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimQuery.sql).toContain('auto_complete_claimed_at');
    expect(claimQuery.sql).toContain('auto_complete_claimed_by');
    expect(claimQuery.params).toContain(owner);
  });

  it('releases only its own claim after a failed completion attempt within the worker actor scope', async () => {
    const order = { id: 'order-2', status: 'DELIVERED' };
    let actorDepth = 0;
    const withActorContext = vi.fn(
      async (_context: unknown, operation: () => Promise<unknown>) => {
        actorDepth += 1;
        try {
          return await operation();
        } finally {
          actorDepth -= 1;
        }
      },
    );
    const results = [{ rows: [order] }, { rows: [] }, { rows: [] }];
    const execute = vi.fn(async (..._args: any[]) => {
      expect(actorDepth).toBeGreaterThan(0);
      return results.shift() ?? { rows: [] };
    });
    const completeOrder = vi.fn(async (..._args: unknown[]) => {
      expect(actorDepth).toBeGreaterThan(0);
      throw new Error('temporary failure');
    });
    const worker = new AutoCompleteWorker(
      { db: { execute }, withActorContext } as any,
      { completeOrder } as any,
    );

    await (worker as any).poll();

    const releaseQuery = new PgDialect().sqlToQuery(execute.mock.calls[1]![0]);
    expect(releaseQuery.sql).toContain('auto_complete_claimed_by');
    expect(releaseQuery.sql).toContain('WHERE id =');
    expect(releaseQuery.params).toContain('order-2');
    expect(releaseQuery.params).toContain(completeOrder.mock.calls[0]![4]);
    expect(withActorContext).toHaveBeenCalledTimes(3);
  });
});
