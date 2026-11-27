import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ReturnExpirationWorker } from '../../../modules/returns/return-expiration.worker';

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

describe('ReturnExpirationWorker lease fencing', () => {
  it('reports fence loss when the claim statement returns no rows after lease expiry', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const database = makeActorScopedDb({ execute });
    const renewAndFence = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const worker = new ReturnExpirationWorker(
      database as any,
      {} as any,
      {
        holderId: 'worker-host-123',
        renewAndFence,
      } as any,
      {} as any,
      {} as any,
    );
    (worker as any).epoch = 42;

    await expect(worker.runBatch()).resolves.toMatchObject({
      state: 'STANDBY',
      executed: false,
      skipped: 'fence_lost',
    });
    expect(renewAndFence).toHaveBeenCalledTimes(2);
    expect(database.actorContexts.length).toBeGreaterThan(0);
    expect(database.actorContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorKind: 'worker', workerId: 'worker-host-123' }),
      ]),
    );
  });

  it('locks the current lease in the same claim statement', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const database = makeActorScopedDb({ execute });
    const leases = {
      holderId: 'worker-host-123',
      renewAndFence: vi.fn().mockResolvedValue(true),
      recordPollSuccess: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new ReturnExpirationWorker(
      database as any,
      {} as any,
      leases as any,
      {} as any,
      {} as any,
    );
    (worker as any).epoch = 42;

    await worker.runBatch();

    const claim = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(claim.sql).toContain('WITH live_fence AS MATERIALIZED');
    expect(claim.sql).toContain('FOR UPDATE');
    expect(claim.params).toEqual(
      expect.arrayContaining(['p13-return-expiration', 'worker-host-123', 42]),
    );
    expect(leases.renewAndFence).toHaveBeenCalledWith(42, 'p13-return-expiration');
    expect(leases.recordPollSuccess).toHaveBeenCalledOnce();
    expect(database.actorContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorKind: 'worker', workerId: 'worker-host-123' }),
      ]),
    );
  });

  it('stops the batch when the lease is lost between the pre-check and transactional escalation', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'return-a', status: 'REQUESTED' });
    const database = makeActorScopedDb({ query: { returnRequests: { findFirst } } });
    const escalateReturn = vi.fn().mockResolvedValue(null);
    const renewAndFence = vi.fn().mockResolvedValue(false);
    const worker = new ReturnExpirationWorker(
      database as any,
      { escalateReturn } as any,
      { holderId: 'worker-host-123', renewAndFence } as any,
      {} as any,
      {} as any,
    );

    await expect(
      (worker as any).withWorkerContext(() => (worker as any).processExpiration('return-a', 42)),
    ).resolves.toBe('fence_lost');
    expect(renewAndFence).toHaveBeenCalledWith(42, 'p13-return-expiration');
    expect((worker as any).state).toBe('STANDBY');
    expect((worker as any).epoch).toBe(0);
    expect(database.actorContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorKind: 'worker', workerId: 'worker-host-123' }),
      ]),
    );
  });

  it('passes the lease identity to the transactional escalation and treats a lost fence as skipped', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'return-a', status: 'REQUESTED' });
    const database = makeActorScopedDb({ query: { returnRequests: { findFirst } } });
    const escalateReturn = vi.fn().mockResolvedValue(null);
    const worker = new ReturnExpirationWorker(
      database as any,
      { escalateReturn } as any,
      { holderId: 'worker-host-123', renewAndFence: vi.fn().mockResolvedValue(true) } as any,
      {} as any,
      {} as any,
    );

    await expect(
      (worker as any).withWorkerContext(() => (worker as any).processExpiration('return-a', 42)),
    ).resolves.toBe('skipped');
    expect(escalateReturn).toHaveBeenCalledWith('return-a', {
      kind: 'worker',
      holderId: 'worker-host-123',
      epoch: 42,
    });
    expect(database.actorContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorKind: 'worker', workerId: 'worker-host-123' }),
      ]),
    );
  });
});
