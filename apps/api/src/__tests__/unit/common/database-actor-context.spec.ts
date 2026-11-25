import { describe, expect, it, vi } from 'vitest';
import { DatabaseService, type DatabaseActorContext } from '../../../common/database/database.service';

function createService() {
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
  };
  const rootDb = {
    transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  const service = new DatabaseService();
  service.db = rootDb as any;
  return { service, tx, rootDb };
}

const merchantActor = {
  actorKind: 'user',
  actorId: 'user-1',
  actorRole: 'MERCHANT_OWNER',
  activeOrgId: 'org-1',
} satisfies DatabaseActorContext;

describe('DatabaseService actor context lifecycle', () => {
  it('routes database access through one transaction and exposes the normalized user principal', async () => {
    const { service, tx, rootDb } = createService();

    await service.withActorContext(merchantActor, async () => {
      expect(service.db).toBe(tx);
      expect(service.currentActorContext).toMatchObject({
        actorKind: 'user',
        actorId: 'user-1',
        actorRole: 'MERCHANT_OWNER',
        activeOrgId: 'org-1',
        workerId: null,
      });
    });

    expect(rootDb.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(service.db).toBe(rootDb);
    expect(service.currentActorContext).toBeNull();
  });

  it('reuses the active transaction for an identical nested actor context', async () => {
    const { service, tx, rootDb } = createService();

    await service.withActorContext(merchantActor, async () => {
      const outerHandle = service.db;
      await service.withActorContext({ ...merchantActor }, async () => {
        expect(service.db).toBe(outerHandle);
        expect(service.currentActorContext?.actorId).toBe('user-1');
      });
    });

    expect(rootDb.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects an actor switch without disturbing the enclosing transaction', async () => {
    const { service, tx, rootDb } = createService();

    await service.withActorContext(merchantActor, async () => {
      await expect(
        service.withActorContext(
          { ...merchantActor, actorId: 'user-2' },
          async () => undefined,
        ),
      ).rejects.toThrow('Cannot change database actor context inside an active transaction');

      expect(service.db).toBe(tx);
      expect(service.currentActorContext?.actorId).toBe('user-1');
    });

    expect(rootDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('supports an explicit worker principal without inventing a user identity', async () => {
    const { service, tx, rootDb } = createService();

    await service.withActorContext(
      { actorKind: 'worker', workerId: 'orders-worker-1', activeOrgId: 'org-1' },
      async () => {
        expect(service.db).toBe(tx);
        expect(service.currentActorContext).toMatchObject({
          actorKind: 'worker',
          actorId: null,
          actorRole: null,
          activeOrgId: 'org-1',
          workerId: 'orders-worker-1',
        });
      },
    );

    expect(rootDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects incomplete user and worker principals before opening a transaction', async () => {
    const { service, rootDb } = createService();

    await expect(
      service.withActorContext(
        { actorKind: 'user', actorId: 'user-1' } as DatabaseActorContext,
        async () => undefined,
      ),
    ).rejects.toThrow('User database context requires actorId and actorRole only');

    await expect(
      service.withActorContext(
        { actorKind: 'worker' } as DatabaseActorContext,
        async () => undefined,
      ),
    ).rejects.toThrow('Worker database context requires workerId and no user identity');

    expect(rootDb.transaction).not.toHaveBeenCalled();
  });

  it('closes the actor scope before detached asynchronous work can reuse its transaction', async () => {
    const { service } = createService();
    let detached!: Promise<unknown>;

    await service.withActorContext(merchantActor, async () => {
      detached = new Promise((resolve) => {
        setImmediate(() => {
          try {
            resolve(service.db);
          } catch (error) {
            resolve(error);
          }
        });
      });
    });

    const detachedResult = await detached;
    expect(detachedResult).toBeInstanceOf(Error);
    expect((detachedResult as Error).message).toBe(
      'Database actor context has already completed',
    );
  });

  it('clears the actor scope after the transaction callback fails', async () => {
    const { service, rootDb } = createService();

    await expect(
      service.withActorContext(merchantActor, async () => {
        throw new Error('operation failed');
      }),
    ).rejects.toThrow('operation failed');

    expect(service.db).toBe(rootDb);
    expect(service.currentActorContext).toBeNull();
  });
});
