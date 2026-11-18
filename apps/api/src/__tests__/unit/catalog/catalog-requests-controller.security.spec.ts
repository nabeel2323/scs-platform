import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogRequestsController } from '../../../modules/catalog/catalog.requests.controller';
import type { CatalogRequestsService } from '../../../modules/catalog/catalog.requests.service';
import type { DatabaseService } from '../../../common/database/database.service';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

function makeHarness(options?: {
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const storeFindFirst = vi.fn().mockResolvedValue(
    options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
  );
  const membershipFindFirst = vi.fn().mockResolvedValue(
    options?.membership === null ? null : { id: 'member-a' },
  );
  const db = {
    db: {
      query: {
        stores: { findFirst: storeFindFirst },
        storeMembers: { findFirst: membershipFindFirst },
      },
    },
  } as unknown as DatabaseService;

  const service = {
    createRequest: vi.fn().mockResolvedValue({ id: 'request-a' }),
    listMerchantRequests: vi.fn().mockResolvedValue([{ id: 'request-a' }]),
    approveRequest: vi.fn().mockResolvedValue({ id: 'request-a' }),
    rejectRequest: vi.fn().mockResolvedValue({ id: 'request-a' }),
  } as unknown as CatalogRequestsService;

  return {
    controller: new CatalogRequestsController(service, db),
    service,
    storeFindFirst,
    membershipFindFirst,
  };
}

const merchantUser = {
  sub: 'merchant-a',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-a',
} as JwtPayload;

const foreignMerchant = {
  sub: 'merchant-b',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-b',
} as JwtPayload;

describe('CatalogRequestsController — tenant isolation', () => {
  it('allows an active store member to list their own requests', async () => {
    const h = makeHarness();
    await expect(h.controller.listMerchantRequests(merchantUser, 'store-a')).resolves.toEqual([
      { id: 'request-a' },
    ]);
    expect(h.storeFindFirst).toHaveBeenCalledOnce();
    expect(h.membershipFindFirst).toHaveBeenCalledOnce();
    expect(h.service.listMerchantRequests).toHaveBeenCalledWith('store-a');
  });

  it('denies a merchant from another organization before reading requests', async () => {
    const h = makeHarness({ storeOrgId: 'org-a' });
    await expect(
      h.controller.listMerchantRequests(foreignMerchant, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.membershipFindFirst).not.toHaveBeenCalled();
    expect(h.service.listMerchantRequests).not.toHaveBeenCalled();
  });

  it('denies an organization member who is not an active store member', async () => {
    const h = makeHarness({ membership: null });
    await expect(
      h.controller.listMerchantRequests(merchantUser, 'store-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.service.listMerchantRequests).not.toHaveBeenCalled();
  });

  it('overrides client-supplied requestedBy with the authenticated identity', async () => {
    const h = makeHarness();
    await h.controller.createRequest(merchantUser, {
      storeId: 'store-a',
      requestedBy: 'attacker-controlled-user',
      type: 'BRAND',
      payload: { name: 'Example' },
    } as any);

    expect(h.service.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-a',
        requestedBy: 'merchant-a',
      }),
    );
  });

  it('does not query tenant data when storeId is omitted', async () => {
    const h = makeHarness();
    await expect(h.controller.listMerchantRequests(merchantUser)).resolves.toEqual([]);
    expect(h.storeFindFirst).not.toHaveBeenCalled();
    expect(h.service.listMerchantRequests).not.toHaveBeenCalled();
  });

  it('uses the authenticated reviewer identity for admin approval', async () => {
    const h = makeHarness();
    await h.controller.approveRequest('request-a', merchantUser);
    expect(h.service.approveRequest).toHaveBeenCalledWith('request-a', 'merchant-a');
  });

  it('uses the authenticated reviewer identity for admin rejection', async () => {
    const h = makeHarness();
    await h.controller.rejectRequest('request-a', merchantUser, { reason: 'Insufficient evidence' });
    expect(h.service.rejectRequest).toHaveBeenCalledWith(
      'request-a',
      'merchant-a',
      'Insufficient evidence',
    );
  });
});
