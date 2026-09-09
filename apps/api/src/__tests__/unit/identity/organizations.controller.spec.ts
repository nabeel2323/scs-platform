import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationsController } from '../../../modules/identity/organizations.controller';
import { IdentityService } from '../../../modules/identity/identity.service';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

/**
 * OrganizationsController — delegation unit tests.
 *
 * Covers the organization CRUD + membership surface (create / join / get /
 * update / add member / list members / remove member). The service is mocked;
 * these assert each route forwards the right arguments (the `listOrgMembers`
 * path is the N+1-hardened query from API-B8).
 */

function mockIdentity() {
  return {
    createOrg: vi.fn(),
    joinOrgByInvite: vi.fn(),
    getOrg: vi.fn(),
    updateOrg: vi.fn(),
    addOrgMember: vi.fn(),
    listOrgMembers: vi.fn(),
    removeOrgMember: vi.fn(),
  };
}

const payload = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  activeOrg: 'org-1',
  role: 'OWNER',
  perms: [],
  iat: 0,
  exp: 9999999999,
  ...over,
});

describe('OrganizationsController', () => {
  let svc: ReturnType<typeof mockIdentity>;
  let controller: OrganizationsController;

  beforeEach(() => {
    svc = mockIdentity();
    controller = new OrganizationsController(svc as unknown as IdentityService);
  });

  it('createOrg forwards body + the caller sub', async () => {
    const body = { name: 'Acme', type: 'MERCHANT', country: 'SA' };
    await controller.createOrg(payload({ sub: 'u1' }), body);
    expect(svc.createOrg).toHaveBeenCalledWith(body, 'u1');
  });

  it('joinOrg forwards sub + invite code', async () => {
    await controller.joinOrg(payload({ sub: 'u1' }), { code: 'ABC123' });
    expect(svc.joinOrgByInvite).toHaveBeenCalledWith('u1', 'ABC123');
  });

  it('getOrg forwards the id', async () => {
    await controller.getOrg('org-1');
    expect(svc.getOrg).toHaveBeenCalledWith('org-1');
  });

  it('updateOrg forwards id + body', async () => {
    const body = { name: 'Renamed' };
    await controller.updateOrg('org-1', body);
    expect(svc.updateOrg).toHaveBeenCalledWith('org-1', body);
  });

  it('addMember forwards orgId + userId + roleId', async () => {
    await controller.addMember('org-1', { userId: 'u2', roleId: 'r1' });
    expect(svc.addOrgMember).toHaveBeenCalledWith('org-1', 'u2', 'r1');
  });

  it('listMembers forwards the orgId (API-B8 batched path)', async () => {
    await controller.listMembers('org-1');
    expect(svc.listOrgMembers).toHaveBeenCalledWith('org-1');
  });

  it('removeMember forwards orgId + userId', async () => {
    await controller.removeMember('org-1', 'u2');
    expect(svc.removeOrgMember).toHaveBeenCalledWith('org-1', 'u2');
  });
});
