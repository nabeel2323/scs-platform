import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../../common/database/database.service';

function createService() {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  const rootDb = {
    transaction: vi.fn(async (operation: (tx: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const service = new DatabaseService();
  service.db = rootDb as any;
  return { service, tx, rootDb };
}

describe('DatabaseService authentication actor context', () => {
  it('sets a purpose-scoped principal without user or tenant identity', async () => {
    const { service, tx, rootDb } = createService();

    const result = await service.withActorContext(
      { actorKind: 'authentication', authOperation: 'password_login' },
      async () => {
        expect(service.currentActorContext).toMatchObject({
          actorKind: 'authentication',
          actorId: null,
          actorRole: null,
          activeOrgId: null,
          workerId: null,
          authOperation: 'password_login',
        });
        return 'resolved';
      },
    );

    expect(result).toBe('resolved');
    expect(rootDb.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(service.currentActorContext).toBeNull();
  });

  it('rejects authentication contexts carrying a user or tenant identity', async () => {
    const { service, rootDb } = createService();

    await expect(
      service.withActorContext(
        {
          actorKind: 'authentication',
          authOperation: 'refresh_token',
          actorId: 'user-1',
        } as any,
        async () => undefined,
      ),
    ).rejects.toThrow('Authentication database context requires one approved operation');

    expect(rootDb.transaction).not.toHaveBeenCalled();
  });

  it('does not allow a nested authentication operation to switch purposes', async () => {
    const { service } = createService();

    await expect(
      service.withActorContext(
        { actorKind: 'authentication', authOperation: 'refresh_token' },
        () =>
          service.withActorContext(
            { actorKind: 'authentication', authOperation: 'logout' },
            async () => undefined,
          ),
      ),
    ).rejects.toThrow('Cannot change database actor context inside an active transaction');
  });
});
