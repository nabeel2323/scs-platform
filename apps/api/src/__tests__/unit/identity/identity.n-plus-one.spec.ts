import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdentityService } from '../../../modules/identity/identity.service';

/**
 * Identity Service — N+1 query elimination unit tests (P2).
 *
 * Focus: `buildClaims`, `listUserOrgs`, `listOrgMembers`, and `getProfile`
 * must resolve related rows with a single batched `findMany(inArray(...))`
 * instead of one `findFirst` per membership / role-permission.
 *
 * The proof is behavioural: for N related rows, the batched `findMany` is
 * called exactly once and the per-row `findFirst` is never called.
 */

// ── Mock builder ──────────────────────────────────────────────────
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

const USER_ID = 'user-1';

describe('IdentityService — N+1 elimination (P2)', () => {
  let service: IdentityService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  describe('listUserOrgs', () => {
    const memberships = [
      {
        id: 'm1',
        orgId: 'org-1',
        userId: USER_ID,
        roleId: 'role-1',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'm2',
        orgId: 'org-2',
        userId: USER_ID,
        roleId: 'role-2',
        status: 'ACTIVE',
        createdAt: new Date('2026-02-01'),
      },
      {
        id: 'm3',
        orgId: 'org-3',
        userId: USER_ID,
        roleId: 'role-1',
        status: 'PENDING',
        createdAt: new Date('2026-03-01'),
      },
    ];
    const orgs = [
      { id: 'org-1', name: 'Alpha' },
      { id: 'org-2', name: 'Beta' },
      { id: 'org-3', name: 'Gamma' },
    ];

    it('fetches all orgs in one batched query (no per-membership findFirst)', async () => {
      mocks.db.query.organizationMembers.findMany.mockResolvedValue(memberships);
      mocks.db.query.organizations.findMany.mockResolvedValue(orgs);

      const result = await service.listUserOrgs(USER_ID);

      expect(mocks.db.query.organizations.findMany).toHaveBeenCalledTimes(1);
      expect(mocks.db.query.organizations.findFirst).not.toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        id: 'org-1',
        name: 'Alpha',
        membershipStatus: 'ACTIVE',
        roleId: 'role-1',
      });
      expect(result[2]).toMatchObject({ id: 'org-3', membershipStatus: 'PENDING' });
    });

    it('returns [] without querying orgs when the user has no memberships', async () => {
      mocks.db.query.organizationMembers.findMany.mockResolvedValue([]);

      const result = await service.listUserOrgs(USER_ID);

      expect(result).toEqual([]);
      expect(mocks.db.query.organizations.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listOrgMembers', () => {
    const memberships = [
      {
        id: 'm1',
        orgId: 'org-1',
        userId: 'u1',
        roleId: 'role-1',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'm2',
        orgId: 'org-1',
        userId: 'u2',
        roleId: 'role-2',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-02'),
      },
      {
        id: 'm3',
        orgId: 'org-1',
        userId: 'u3',
        roleId: 'role-1',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-03'),
      },
    ];
    const users = [
      { id: 'u1', fullName: 'Ann', phone: '+966500000001' },
      { id: 'u2', fullName: 'Bob', phone: '+966500000002' },
      { id: 'u3', fullName: 'Cid', phone: '+966500000003' },
    ];
    const roles = [
      { id: 'role-1', key: 'MERCHANT_OWNER' },
      { id: 'role-2', key: 'MERCHANT_STAFF' },
    ];

    it('fetches users and roles in one batched query each (no per-member findFirst)', async () => {
      mocks.db.query.organizationMembers.findMany.mockResolvedValue(memberships);
      mocks.db.query.users.findMany.mockResolvedValue(users);
      mocks.db.query.roles.findMany.mockResolvedValue(roles);

      const result = await service.listOrgMembers('org-1');

      expect(mocks.db.query.users.findMany).toHaveBeenCalledTimes(1);
      expect(mocks.db.query.roles.findMany).toHaveBeenCalledTimes(1);
      expect(mocks.db.query.users.findFirst).not.toHaveBeenCalled();
      expect(mocks.db.query.roles.findFirst).not.toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ userId: 'u1', fullName: 'Ann', roleKey: 'MERCHANT_OWNER' });
      expect(result[1]).toMatchObject({ userId: 'u2', fullName: 'Bob', roleKey: 'MERCHANT_STAFF' });
    });

    it('falls back to Unknown/UNKNOWN when a user or role row is missing', async () => {
      mocks.db.query.organizationMembers.findMany.mockResolvedValue([memberships[0]]);
      mocks.db.query.users.findMany.mockResolvedValue([]);
      mocks.db.query.roles.findMany.mockResolvedValue([]);

      const result = await service.listOrgMembers('org-1');

      expect(result[0]).toMatchObject({ fullName: 'Unknown', phone: '', roleKey: 'UNKNOWN' });
    });

    it('returns [] without batched queries when the org has no members', async () => {
      mocks.db.query.organizationMembers.findMany.mockResolvedValue([]);

      const result = await service.listOrgMembers('org-1');

      expect(result).toEqual([]);
      expect(mocks.db.query.users.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('fetches membership orgs in one batched query (no per-membership findFirst)', async () => {
      mocks.db.query.users.findFirst.mockResolvedValue({
        id: USER_ID,
        phone: '+966500000001',
        email: null,
        fullName: 'Ann',
        locale: 'en',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
      });
      mocks.db.query.organizationMembers.findMany.mockResolvedValue([
        {
          id: 'm1',
          orgId: 'org-1',
          userId: USER_ID,
          roleId: 'role-1',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
        {
          id: 'm2',
          orgId: 'org-2',
          userId: USER_ID,
          roleId: 'role-2',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
      ]);
      mocks.db.query.organizations.findMany.mockResolvedValue([
        { id: 'org-1', name: 'Alpha' },
        { id: 'org-2', name: 'Beta' },
      ]);
      // getProfile also resolves the active role's permission keys (RBAC GAP-6).
      mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-1', key: 'MERCHANT_OWNER' });
      mocks.db.query.rolePermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', permissionId: 'p1' },
        { roleId: 'role-1', permissionId: 'p2' },
      ]);
      mocks.db.query.permissions.findMany.mockResolvedValue([
        { id: 'p1', key: 'merchant:inventory:read' },
        { id: 'p2', key: 'merchant:inventory:write' },
      ]);

      const profile = await service.getProfile(USER_ID);

      expect(mocks.db.query.organizations.findMany).toHaveBeenCalledTimes(1);
      expect(mocks.db.query.organizations.findFirst).not.toHaveBeenCalled();
      expect(profile.organizations).toHaveLength(2);
      expect(profile.activeOrgId).toBe('org-1');
      expect(profile.perms).toEqual(['merchant:inventory:read', 'merchant:inventory:write']);
    });
  });

  describe('buildClaims (via switchOrg)', () => {
    it('resolves role permissions in one batched query (no per-permission findFirst)', async () => {
      const memberships = [
        {
          id: 'm1',
          orgId: 'org-1',
          userId: USER_ID,
          roleId: 'role-1',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
      ];
      mocks.db.query.organizationMembers.findFirst.mockResolvedValue(memberships[0]);
      mocks.db.query.organizationMembers.findMany.mockResolvedValue(memberships);
      mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-1', key: 'MERCHANT_OWNER' });
      mocks.db.query.rolePermissions.findMany.mockResolvedValue([
        { roleId: 'role-1', permissionId: 'p1' },
        { roleId: 'role-1', permissionId: 'p2' },
        { roleId: 'role-1', permissionId: 'p3' },
      ]);
      mocks.db.query.permissions.findMany.mockResolvedValue([
        { id: 'p1', key: 'merchant:products:write' },
        { id: 'p2', key: 'merchant:orders:write' },
        { id: 'p3', key: 'merchant:promotions:write' },
      ]);

      await service.switchOrg(USER_ID, 'org-1');

      // Permissions resolved with a single batched findMany, never per-row findFirst.
      expect(mocks.db.query.permissions.findMany).toHaveBeenCalledTimes(1);
      expect(mocks.db.query.permissions.findFirst).not.toHaveBeenCalled();

      // The signed JWT carries the full permission set from the batched query.
      const signedPayload = mocks.mockJwt.sign.mock.calls[0][0];
      expect(signedPayload.activeOrg).toBe('org-1');
      expect(signedPayload.role).toBe('MERCHANT_OWNER');
      expect(signedPayload.perms.sort()).toEqual(
        ['merchant:orders:write', 'merchant:products:write', 'merchant:promotions:write'].sort(),
      );
    });

    it('skips the permissions query entirely when the role has none', async () => {
      const memberships = [
        {
          id: 'm1',
          orgId: 'org-1',
          userId: USER_ID,
          roleId: 'role-1',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
      ];
      mocks.db.query.organizationMembers.findFirst.mockResolvedValue(memberships[0]);
      mocks.db.query.organizationMembers.findMany.mockResolvedValue(memberships);
      mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-1', key: 'BUYER' });
      mocks.db.query.rolePermissions.findMany.mockResolvedValue([]);

      await service.switchOrg(USER_ID, 'org-1');

      expect(mocks.db.query.permissions.findMany).not.toHaveBeenCalled();
      expect(mocks.mockJwt.sign.mock.calls[0][0].perms).toEqual([]);
    });
  });
});
