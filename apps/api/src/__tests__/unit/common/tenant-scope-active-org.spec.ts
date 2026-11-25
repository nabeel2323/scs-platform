import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  assertActiveOrgMembership,
  assertOrderAccessible,
  assertStoreInOrg,
} from '../../../common/tenant-scope';

const caller = { sub: 'user-1', role: 'MERCHANT_OWNER', activeOrg: 'org-1' };

function createDb() {
  const query = {
    organizationMembers: { findFirst: vi.fn() },
    organizations: { findFirst: vi.fn() },
    stores: { findFirst: vi.fn() },
  };
  return { db: { query } as any, query };
}

describe('active organization ownership checks', () => {
  it('allows an active member of an active organization', async () => {
    const { db, query } = createDb();
    query.organizationMembers.findFirst.mockResolvedValue({ id: 'membership-1' });
    query.organizations.findFirst.mockResolvedValue({ id: 'org-1' });

    await expect(assertActiveOrgMembership(db, caller, 'org-1')).resolves.toBeUndefined();
    expect(query.organizationMembers.findFirst).toHaveBeenCalledTimes(1);
    expect(query.organizations.findFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing or inactive organization membership', async () => {
    const { db, query } = createDb();
    query.organizationMembers.findFirst.mockResolvedValue(null);
    query.organizations.findFirst.mockResolvedValue({ id: 'org-1' });

    await expect(assertActiveOrgMembership(db, caller, 'org-1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects a deactivated organization even when the membership row is active', async () => {
    const { db, query } = createDb();
    query.organizationMembers.findFirst.mockResolvedValue({ id: 'membership-1' });
    query.organizations.findFirst.mockResolvedValue(null);

    await expect(assertActiveOrgMembership(db, caller, 'org-1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects an organization different from the verified activeOrg claim without querying', async () => {
    const { db, query } = createDb();

    await expect(assertActiveOrgMembership(db, caller, 'org-2')).rejects.toThrow(ForbiddenException);
    expect(query.organizationMembers.findFirst).not.toHaveBeenCalled();
    expect(query.organizations.findFirst).not.toHaveBeenCalled();
  });

  it('keeps the explicit platform-role bypass', async () => {
    const { db, query } = createDb();

    await expect(
      assertActiveOrgMembership(db, { ...caller, role: 'SUPER_ADMIN' }, 'org-1'),
    ).resolves.toBeUndefined();
    expect(query.organizationMembers.findFirst).not.toHaveBeenCalled();
    expect(query.organizations.findFirst).not.toHaveBeenCalled();
  });

  it('requires active organization membership for store ownership checks', async () => {
    const { db, query } = createDb();
    query.stores.findFirst.mockResolvedValue({ orgId: 'org-1' });
    query.organizationMembers.findFirst.mockResolvedValue({ id: 'membership-1' });
    query.organizations.findFirst.mockResolvedValue({ id: 'org-1' });

    await expect(assertStoreInOrg(db, caller, 'store-1')).resolves.toBeUndefined();
    expect(query.organizationMembers.findFirst).toHaveBeenCalledTimes(1);
    expect(query.organizations.findFirst).toHaveBeenCalledTimes(1);
  });

  it('requires active organization membership for merchant order access', async () => {
    const { db, query } = createDb();
    query.stores.findFirst.mockResolvedValue({ orgId: 'org-1' });
    query.organizationMembers.findFirst.mockResolvedValue({ id: 'membership-1' });
    query.organizations.findFirst.mockResolvedValue({ id: 'org-1' });

    await expect(
      assertOrderAccessible(db, caller, { buyerId: 'buyer-2', storeId: 'store-1' }),
    ).resolves.toBeUndefined();
  });

  it('keeps buyer-owned order access independent of merchant membership', async () => {
    const { db, query } = createDb();

    await expect(
      assertOrderAccessible(db, { ...caller, activeOrg: null }, { buyerId: 'user-1', storeId: 'store-1' }),
    ).resolves.toBeUndefined();
    expect(query.stores.findFirst).not.toHaveBeenCalled();
    expect(query.organizationMembers.findFirst).not.toHaveBeenCalled();
  });
});
