import { describe, expect, it, vi } from 'vitest';
import { AramexProvider } from '../../../modules/shipping/aramex/aramex.provider';

function invoke(activeActor: any, requestedOrgId: string | null) {
  const operation = vi.fn().mockResolvedValue('ok');
  const withActorContext = vi.fn(async (_context: unknown, callback: () => Promise<unknown>) => callback());
  const db = { currentActorContext: activeActor, withActorContext };
  const receiver = { db };
  const result = Promise.resolve().then(() =>
    (AramexProvider.prototype as any).withCredentialDatabaseContext.call(
      receiver,
      'aramex-test-worker',
      requestedOrgId,
      operation,
    ),
  );
  return { result, operation, withActorContext };
}

describe('AramexProvider credential actor context', () => {
  it('creates a null-org worker scope for store-owner discovery when no actor is active', async () => {
    const h = invoke(null, null);

    await expect(h.result).resolves.toBe('ok');
    expect(h.withActorContext).toHaveBeenCalledWith(
      { actorKind: 'worker', workerId: 'aramex-test-worker', activeOrgId: null },
      expect.any(Function),
    );
  });

  it('creates an org-bound worker scope for tenant credential reads when no actor is active', async () => {
    const h = invoke(null, 'org-a');

    await expect(h.result).resolves.toBe('ok');
    expect(h.withActorContext).toHaveBeenCalledWith(
      { actorKind: 'worker', workerId: 'aramex-test-worker', activeOrgId: 'org-a' },
      expect.any(Function),
    );
  });

  it('reuses a worker scope only when its organization exactly matches the requested scope', async () => {
    const h = invoke({ actorKind: 'worker', workerId: 'existing-worker', activeOrgId: 'org-a' }, 'org-a');

    await expect(h.result).resolves.toBe('ok');
    expect(h.withActorContext).not.toHaveBeenCalled();
    expect(h.operation).toHaveBeenCalledOnce();
  });

  it('allows null-org store-owner discovery only inside a null-org worker scope', async () => {
    const h = invoke({ actorKind: 'worker', workerId: 'global-worker', activeOrgId: null }, null);

    await expect(h.result).resolves.toBe('ok');
    expect(h.withActorContext).not.toHaveBeenCalled();
  });

  it.each([
    ['null-org user', { actorKind: 'user', actorId: 'user-1', actorRole: 'ADMIN', activeOrgId: null }, 'org-a'],
    ['mismatched worker', { actorKind: 'worker', workerId: 'worker-1', activeOrgId: 'org-b' }, 'org-a'],
    ['tenant worker for unscoped discovery', { actorKind: 'worker', workerId: 'worker-1', activeOrgId: 'org-a' }, null],
    ['system actor', { actorKind: 'system', actorId: 'system-1', actorRole: null, activeOrgId: 'org-a' }, 'org-a'],
    ['anonymous actor', { actorKind: 'anonymous', actorId: null, actorRole: null, activeOrgId: null }, null],
  ])('rejects %s from a different or unapproved actor scope', async (_label, actor, requestedOrgId) => {
    const h = invoke(actor, requestedOrgId);

    await expect(h.result).rejects.toThrow('worker context bound to the requested organization');
    expect(h.operation).not.toHaveBeenCalled();
    expect(h.withActorContext).not.toHaveBeenCalled();
  });
});
