import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IdentityService } from '../../../modules/identity/identity.service';

/**
 * Identity Service — organization update request unit tests (G5).
 *
 * Covers the merchant-side admin-approval workflow:
 *   - requestOrgUpdate creates a PENDING request for org members
 *   - Non-members, deactivated orgs and duplicate PENDING requests are rejected
 *   - listOrgUpdateRequests enforces org membership
 */

function createMocks() {
  const findFirstOrg = vi.fn();
  const findFirstMember = vi.fn();
  const findFirstUpdateReq = vi.fn();
  const findManyUpdateReqs = vi.fn();
  const insertReturning = vi.fn();

  const db = {
    query: {
      sessions: { findMany: vi.fn(), findFirst: vi.fn() },
      users: { findMany: vi.fn(), findFirst: vi.fn() },
      organizationMembers: { findMany: vi.fn(), findFirst: findFirstMember },
      organizations: { findMany: vi.fn(), findFirst: findFirstOrg },
      organizationUpdateRequests: { findFirst: findFirstUpdateReq, findMany: findManyUpdateReqs },
      roles: { findMany: vi.fn(), findFirst: vi.fn() },
      rolePermissions: { findMany: vi.fn() },
      permissions: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: insertReturning }),
    }),
  };

  const mockDb = { db } as any;
  const mockRedis = {
    client: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn() },
  } as any;
  const mockJwt = { sign: vi.fn().mockReturnValue('signed.token'), verify: vi.fn() } as any;
  const mockRateLimit = { checkAndIncrement: vi.fn(), resetAttempts: vi.fn() } as any;
  const mockAudit = { record: vi.fn().mockResolvedValue(undefined) } as any;

  return {
    db, findFirstOrg, findFirstMember, findFirstUpdateReq, findManyUpdateReqs, insertReturning,
    mockDb, mockRedis, mockJwt, mockRateLimit, mockAudit,
  };
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

const activeOrg = { id: 'org-1', name: 'Test Org', isActive: true };
const membership = { id: 'm-1', orgId: 'org-1', userId: 'user-1', status: 'ACTIVE' };

describe('IdentityService.requestOrgUpdate', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: IdentityService;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
    mocks.findFirstOrg.mockResolvedValue(activeOrg);
    mocks.findFirstMember.mockResolvedValue(membership);
    mocks.findFirstUpdateReq.mockResolvedValue(undefined);
  });

  it('creates a PENDING update request for an org member', async () => {
    const created = { id: 'req-1', orgId: 'org-1', status: 'PENDING', payload: { legalName: 'New Legal' } };
    mocks.insertReturning.mockResolvedValue([created]);

    const result = await service.requestOrgUpdate('org-1', 'user-1', { legalName: 'New Legal' });

    expect(mocks.db.insert).toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it('throws ForbiddenException for non-members', async () => {
    mocks.findFirstMember.mockResolvedValue(undefined);

    await expect(service.requestOrgUpdate('org-1', 'outsider', { name: 'X' }))
      .rejects.toThrow(ForbiddenException);
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException for deactivated organizations', async () => {
    mocks.findFirstOrg.mockResolvedValue({ ...activeOrg, isActive: false });

    await expect(service.requestOrgUpdate('org-1', 'user-1', { name: 'X' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException when a PENDING request already exists', async () => {
    mocks.findFirstUpdateReq.mockResolvedValue({ id: 'req-0', status: 'PENDING' });

    await expect(service.requestOrgUpdate('org-1', 'user-1', { name: 'X' }))
      .rejects.toThrow(ConflictException);
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when no fields are provided', async () => {
    await expect(service.requestOrgUpdate('org-1', 'user-1', {}))
      .rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException for unknown org', async () => {
    mocks.findFirstOrg.mockResolvedValue(undefined);

    await expect(service.requestOrgUpdate('missing', 'user-1', { name: 'X' }))
      .rejects.toThrow(NotFoundException);
  });
});

describe('IdentityService.listOrgUpdateRequests', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: IdentityService;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
    mocks.findFirstOrg.mockResolvedValue(activeOrg);
  });

  it('returns requests ordered newest first for members', async () => {
    mocks.findFirstMember.mockResolvedValue(membership);
    const rows = [{ id: 'req-1' }, { id: 'req-0' }];
    mocks.findManyUpdateReqs.mockResolvedValue(rows);

    const result = await service.listOrgUpdateRequests('org-1', 'user-1');

    expect(result).toEqual(rows);
  });

  it('throws ForbiddenException for non-members', async () => {
    mocks.findFirstMember.mockResolvedValue(undefined);

    await expect(service.listOrgUpdateRequests('org-1', 'outsider'))
      .rejects.toThrow(ForbiddenException);
    expect(mocks.findManyUpdateReqs).not.toHaveBeenCalled();
  });
});
