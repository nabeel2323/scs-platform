import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogController } from '../../../modules/catalog/catalog.controller';
import type { DatabaseService } from '../../../common/database/database.service';

const caller = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };
const body = { ids: ['product-a'], action: 'archive' as const };

function makeController(options?: {
  storeOrgId?: string | null;
  membership?: { id: string } | null;
}) {
  const storesFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.storeOrgId === null ? null : { orgId: options?.storeOrgId ?? 'org-a' },
    );
  const membershipsFindFirst = vi
    .fn()
    .mockResolvedValue(
      options?.membership === null ? null : (options?.membership ?? { id: 'membership-a' }),
    );
  const bulkProductOperations = vi.fn().mockResolvedValue({ affected: 1 });
  const db = {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              const membership = await membershipsFindFirst();
              return membership ? [membership] : [];
            }),
          })),
        })),
      })),
      query: {
        stores: { findFirst: storesFindFirst },
        storeMembers: { findFirst: membershipsFindFirst },
      },
    },
  };
  const controller = new CatalogController(
    { bulkProductOperations } as any,
    {} as any,
    {} as any,
    {} as any,
    db as unknown as DatabaseService,
    {} as any,
    {} as any,
  );
  return { controller, spies: { storesFindFirst, membershipsFindFirst, bulkProductOperations } };
}

describe('Catalog bulk product mutation tenant boundary', () => {
  it('allows an active member of the owning store to perform bulk actions', async () => {
    const h = makeController();
    await expect(
      h.controller.bulkProductOperations('store-a', caller as any, body),
    ).resolves.toEqual({ affected: 1 });
    expect(h.spies.bulkProductOperations).toHaveBeenCalledWith('store-a', body.ids, body.action);
  });

  it('denies same-organization non-members before invoking the bulk service', async () => {
    const h = makeController({ membership: null });
    await expect(
      h.controller.bulkProductOperations('store-a', caller as any, body),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.bulkProductOperations).not.toHaveBeenCalled();
  });

  it('denies a store owned by another active organization before invoking the bulk service', async () => {
    const h = makeController({ storeOrgId: 'org-b' });
    await expect(
      h.controller.bulkProductOperations('store-a', caller as any, body),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.spies.membershipsFindFirst).not.toHaveBeenCalled();
    expect(h.spies.bulkProductOperations).not.toHaveBeenCalled();
  });
});
