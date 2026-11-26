import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { IdentityService } from '../../../modules/identity/identity.service';

process.env['OTP_HMAC_SECRET'] = 'test-hmac-secret-for-unit-tests-only-32chars-min!!';

function createHarness() {
  const db = {
    query: {
      users: { findFirst: vi.fn() },
      organizationMembers: { findFirst: vi.fn(), findMany: vi.fn() },
      organizations: { findFirst: vi.fn(), findMany: vi.fn() },
      roles: { findFirst: vi.fn() },
      rolePermissions: { findMany: vi.fn() },
      permissions: { findMany: vi.fn() },
    },
  };
  const mockDb = { db } as any;
  const redis = { client: { set: vi.fn(), get: vi.fn(), del: vi.fn() } } as any;
  const jwt = { sign: vi.fn().mockReturnValue('signed.token'), verify: vi.fn() } as any;
  const rateLimit = { checkAndIncrement: vi.fn(), resetAttempts: vi.fn() } as any;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as any;
  const otp = {
    deliverOtp: vi.fn().mockResolvedValue({ success: false, status: 'failed', errorReason: 'NOT_CONFIGURED', deliveryOutcome: 'rejected' }),
    isChannelAvailable: vi.fn().mockReturnValue(false),
    getAvailableChannels: vi.fn().mockReturnValue([]),
  } as any;
  const service = new IdentityService(mockDb, redis, jwt, rateLimit, audit, otp, { getMockProvider: () => null } as any);
  return { service, db, jwt };
}

describe('IdentityService active organization claims', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('rejects switching into a suspended membership', async () => {
    harness.db.query.organizationMembers.findFirst.mockResolvedValue({
      id: 'membership-1',
      status: 'SUSPENDED',
      orgId: 'org-1',
    });

    await expect(harness.service.switchOrg('user-1', 'org-1')).rejects.toThrow(ForbiddenException);
    expect(harness.jwt.sign).not.toHaveBeenCalled();
  });

  it('rejects switching into a deactivated organization even with an active membership', async () => {
    harness.db.query.organizationMembers.findFirst.mockResolvedValue({
      id: 'membership-1',
      status: 'ACTIVE',
      orgId: 'org-1',
    });
    harness.db.query.organizations.findFirst.mockResolvedValue(null);

    await expect(harness.service.switchOrg('user-1', 'org-1')).rejects.toThrow(ForbiddenException);
    expect(harness.jwt.sign).not.toHaveBeenCalled();
  });

  it('issues merchant claims only for active membership in an active organization', async () => {
    harness.db.query.organizationMembers.findFirst.mockResolvedValue({
      id: 'membership-1',
      status: 'ACTIVE',
      orgId: 'org-1',
    });
    harness.db.query.organizations.findFirst.mockResolvedValue({ id: 'org-1', isActive: true });
    harness.db.query.organizationMembers.findMany.mockResolvedValue([
      { id: 'old-membership', orgId: 'org-old', status: 'SUSPENDED', roleId: 'role-admin' },
      { id: 'membership-1', orgId: 'org-1', status: 'ACTIVE', roleId: 'role-owner' },
    ]);
    harness.db.query.organizations.findMany.mockResolvedValue([{ id: 'org-1' }]);
    harness.db.query.roles.findFirst.mockResolvedValue({ id: 'role-owner', key: 'MERCHANT_OWNER' });
    harness.db.query.rolePermissions.findMany.mockResolvedValue([]);

    await harness.service.switchOrg('user-1', 'org-1');

    const signed = harness.jwt.sign.mock.calls[0][0];
    expect(signed.activeOrg).toBe('org-1');
    expect(signed.role).toBe('MERCHANT_OWNER');
  });

  it('does not choose a suspended membership when building default claims', async () => {
    harness.db.query.organizationMembers.findMany.mockResolvedValue([
      { id: 'old-membership', orgId: 'org-old', status: 'SUSPENDED', roleId: 'role-admin' },
    ]);
    harness.db.query.roles.findFirst.mockResolvedValue({ id: 'role-buyer', key: 'BUYER' });
    harness.db.query.rolePermissions.findMany.mockResolvedValue([]);

    const claims = await (harness.service as any).buildClaims('user-1');

    expect(claims).toMatchObject({ activeOrgId: null, roleKey: 'BUYER', permissions: [] });
    expect(harness.db.query.organizations.findMany).not.toHaveBeenCalled();
  });

  it('does not project a merchant role from a deactivated organization in the profile', async () => {
    harness.db.query.users.findFirst.mockResolvedValue({
      id: 'user-1',
      phone: null,
      email: 'user@example.test',
      fullName: 'Test User',
      locale: 'en',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
    });
    harness.db.query.organizationMembers.findMany.mockResolvedValue([
      { id: 'membership-1', orgId: 'org-1', status: 'ACTIVE', roleId: 'role-admin' },
    ]);
    harness.db.query.organizations.findMany.mockResolvedValue([
      { id: 'org-1', isActive: false, name: 'Inactive org' },
    ]);
    harness.db.query.roles.findFirst.mockResolvedValue({ id: 'role-buyer', key: 'BUYER' });
    harness.db.query.rolePermissions.findMany.mockResolvedValue([]);

    const profile = await harness.service.getProfile('user-1', 'org-1');

    expect(profile.activeOrgId).toBeNull();
    expect(profile.role).toBe('BUYER');
  });

  it('does not project a membership role when the JWT has no active organization', async () => {
    harness.db.query.users.findFirst.mockResolvedValue({
      id: 'user-1',
      phone: null,
      email: 'user@example.test',
      fullName: 'Test User',
      locale: 'en',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
    });
    harness.db.query.organizationMembers.findMany.mockResolvedValue([
      { id: 'membership-1', orgId: 'org-1', status: 'ACTIVE', roleId: 'role-owner' },
    ]);
    harness.db.query.organizations.findMany.mockResolvedValue([
      { id: 'org-1', isActive: true, name: 'Active org' },
    ]);
    harness.db.query.roles.findFirst.mockResolvedValue({ id: 'role-buyer', key: 'BUYER' });
    harness.db.query.rolePermissions.findMany.mockResolvedValue([]);

    const profile = await harness.service.getProfile('user-1', null);

    expect(profile.activeOrgId).toBeNull();
    expect(profile.role).toBe('BUYER');
  });

  it('fails closed when an active membership organization cannot be resolved', async () => {
    harness.db.query.users.findFirst.mockResolvedValue({
      id: 'user-1',
      phone: null,
      email: 'user@example.test',
      fullName: 'Test User',
      locale: 'en',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
    });
    harness.db.query.organizationMembers.findMany.mockResolvedValue([
      { id: 'membership-1', orgId: 'org-missing', status: 'ACTIVE', roleId: 'role-merchant' },
    ]);
    harness.db.query.organizations.findMany.mockResolvedValue([]);
    harness.db.query.roles.findFirst.mockResolvedValue({ id: 'role-buyer', key: 'BUYER' });
    harness.db.query.rolePermissions.findMany.mockResolvedValue([]);

    const profile = await harness.service.getProfile('user-1', 'org-missing');

    expect(profile.activeOrgId).toBeNull();
    expect(profile.role).toBe('BUYER');
  });

});
