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

});
