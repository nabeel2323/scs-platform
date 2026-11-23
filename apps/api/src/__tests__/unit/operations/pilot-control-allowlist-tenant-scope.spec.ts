import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PilotControlService } from '../../../modules/operations/pilot-control.service';

describe('PilotControlService allowlist tenant consistency', () => {
  it('rejects a store that does not belong to the requested organization', async () => {
    const orgFindFirst = vi.fn().mockResolvedValue({ id: 'org-a' });
    const storeFindFirst = vi.fn().mockResolvedValue(null);
    const insert = vi.fn();
    const service = new PilotControlService(
      {
        db: {
          query: {
            organizations: { findFirst: orgFindFirst },
            stores: { findFirst: storeFindFirst },
          },
          insert,
        },
      } as any,
      { record: vi.fn() } as any,
      { raise: vi.fn() } as any,
    );

    await expect(
      service.addAllowlistEntry({
        orgId: 'org-a',
        storeId: 'store-b',
        actorId: 'admin-a',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const query = storeFindFirst.mock.calls[0]?.[0] as { where: any };
    const compiled = new PgDialect().sqlToQuery(query.where);
    expect(compiled.params).toEqual(expect.arrayContaining(['store-b', 'org-a']));
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent organization before resolving a store', async () => {
    const orgFindFirst = vi.fn().mockResolvedValue(null);
    const storeFindFirst = vi.fn();
    const insert = vi.fn();
    const service = new PilotControlService(
      {
        db: {
          query: {
            organizations: { findFirst: orgFindFirst },
            stores: { findFirst: storeFindFirst },
          },
          insert,
        },
      } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.addAllowlistEntry({ orgId: 'missing-org', storeId: 'store-a' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storeFindFirst).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
