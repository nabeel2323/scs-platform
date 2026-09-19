import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../../../modules/identity/identity.service';

/**
 * Identity Service — addOrgMember privilege-escalation regression tests.
 *
 * Security bug: POST /v1/organizations/:id/members inserted the caller-supplied
 * `roleId` with no validation, so a MERCHANT_OWNER (which legitimately holds
 * `identity:organizations:write`) could grant SUPER_ADMIN/ADMIN/MODERATOR to any
 * user. Because buildClaims/getProfile resolve JWT role+perms purely from the
 * membership's roleId, this yielded full platform privileges.
 *
 * The fix enforces, server-side:
 *   1. roleId must exist;
 *   2. non-platform actors may only assign merchant-scoped roles;
 *   3. non-platform actors must be an ACTIVE member of the target org;
 *   4. the target user must exist.
 * Platform actors (holding `admin:users:write`) bypass 2 & 3.
 */

// ── Mock builder (mirrors identity.n-plus-one.spec.ts) ──────────────
function createMocks() {
  const db = {
    query: {
      sessions: { findMany: vi.fn(), findFirst: vi.fn() },
      users: { findMany: vi.fn(), findFirst: vi.fn() },
      organizationMembers: { findMany: vi.fn(), findFirst: vi.fn() },
      organizations: { findMany: vi.fn(), findFirst: vi.fn() },
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

  return { db, mockDb, mockRedis, mockJwt, mockRateLimit, mockAudit };
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

const ORG_ID = 'org-1';
const MERCHANT_OWNER_ACTOR = { sub: 'owner-1', perms: ['identity:organizations:write'] };
const PLATFORM_ADMIN_ACTOR = { sub: 'admin-1', perms: ['admin:users:write'] };

describe('IdentityService.addOrgMember — privilege-escalation guard', () => {
  let service: IdentityService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  it('rejects a MERCHANT_OWNER assigning SUPER_ADMIN (Forbidden)', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-sa', key: 'SUPER_ADMIN' });

    await expect(
      service.addOrgMember(ORG_ID, 'victim', 'role-sa', MERCHANT_OWNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);

    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a MERCHANT_OWNER assigning ADMIN and MODERATOR (Forbidden)', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-admin', key: 'ADMIN' });
    await expect(
      service.addOrgMember(ORG_ID, 'victim', 'role-admin', MERCHANT_OWNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);

    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-mod', key: 'MODERATOR' });
    await expect(
      service.addOrgMember(ORG_ID, 'victim', 'role-mod', MERCHANT_OWNER_ACTOR),
    ).rejects.toThrow(ForbiddenException);

    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('rejects an unknown roleId (BadRequest)', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue(undefined);

    await expect(
      service.addOrgMember(ORG_ID, 'u2', 'does-not-exist', MERCHANT_OWNER_ACTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an actor who is not a member of the target org (tenant scoping)', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-staff', key: 'MERCHANT_STAFF' });
    // actor membership lookup → not a member
    mocks.db.query.organizationMembers.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.addOrgMember(ORG_ID, 'u2', 'role-staff', { sub: 'outsider', perms: ['identity:organizations:write'] }),
    ).rejects.toThrow(ForbiddenException);

    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('rejects when the target user does not exist (NotFound)', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-staff', key: 'MERCHANT_STAFF' });
    mocks.db.query.organizationMembers.findFirst.mockResolvedValueOnce({ id: 'm-owner' }); // actor is a member
    mocks.db.query.users.findFirst.mockResolvedValue(undefined); // target missing

    await expect(
      service.addOrgMember(ORG_ID, 'ghost', 'role-staff', MERCHANT_OWNER_ACTOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows a MERCHANT_OWNER (ACTIVE member) to add a MERCHANT_STAFF', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-staff', key: 'MERCHANT_STAFF' });
    mocks.db.query.organizationMembers.findFirst
      .mockResolvedValueOnce({ id: 'm-owner', status: 'ACTIVE' }) // actor membership
      .mockResolvedValueOnce(null); // no existing membership for target
    mocks.db.query.users.findFirst.mockResolvedValue({ id: 'u2' });

    const result = await service.addOrgMember(ORG_ID, 'u2', 'role-staff', MERCHANT_OWNER_ACTOR);

    expect(result).toEqual({ orgId: ORG_ID, userId: 'u2', roleId: 'role-staff', status: 'ACTIVE' });
    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
  });

  it('allows a platform actor (admin:users:write) to assign a platform role', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-admin', key: 'ADMIN' });
    // tenant check is skipped for platform actors → only the dedupe lookup runs
    mocks.db.query.organizationMembers.findFirst.mockResolvedValueOnce(null);
    mocks.db.query.users.findFirst.mockResolvedValue({ id: 'u3' });

    const result = await service.addOrgMember(ORG_ID, 'u3', 'role-admin', PLATFORM_ADMIN_ACTOR);

    expect(result).toEqual({ orgId: ORG_ID, userId: 'u3', roleId: 'role-admin', status: 'ACTIVE' });
    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
  });

  it('still rejects duplicate membership (Conflict) for an allowed role', async () => {
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-staff', key: 'MERCHANT_STAFF' });
    mocks.db.query.organizationMembers.findFirst
      .mockResolvedValueOnce({ id: 'm-owner', status: 'ACTIVE' }) // actor membership
      .mockResolvedValueOnce({ id: 'm-existing' }); // target already a member
    mocks.db.query.users.findFirst.mockResolvedValue({ id: 'u2' });

    await expect(
      service.addOrgMember(ORG_ID, 'u2', 'role-staff', MERCHANT_OWNER_ACTOR),
    ).rejects.toThrow(/already a member/);

    expect(mocks.db.insert).not.toHaveBeenCalled();
  });
});

describe('IdentityService.listRoles — merchant-scoped role exposure', () => {
  let service: IdentityService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  it('queries only merchant-assignable roles (never surfaces platform roles)', async () => {
    mocks.db.query.roles.findMany.mockResolvedValue([
      { id: 'role-owner', key: 'MERCHANT_OWNER', name: 'Merchant Owner' },
      { id: 'role-staff', key: 'MERCHANT_STAFF', name: 'Merchant Staff' },
    ]);

    const result = await service.listRoles();

    expect(result).toHaveLength(2);
    // The old code called findMany() with no filter (exposing every role).
    // The fix must scope the query with a where-clause (the merchant allow-list).
    expect(mocks.db.query.roles.findMany).toHaveBeenCalledTimes(1);
    const arg = mocks.db.query.roles.findMany.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg).toHaveProperty('where');
  });
});
