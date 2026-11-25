import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ShippingCarrierWorker } from '../../modules/shipping/shipping-carrier.worker';

function makeActorScopedDb(db: Record<string, unknown>) {
  const actorContexts: unknown[] = [];
  const withActorContext = vi.fn(
    async (context: unknown, operation: () => Promise<unknown>) => {
      actorContexts.push(context);
      return operation();
    },
  );
  return { db, withActorContext, actorContexts };
}

describe('ShippingCarrierWorker event ownership', () => {
  it('claims only shipping.carrier events with atomic skip-locked semantics inside worker context', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const database = makeActorScopedDb({ execute });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.db = database;
    worker.workerId = 'test-carrier-worker';

    await expect(worker.claimEvents()).resolves.toEqual([]);

    expect(execute).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain('event_type LIKE');
    expect(query.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.params).toContain('shipping.carrier.%');
    expect(database.actorContexts).toEqual([
      expect.objectContaining({ actorKind: 'worker', workerId: 'test-carrier-worker' }),
    ]);
  });

  it('recovers stale leases only for shipping.carrier events inside worker context', async () => {
    let predicate: unknown;
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn((condition: unknown) => {
      predicate = condition;
      return { returning };
    });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const database = makeActorScopedDb({ update });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.db = database;
    worker.workerId = 'test-carrier-worker';
    worker.logger = { warn: vi.fn(), error: vi.fn() };

    await worker.recoverStaleLeases();

    expect(update).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(predicate as any);
    expect(query.sql).toContain('"event_type" like');
    expect(query.params).toContain('shipping.carrier.%');
    expect(query.params).toContain('PROCESSING');
    expect(returning).toHaveBeenCalledOnce();
    expect(database.actorContexts).toEqual([
      expect.objectContaining({ actorKind: 'worker', workerId: 'test-carrier-worker' }),
    ]);
  });

  it('routes unsupported carrier event types to retry handling instead of acknowledging them', async () => {
    const handleFailure = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    const database = makeActorScopedDb({ update });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    worker.handleFailure = handleFailure;
    worker.db = database;
    worker.workerId = 'test-carrier-worker';

    await worker.processEvent({
      id: 'carrier-event-unknown',
      eventType: 'shipping.carrier.unrecognized',
      aggregateId: 'shipment-a',
    });

    expect(handleFailure).toHaveBeenCalledOnce();
    const failureCall = handleFailure.mock.calls[0]!;
    expect(failureCall[0]).toBe('carrier-event-unknown');
    expect(failureCall[2]).toBeInstanceOf(Error);
    expect((failureCall[2] as Error).message).toContain('Unsupported carrier event type');
    expect(update).not.toHaveBeenCalled();
  });
});
