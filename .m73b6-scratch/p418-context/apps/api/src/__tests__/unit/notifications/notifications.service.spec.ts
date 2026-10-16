import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import { NotificationsService } from '../../../modules/notifications/notifications.service';

/**
 * Regression: `order.submitted` (and every other multi-channel template) fans
 * out to one row per channel, so the web bell and unread badge must surface
 * IN_APP only — otherwise a single checkout shows "New Order Received" twice
 * (once for IN_APP, once for PUSH). These tests capture the WHERE clause the
 * service builds and assert it filters by channel = 'IN_APP'.
 */
function makeCapturingDb() {
  const captured: { lastWhere?: unknown } = {};
  const db = {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          captured.lastWhere = clause;
          return {
            orderBy: () => ({
              limit: () => ({ offset: () => Promise.resolve([]) }),
            }),
            limit: () => Promise.resolve([{ count: 1 }]),
          };
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: (clause: unknown) => {
          captured.lastWhere = clause;
          return Promise.resolve(undefined);
        },
      }),
    }),
    query: {},
  };
  return { db: { db } as any, captured };
}

describe('NotificationsService — IN_APP channel filter on bell-facing queries', () => {
  it('listNotifications restricts the query to channel = IN_APP', async () => {
    const { db, captured } = makeCapturingDb();
    const svc = new NotificationsService(db);
    await svc.listNotifications('user-1', 20, 0);
    const dump = inspect(captured.lastWhere, { depth: 30 });
    expect(dump).toMatch(/channel/);
    expect(dump).toMatch(/IN_APP/);
  });

  it('getUnreadCount restricts the query to channel = IN_APP', async () => {
    const { db, captured } = makeCapturingDb();
    const svc = new NotificationsService(db);
    await svc.getUnreadCount('user-1');
    const dump = inspect(captured.lastWhere, { depth: 30 });
    expect(dump).toMatch(/channel/);
    expect(dump).toMatch(/IN_APP/);
  });

  it('markAllAsRead restricts the update to channel = IN_APP', async () => {
    const { db, captured } = makeCapturingDb();
    const svc = new NotificationsService(db);
    await svc.markAllAsRead('user-1');
    const dump = inspect(captured.lastWhere, { depth: 30 });
    expect(dump).toMatch(/channel/);
    expect(dump).toMatch(/IN_APP/);
  });
});
