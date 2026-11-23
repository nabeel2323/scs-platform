import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { OutboxDispatcher } from '../../../../common/outbox/outbox-dispatcher.service';

describe('OutboxDispatcher cross-instance claim safety', () => {
  it('claims pending non-carrier events with a lease and SKIP LOCKED', async () => {
    let statement: unknown;
    const execute = vi.fn(async (query: unknown) => {
      statement = query;
      return { rows: [] };
    });
    const transaction = vi.fn(async (callback: (tx: any) => Promise<any>) => callback({ execute }));
    const dispatcher = new OutboxDispatcher({ db: { transaction } } as any);

    await (dispatcher as any).poll();

    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(statement as any);
    expect(query.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.sql).toContain('locked_at');
    expect(query.sql).toContain('locked_by');
    expect(query.sql).toContain('not like');
    expect(query.params).toContain('shipping.carrier.%');
  });

  it('does not dispatch a row twice within one process poll loop', async () => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const dispatcher = new OutboxDispatcher({ db: {
      transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => callback({
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 'event-1', eventType: 'order.created', attempts: 0 }] }),
      })),
      update,
    } } as any);
    const dispatch = vi.spyOn(dispatcher as any, 'dispatch').mockResolvedValue(undefined);

    await (dispatcher as any).poll();

    expect(dispatch).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });
});