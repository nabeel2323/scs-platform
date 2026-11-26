import { describe, expect, it, vi } from 'vitest';
import { ShipmentOperationsController } from '../../../modules/shipping/shipment-operations.controller';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

describe('ShipmentOperationsController database actor scope', () => {
  it('binds database operations to the verified caller and active organization', async () => {
    const operation = vi.fn().mockResolvedValue('scoped-result');
    const withActorContext = vi.fn(async (_context: unknown, callback: () => Promise<unknown>) => callback());
    const controller = Object.create(ShipmentOperationsController.prototype) as any;
    controller.db = { withActorContext };
    const user = { sub: 'merchant-user-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' } as JwtPayload;

    await expect(controller.withCallerDatabaseContext(user, operation)).resolves.toBe('scoped-result');
    expect(withActorContext).toHaveBeenCalledWith(
      {
        actorKind: 'user',
        actorId: 'merchant-user-a',
        actorRole: 'MERCHANT_OWNER',
        activeOrgId: 'org-a',
      },
      operation,
    );
  });

  it('fails closed before opening a database scope when caller identity is incomplete', async () => {
    const withActorContext = vi.fn();
    const controller = Object.create(ShipmentOperationsController.prototype) as any;
    controller.db = { withActorContext };
    const user = { sub: 'merchant-user-a', role: '', activeOrg: 'org-a' } as JwtPayload;

    expect(() => controller.withCallerDatabaseContext(user, async () => 'not-run')).toThrow(
      /database context is missing/,
    );
    expect(withActorContext).not.toHaveBeenCalled();
  });
});
