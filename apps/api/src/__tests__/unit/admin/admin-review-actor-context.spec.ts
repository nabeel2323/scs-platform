import { describe, expect, it, vi } from 'vitest';
import { AdminService } from '../../../modules/admin/admin.service';

describe('AdminService organization update review actor context', () => {
  it('commits the user-scoped review before sending the notification', async () => {
    const events: string[] = [];
    const updated = { id: 'request-a', status: 'APPROVED', decidedBy: 'admin-a' };
    const request = {
      id: 'request-a',
      orgId: 'org-a',
      requestedBy: 'user-a',
      status: 'PENDING',
      payload: { name: 'Updated organization' },
    };
    let updateCount = 0;

    const withActorContext = vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => {
      events.push('scope:start');
      const result = await operation();
      events.push('scope:commit');
      return result;
    });
    const db = {
      withActorContext,
      db: {
        query: {
          organizationUpdateRequests: { findFirst: vi.fn().mockResolvedValue(request) },
          organizations: { findFirst: vi.fn().mockResolvedValue({ id: 'org-a', name: 'Old name' }) },
        },
        update: vi.fn(() => {
          updateCount += 1;
          if (updateCount === 1) {
            return { set: () => ({ where: async () => undefined }) };
          }
          return {
            set: () => ({
              where: () => ({ returning: async () => [updated] }),
            }),
          };
        }),
      },
    };
    const notifications = {
      send: vi.fn(async () => {
        events.push('notification');
      }),
    };
    const service = Object.create(AdminService.prototype) as any;
    service.db = db;
    service.notifications = notifications;

    await expect(
      service.reviewOrgUpdateRequest(
        'request-a',
        'admin-a',
        'APPROVED',
        'approved',
        'ADMIN',
        null,
      ),
    ).resolves.toEqual(updated);

    expect(withActorContext).toHaveBeenCalledWith(
      {
        actorKind: 'user',
        actorId: 'admin-a',
        actorRole: 'ADMIN',
        activeOrgId: null,
      },
      expect.any(Function),
    );
    expect(events).toEqual(['scope:start', 'scope:commit', 'notification']);
    expect(notifications.send).toHaveBeenCalledWith('user-a', 'org_update.approved', {
      orgName: 'Old name',
      notes: 'approved',
    });
  });

  it('rejects a missing reviewer role before opening a database transaction', async () => {
    const withActorContext = vi.fn();
    const service = Object.create(AdminService.prototype) as any;
    service.db = { withActorContext };

    await expect(
      service.reviewOrgUpdateRequest('request-a', 'admin-a', 'REJECTED', undefined, '', null),
    ).rejects.toThrow(/reviewer role is required/);
    expect(withActorContext).not.toHaveBeenCalled();
  });
});
