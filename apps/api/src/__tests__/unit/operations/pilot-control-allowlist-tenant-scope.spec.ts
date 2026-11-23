import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PilotControlService } from '../../../modules/operations/pilot-control.service';

describe('PilotControlService allowlist tenant consistency', () => {
  function buildService(
    identity: { getOrg: ReturnType<typeof vi.fn> },
    merchant: { getStore: ReturnType<typeof vi.fn> },
  ) {
    const insert = vi.fn();
    const service = new PilotControlService(
      { db: { insert } } as any,
      { record: vi.fn() } as any,
      { raise: vi.fn() } as any,
      identity as any,
      merchant as any,
    );
    return { service, insert };
  }

  it('rejects a store that does not belong to the requested organization', async () => {
    const identity = { getOrg: vi.fn().mockResolvedValue({ id: 'org-a' }) };
    const merchant = {
      getStore: vi.fn().mockResolvedValue({ id: 'store-b', orgId: 'org-b' }),
    };
    const { service, insert } = buildService(identity, merchant);

    await expect(
      service.addAllowlistEntry({
        orgId: 'org-a',
        storeId: 'store-b',
        actorId: 'admin-a',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(identity.getOrg).toHaveBeenCalledWith('org-a');
    expect(merchant.getStore).toHaveBeenCalledWith('store-b');
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent organization before resolving a store', async () => {
    const identity = {
      getOrg: vi.fn().mockRejectedValue(new NotFoundException('Organization not found')),
    };
    const merchant = { getStore: vi.fn() };
    const { service, insert } = buildService(identity, merchant);

    await expect(
      service.addAllowlistEntry({
        orgId: 'org-missing',
        storeId: 'store-a',
        actorId: 'admin-a',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(identity.getOrg).toHaveBeenCalledWith('org-missing');
    expect(merchant.getStore).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
