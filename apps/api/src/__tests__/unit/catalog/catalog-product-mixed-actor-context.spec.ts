import { ForbiddenException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

const actor = { sub: 'merchant-user', role: 'MERCHANT_OWNER', activeOrg: 'org-1' };
const product = {
  id: 'product-1',
  status: 'DRAFT',
  storeId: 'store-1',
  title: 'Existing title',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildService() {
  let activeActor: Record<string, unknown> | null = null;
  const contexts: Record<string, unknown>[] = [];
  const updateConditions: unknown[] = [];
  const returning = vi.fn().mockResolvedValue([{ id: product.id }]);
  const where = vi.fn((condition: unknown) => {
    updateConditions.push(condition);
    const query = Promise.resolve(undefined) as Promise<unknown> & { returning: typeof returning };
    query.returning = returning;
    return query;
  });
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
    contexts.push(context);
    activeActor = context;
    try {
      return await operation();
    } finally {
      activeActor = null;
    }
  });
  const db = {
    get currentActorContext() {
      return activeActor;
    },
    withActorContext,
    db: {
      update,
      query: {
        products: {
          findFirst: vi.fn(async () => {
            expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
            return { storeId: product.storeId };
          }),
          findMany: vi.fn().mockResolvedValue([{ ...product }]),
        },
        stores: {
          findFirst: vi.fn(async () => {
            expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
            return { orgId: actor.activeOrg };
          }),
        },
        storeMembers: {
          findFirst: vi.fn(async () => {
            expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
            return { id: 'membership-1' };
          }),
        },
      },
    },
  };
  const audit = {
    record: vi.fn(async () => {
      expect(activeActor).toBeNull();
    }),
  };
  const outbox = {
    publish: vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return 'outbox-event';
    }),
  };
  const service = new CatalogService(
    db as any,
    {} as any,
    outbox as any,
    {} as any,
    audit as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  vi.spyOn(service, 'getProduct').mockImplementation(async () => {
    expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
    return { ...product } as any;
  });
  const invalidate = vi.spyOn(service as any, 'invalidateProductCache').mockImplementation(async () => {
    expect(activeActor).toBeNull();
  });

  return { service, contexts, withActorContext, update, updateConditions, audit, outbox, invalidate };
}

describe('CatalogService mixed product mutation actor boundaries (G-002)', () => {
  it('scopes product update reads and writes but closes the DB scope before cache and audit work', async () => {
    const f = buildService();

    await f.service.updateProduct('product-1', { title: 'Updated title' }, undefined, actor);

    expect(f.withActorContext).toHaveBeenCalledTimes(3);
    expect(f.contexts.every((context) => context['actorKind'] === 'user' && context['actorId'] === actor.sub)).toBe(true);
    expect(f.update).toHaveBeenCalledOnce();
    const updateWhere = new PgDialect().sqlToQuery(f.updateConditions[0] as SQL);
    expect(updateWhere.params).toContain('product-1');
    expect(updateWhere.params).toContain('store-1');
    expect(updateWhere.sql.toLowerCase()).toContain('deleted_at');
    expect(updateWhere.sql.toLowerCase()).toContain('is null');
    expect(f.invalidate).toHaveBeenCalledOnce();
    expect(f.audit.record).toHaveBeenCalledOnce();
  });

  it('scopes product deletion and closes the DB scope before cache and audit work', async () => {
    const f = buildService();

    await f.service.deleteProduct('product-1', actor);

    expect(f.withActorContext).toHaveBeenCalledOnce();
    expect(f.contexts[0]).toMatchObject({
      actorKind: 'user',
      actorId: actor.sub,
      actorRole: actor.role,
      activeOrgId: actor.activeOrg,
    });
    expect(f.update).toHaveBeenCalledOnce();
    const deleteWhere = new PgDialect().sqlToQuery(f.updateConditions[0] as SQL);
    expect(deleteWhere.params).toContain('product-1');
    expect(deleteWhere.params).toContain('store-1');
    expect(deleteWhere.sql.toLowerCase()).toContain('deleted_at');
    expect(deleteWhere.sql.toLowerCase()).toContain('is null');
    expect(f.invalidate).toHaveBeenCalledOnce();
    expect(f.audit.record).toHaveBeenCalledOnce();
  });

  it('repeats the store ownership predicate on bulk product writes', async () => {
    const f = buildService();

    await f.service.bulkProductOperations('store-1', ['product-1'], 'archive');

    expect(f.update).toHaveBeenCalledOnce();
    const bulkWhere = new PgDialect().sqlToQuery(f.updateConditions[0] as SQL);
    expect(bulkWhere.params).toContain('store-1');
    expect(bulkWhere.params).toContain('product-1');
    expect(bulkWhere.sql.toLowerCase()).toContain('deleted_at');
    expect(bulkWhere.sql.toLowerCase()).toContain('is null');
  });

  it('keeps publication outbox insertion in a separate short user actor scope', async () => {
    const f = buildService();
    vi.spyOn(f.service, 'validatePublish').mockResolvedValue({ valid: true });

    await f.service.updateProduct('product-1', { status: 'ACTIVE' }, undefined, actor);

    expect(f.outbox.publish).toHaveBeenCalledOnce();
    expect(f.audit.record).toHaveBeenCalledTimes(2);
    expect(f.contexts.some((context) => context['actorKind'] === 'user' && context['actorId'] === actor.sub)).toBe(true);
  });

  it('fails closed before database access when the caller actor is missing', async () => {
    const f = buildService();

    await expect(
      f.service.updateProduct('product-1', { title: 'Updated title' }, undefined, undefined as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(f.withActorContext).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
});
