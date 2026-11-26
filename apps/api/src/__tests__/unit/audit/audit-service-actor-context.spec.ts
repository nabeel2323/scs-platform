import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../../modules/audit/audit.service';

describe('AuditService database actor boundary (G-002)', () => {
  it('uses the dedicated audit principal when no actor transaction is active', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    let activeActor: Record<string, unknown> | null = null;
    const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
      activeActor = context;
      try {
        return await operation();
      } finally {
        activeActor = null;
      }
    });
    const db = {
      get currentActorContext() {
        return activeActor;
      },
      withActorContext,
      db: { insert },
    };
    const service = new AuditService(db as any);

    await service.record({
      actorType: 'MERCHANT',
      action: 'product.updated',
      resource: 'product',
      resourceId: 'product-1',
      orgId: 'org-1',
    });

    expect(withActorContext).toHaveBeenCalledOnce();
    expect(withActorContext).toHaveBeenCalledWith(
      {
        actorKind: 'audit',
        actorId: 'audit-service',
        actorRole: 'MERCHANT',
        activeOrgId: 'org-1',
      },
      expect.any(Function),
    );
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
  });

  it('reuses an existing verified actor transaction rather than attempting an actor switch', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const activeActor = {
      actorKind: 'user',
      actorId: 'merchant-user',
      actorRole: 'MERCHANT_OWNER',
      activeOrgId: 'org-1',
    };
    const withActorContext = vi.fn();
    const db = {
      currentActorContext: activeActor,
      withActorContext,
      db: { insert: vi.fn(() => ({ values })) },
    };
    const service = new AuditService(db as any);

    await service.record({
      actorType: 'MERCHANT',
      actorId: 'merchant-user',
      action: 'product.updated',
      resource: 'product',
      resourceId: 'product-1',
      orgId: 'org-1',
    });

    expect(withActorContext).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledOnce();
  });
});
