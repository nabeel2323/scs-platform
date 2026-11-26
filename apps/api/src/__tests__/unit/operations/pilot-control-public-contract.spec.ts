import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../../common/database/database.service';
import type { AuditService } from '../../../modules/audit/audit.service';
import type { IdentityService } from '../../../modules/identity/index';
import type { MerchantService } from '../../../modules/merchant/index';
import type { OpsAlertService } from '../../../modules/operations/ops-alert.service';
import { PilotControlService } from '../../../modules/operations/pilot-control.service';

describe('PilotControlService public tenant contracts', () => {
  const adminCaller = { sub: 'admin-1', role: 'SUPER_ADMIN', activeOrg: null };
  const identity = { getOrg: vi.fn() };
  const merchant = { getStore: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const alerts = { raise: vi.fn().mockResolvedValue(undefined) };
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  let service: PilotControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    onConflictDoNothing.mockResolvedValue(undefined);
    values.mockReturnValue({ onConflictDoNothing });
    insert.mockReturnValue({ values });
    identity.getOrg.mockResolvedValue({ id: 'org-1' });
    merchant.getStore.mockResolvedValue({ id: 'store-1', orgId: 'org-1' });

    service = new PilotControlService(
      {
        db: { insert },
        currentActorContext: null,
        withActorContext: async (_actor: unknown, operation: () => Promise<unknown>) => operation(),
      } as unknown as DatabaseService,
      audit as unknown as AuditService,
      alerts as unknown as OpsAlertService,
      identity as unknown as IdentityService,
      merchant as unknown as MerchantService,
    );
  });

  it('validates organization and store ownership through their owning services', async () => {
    await service.addAllowlistEntry({ orgId: 'org-1', storeId: 'store-1', caller: adminCaller });

    expect(identity.getOrg).toHaveBeenCalledWith('org-1');
    expect(merchant.getStore).toHaveBeenCalledWith('store-1');
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', storeId: 'store-1' }),
    );
  });

  it('rejects a store owned by another organization without writing an entry', async () => {
    merchant.getStore.mockResolvedValue({ id: 'store-2', orgId: 'org-2' });

    await expect(service.addAllowlistEntry({ orgId: 'org-1', storeId: 'store-2', caller: adminCaller })).rejects.toThrow(
      'Store not found in the target organization',
    );

    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects a store slug when the allowlist field requires the canonical store id', async () => {
    merchant.getStore.mockResolvedValue({ id: 'store-canonical', orgId: 'org-1' });

    await expect(
      service.addAllowlistEntry({ orgId: 'org-1', storeId: 'store-slug', caller: adminCaller }),
    ).rejects.toThrow('Store not found in the target organization');

    expect(insert).not.toHaveBeenCalled();
  });

  it('normalizes a missing store to the same non-disclosing not-found response', async () => {
    merchant.getStore.mockRejectedValue(new NotFoundException('Store not found'));

    await expect(
      service.addAllowlistEntry({ orgId: 'org-1', storeId: 'missing-store', caller: adminCaller }),
    ).rejects.toThrow('Store not found in the target organization');

    expect(insert).not.toHaveBeenCalled();
  });

  it('does not perform a store lookup for an organization-wide allowlist entry', async () => {
    await service.addAllowlistEntry({ orgId: 'org-1', caller: adminCaller });

    expect(identity.getOrg).toHaveBeenCalledWith('org-1');
    expect(merchant.getStore).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledOnce();
  });
});
