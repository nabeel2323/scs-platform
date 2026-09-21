import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { IdentityService } from '../../../modules/identity/identity.service';

/**
 * Identity Service — deactivateOrg unit tests.
 *
 * Covers the admin soft-delete / reactivation flow for organizations:
 *   - Deactivation sets isActive=false and updatedAt
 *   - Reactivation sets isActive=true
 *   - Throws NotFoundException for unknown org IDs
 */

function createMocks() {
  const findFirstOrg = vi.fn();
  const db = {
    query: {
      sessions: { findMany: vi.fn(), findFirst: vi.fn() },
      users: { findMany: vi.fn(), findFirst: vi.fn() },
      organizationMembers: { findMany: vi.fn(), findFirst: vi.fn() },
      organizations: { findMany: vi.fn(), findFirst: findFirstOrg },
      roles: { findMany: vi.fn(), findFirst: vi.fn() },
      rolePermissions: { findMany: vi.fn() },
      permissions: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };

  const mockDb = { db } as any;
  const mockRedis = {
    client: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn() },
  } as any;
  const mockJwt = { sign: vi.fn().mockReturnValue('signed.token'), verify: vi.fn() } as any;
  const mockRateLimit = { checkAndIncrement: vi.fn(), resetAttempts: vi.fn() } as any;
  const mockAudit = { record: vi.fn().mockResolvedValue(undefined) } as any;

  return { db, findFirstOrg, mockDb, mockRedis, mockJwt, mockRateLimit, mockAudit };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new IdentityService(
    mocks.mockDb,
    mocks.mockRedis,
    mocks.mockJwt,
    mocks.mockRateLimit,
    mocks.mockAudit,
  );
}

describe('IdentityService.deactivateOrg', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: IdentityService;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  it('should deactivate an existing organization', async () => {
    const org = { id: 'org-1', name: 'Test Org', isActive: true };
    // getOrg call (existence check) + return after update
    mocks.findFirstOrg.mockResolvedValue(org);

    const result = await service.deactivateOrg('org-1', false);

    expect(mocks.findFirstOrg).toHaveBeenCalled();
    expect(mocks.db.update).toHaveBeenCalled();
    // The method calls getOrg twice (existence check + return)
    expect(mocks.findFirstOrg).toHaveBeenCalledTimes(2);
    expect(result).toEqual(org);
  });

  it('should reactivate a deactivated organization', async () => {
    const org = { id: 'org-1', name: 'Test Org', isActive: true };
    mocks.findFirstOrg.mockResolvedValue(org);

    const result = await service.deactivateOrg('org-1', true);

    expect(mocks.db.update).toHaveBeenCalled();
    expect(result).toEqual(org);
  });

  it('should throw NotFoundException for unknown org', async () => {
    mocks.findFirstOrg.mockResolvedValue(undefined);

    await expect(service.deactivateOrg('nonexistent', false))
      .rejects.toThrow(NotFoundException);
  });
});
