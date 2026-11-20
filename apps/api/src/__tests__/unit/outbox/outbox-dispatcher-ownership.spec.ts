import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import { OutboxDispatcher } from '../../../common/outbox/outbox-dispatcher.service';

describe('OutboxDispatcher event ownership', () => {
  it('excludes carrier events from the generic dispatcher claim query', async () => {
    let predicate: unknown;
    const chain: Record<string, any> = {};
    chain['from'] = () => chain;
    chain['where'] = (where: unknown) => {
      predicate = where;
      return chain;
    };
    chain['orderBy'] = () => chain;
    chain['limit'] = () => chain;
    chain['then'] = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve);

    const service = new OutboxDispatcher({
      db: { select: () => chain },
    } as any);

    await (service as any).poll();

    const rendered = inspect(predicate, { depth: 20, breakLength: Infinity });
    expect(rendered).toContain('shipping.carrier.%');
    expect(rendered).toContain('event_type');
  });
});
