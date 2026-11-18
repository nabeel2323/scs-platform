import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { OutboxDispatcher } from '../../../../common/outbox/outbox-dispatcher.service';

describe('OutboxDispatcher carrier event ownership', () => {
  it('excludes shipping.carrier events from the generic logging dispatcher query', async () => {
    let predicate: unknown;
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn((condition: unknown) => {
      predicate = condition;
      return { orderBy };
    });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const dispatcher = new OutboxDispatcher({ db: { select } } as any);

    await (dispatcher as any).poll();

    expect(select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(predicate as any);
    expect(query.sql).toContain('NOT LIKE');
    expect(query.params).toContain('shipping.carrier.%');
    expect(limit).toHaveBeenCalledWith(10);
  });
});
