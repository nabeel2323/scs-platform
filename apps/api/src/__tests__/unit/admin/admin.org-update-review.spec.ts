import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from '../../../modules/admin/admin.service';

/**
 * Admin Service — organization update request review unit tests (G5).
 *
 * Covers the admin decision flow:
 *   - APPROVED applies the proposed payload to the organizations row
 *   - REJECTED leaves the organization untouched
 *   - Unknown or already-decided requests are rejected
 */

function createMocks() {
  const findFirstUpdateReq = vi.fn();
  const findFirstOrg = vi.fn();
  const updateSet = vi.fn();
  const updateWhere = vi.fn();
  const updateReturning = vi.fn();

  const updateChain = {
    set: updateSet.mockReturnThis(),
    where: updateWhere.mockReturnThis(),
    returning: updateReturning,
  };

  const db = {
    query: {
      organizations: { findFirst: findFirstOrg },
      organizationUpdateRequests: { findFirst: findFirstUpdateReq },
    },
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn(),
  };

  const mockDb = { db } as any;
  const mockStorage = { createPresignedGetUrl: vi.fn() } as any;
  const mockNotifications = { send: vi.fn().mockResolvedValue(undefined) } as any;

  return { db, findFirstUpdateReq, findFirstOrg, updateSet, updateWhere, updateReturning, mockDb, mockStorage, mockNotifications };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new AdminService(mocks.mockDb, mocks.mockStorage, mocks.mockNotifications);
}

const pendingRequest = {
  id: 'req-1',
  orgId: 'org-1',
  requestedBy: 'user-1',
  status: 'PENDING',
  payload: { legalName: 'New Legal', taxId: '300000000000003' },
};

describe('AdminService.reviewOrgUpdateRequest', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: AdminService;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
    mocks.findFirstUpdateReq.mockResolvedValue(pendingRequest);
    mocks.findFirstOrg.mockResolvedValue({ id: 'org-1', name: 'Test Org' });
    mocks.updateReturning.mockResolvedValue([{ ...pendingRequest, status: 'APPROVED' }]);
  });

  it('applies the payload to the organization on APPROVED', async () => {
    const result = await service.reviewOrgUpdateRequest('req-1', 'admin-1', 'APPROVED', 'Looks good');

    // First update = organizations (payload applied), second = the request row
    expect(mocks.db.update).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'APPROVED' });
  });

  it('sends org_update.approved notification on APPROVED', async () => {
    await service.reviewOrgUpdateRequest('req-1', 'admin-1', 'APPROVED', 'Looks good');

    expect(mocks.mockNotifications.send).toHaveBeenCalledWith(
      'user-1',
      'org_update.approved',
      { orgName: 'Test Org', notes: 'Looks good' },
    );
  });

  it('sends org_update.rejected notification on REJECTED', async () => {
    mocks.updateReturning.mockResolvedValue([{ ...pendingRequest, status: 'REJECTED' }]);

    await service.reviewOrgUpdateRequest('req-1', 'admin-1', 'REJECTED', 'Invalid tax ID');

    expect(mocks.mockNotifications.send).toHaveBeenCalledWith(
      'user-1',
      'org_update.rejected',
      { orgName: 'Test Org', notes: 'Invalid tax ID' },
    );
  });

  it('does not touch the organization on REJECTED', async () => {
    mocks.updateReturning.mockResolvedValue([{ ...pendingRequest, status: 'REJECTED' }]);

    await service.reviewOrgUpdateRequest('req-1', 'admin-1', 'REJECTED', 'Invalid tax ID');

    // Only the request row is updated
    expect(mocks.db.update).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException for unknown request', async () => {
    mocks.findFirstUpdateReq.mockResolvedValue(undefined);

    await expect(service.reviewOrgUpdateRequest('missing', 'admin-1', 'APPROVED'))
      .rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the request was already decided', async () => {
    mocks.findFirstUpdateReq.mockResolvedValue({ ...pendingRequest, status: 'APPROVED' });

    await expect(service.reviewOrgUpdateRequest('req-1', 'admin-1', 'APPROVED'))
      .rejects.toThrow(BadRequestException);
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the approved payload has no applicable fields', async () => {
    mocks.findFirstUpdateReq.mockResolvedValue({ ...pendingRequest, payload: {} });

    await expect(service.reviewOrgUpdateRequest('req-1', 'admin-1', 'APPROVED'))
      .rejects.toThrow(BadRequestException);
    expect(mocks.db.update).not.toHaveBeenCalled();
  });
});
