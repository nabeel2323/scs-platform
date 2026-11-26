import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { StoreMembershipService } from '../../../modules/merchant/store-membership.service';

describe('StoreMembershipService.listEligibleUsers', () => {
  it('excludes inactive organization members and existing store members', async () => {
    const storeMembersFindMany = vi.fn().mockResolvedValue([{ userId: 'existing-user' }]);
    const organizationMembersFindMany = vi.fn().mockResolvedValue([
      { userId: 'eligible-user', status: 'ACTIVE' },
      { userId: 'inactive-user', status: 'INACTIVE' },
      { userId: 'existing-user', status: 'ACTIVE' },
    ]);
    const usersFindMany = vi
      .fn()
      .mockResolvedValue([
        { id: 'eligible-user', email: 'eligible@example.test', fullName: 'Eligible User' },
      ]);
    const db = {
      db: {
        query: {
          storeMembers: { findMany: storeMembersFindMany },
          organizationMembers: { findMany: organizationMembersFindMany },
          users: { findMany: usersFindMany },
        },
      },
    };
    const service = new StoreMembershipService(db as any, {} as any);

    await expect(service.listEligibleUsers('store-a', 'org-a')).resolves.toEqual([
      { id: 'eligible-user', email: 'eligible@example.test', fullName: 'Eligible User' },
    ]);

    const query = usersFindMany.mock.calls[0]?.[0] as {
      where: Parameters<PgDialect['sqlToQuery']>[0];
    };
    const compiled = new PgDialect().sqlToQuery(query.where);
    expect(compiled.params).toEqual(['eligible-user']);
    expect(compiled.params).not.toContain('inactive-user');
    expect(compiled.params).not.toContain('existing-user');
  });
});
