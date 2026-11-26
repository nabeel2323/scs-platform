import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CarrierAdminController } from '../../../modules/shipping/carrier-admin.controller';

describe('CarrierAdminController recovery queue tenant scope', () => {
  it('rejects non-privileged recovery queue access without an active organization', async () => {
    const storeFindMany = vi.fn();
    const controller = new CarrierAdminController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { db: { query: { stores: { findMany: storeFindMany } } } } as any,
    );

    await expect(
      controller.getRecoveryQueue({
        sub: 'org-admin-a',
        role: 'ORG_ADMIN',
        activeOrg: null,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeFindMany).not.toHaveBeenCalled();
  });

  it('runs the recovery queue read under the verified user actor context', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const withActorContext = vi.fn(async (_context: any, operation: () => Promise<unknown>) =>
      operation(),
    );
    const db = {
      withActorContext,
      db: { select: vi.fn().mockReturnValue(selectChain) },
    };
    const controller = new CarrierAdminController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      db as any,
    );

    await expect(
      controller.getRecoveryQueue({
        sub: 'platform-admin-1',
        role: 'SUPER_ADMIN',
        activeOrg: null,
      } as any),
    ).resolves.toEqual({ queue: [], count: 0, limit: 50 });

    expect(withActorContext).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKind: 'user',
        actorId: 'platform-admin-1',
        actorRole: 'SUPER_ADMIN',
        activeOrgId: null,
      }),
      expect.any(Function),
    );
  });
});
