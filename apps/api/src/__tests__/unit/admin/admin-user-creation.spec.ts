import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from '../../../modules/admin/admin.service';

function buildTxMock(createdUser: any) {
  const returning = vi.fn().mockResolvedValue([createdUser]);
  const insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnThis(), returning });
  return { insert, returning };
}

function createMocks(
  opts: {
    existingEmail?: any;
    existingPhone?: any;
    org?: any;
    role?: any;
    createdUser?: any;
  } = {},
) {
  const findFirstUser = vi.fn().mockResolvedValue(opts.existingEmail ?? undefined);
  const findFirstOrg = vi.fn().mockResolvedValue(opts.org ?? undefined);
  const findFirstRole = vi.fn().mockResolvedValue(opts.role ?? undefined);
  const tx = buildTxMock(
    opts.createdUser ?? { id: 'user-new', email: 'user@example.com', status: 'ACTIVE' },
  );
  const transaction = vi.fn(async (callback: any) => callback(tx));
  const audit = {
    record: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as any,
    db: {} as any,
  };
  const db: any = {
    db: {
      query: {
        users: { findFirst: findFirstUser },
        organizations: { findFirst: findFirstOrg },
        roles: { findFirst: findFirstRole },
      },
      transaction,
    },
  };
  return { db, findFirstUser, findFirstOrg, findFirstRole, tx, audit, transaction };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new AdminService(
    mocks.db,
    {} as any,
    {} as any,
    mocks.audit as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

const baseDto: any = {
  fullName: 'Test User',
  email: 'user@example.com',
  phone: '+15550000001',
  locale: 'en',
  status: 'ACTIVE',
  orgId: 'org-1',
  roleId: 'role-1',
};

describe('AdminService.createUser', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: AdminService;

  beforeEach(() => {
    mocks = createMocks({
      org: { id: 'org-1', name: 'Org' },
      role: { id: 'role-1', key: 'STAFF', name: 'Staff' },
    });
    service = createService(mocks);
  });

  it('creates a user, membership and audit record', async () => {
    const result = await service.createUser(baseDto, 'admin-1');
    expect(result).toMatchObject({ email: 'user@example.com', status: 'ACTIVE' });
    expect(mocks.tx.insert).toHaveBeenCalledTimes(2);
    expect(mocks.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'ADMIN', actorId: 'admin-1', action: 'USER_CREATED' }),
    );
  });

  it('throws ConflictException on duplicate email', async () => {
    mocks.findFirstUser.mockResolvedValue({ id: 'existing', email: 'user@example.com' });
    await expect(service.createUser(baseDto, 'admin-1')).rejects.toThrow(ConflictException);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictException on duplicate phone', async () => {
    mocks.findFirstUser
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'existing', phone: '+15550000001' });
    await expect(service.createUser(baseDto, 'admin-1')).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when org is missing', async () => {
    mocks.findFirstOrg.mockResolvedValue(undefined);
    await expect(
      service.createUser({ ...baseDto, orgId: 'org-missing' }, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when role is missing', async () => {
    mocks.findFirstRole.mockResolvedValue(undefined);
    await expect(
      service.createUser({ ...baseDto, roleId: 'role-missing' }, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an organization without a role instead of silently creating an unassigned user', async () => {
    await expect(service.createUser({ ...baseDto, roleId: undefined }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit.record).not.toHaveBeenCalled();
  });

  it('rejects a role without an organization instead of silently dropping the role', async () => {
    await expect(service.createUser({ ...baseDto, orgId: undefined }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit.record).not.toHaveBeenCalled();
  });

  it('creates user without membership when orgId/roleId omitted', async () => {
    mocks.findFirstUser.mockResolvedValue(undefined);
    const result = await service.createUser(
      { ...baseDto, orgId: undefined, roleId: undefined, phone: undefined },
      'admin-1',
    );
    expect(result.email).toBe('user@example.com');
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
  });
});
