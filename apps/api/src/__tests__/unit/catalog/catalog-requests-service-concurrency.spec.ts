import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { CatalogRequestsService } from '../../../modules/catalog/catalog.requests.service';

function makeHarness(request: Record<string, unknown>) {
  const predicates: unknown[] = [];
  let lockMode: string | undefined;
  const limit = vi.fn(async () => [request]);
  const forLock = vi.fn((mode: string) => {
    lockMode = mode;
    return { limit };
  });
  const whereSelect = vi.fn((predicate: unknown) => {
    predicates.push(predicate);
    return { for: forLock };
  });
  const from = vi.fn(() => ({ where: whereSelect }));
  const select = vi.fn(() => ({ from }));

  const updatePredicate: unknown[] = [];
  const returning = vi.fn(async () => [{ id: request['id'] }]);
  const whereUpdate = vi.fn((predicate: unknown) => {
    updatePredicate.push(predicate);
    return { returning };
  });
  const set = vi.fn(() => ({ where: whereUpdate }));
  const update = vi.fn(() => ({ set }));

  const db = {
    currentActorContext: { actorKind: 'user', actorId: 'admin-1', actorRole: 'ADMIN', activeOrgId: null },
    db: { select, update },
  };
  const catalogService = {
    createCategory: vi.fn().mockResolvedValue({ id: 'created-category' }),
    createBrand: vi.fn(),
  };
  const taxonomyService = {
    createAttribute: vi.fn(),
    addOption: vi.fn(),
  };
  const service = new CatalogRequestsService(
    db as any,
    catalogService as any,
    taxonomyService as any,
  );

  return {
    service,
    predicates,
    updatePredicate,
    lockMode: () => lockMode,
    limit,
    forLock,
    update,
    returning,
    catalogService,
  };
}

describe('CatalogRequestsService — serialized review transitions (G-002)', () => {
  it('locks a pending request before creating its entity and conditionally marks it approved', async () => {
    const request = {
      id: 'request-1',
      storeId: 'store-1',
      type: 'CATEGORY',
      status: 'PENDING',
      payload: { name: 'Hardware' },
    };
    const h = makeHarness(request);

    const result = await h.service.approveRequest('request-1', 'admin-1');

    expect(h.lockMode()).toBe('update');
    expect(h.forLock).toHaveBeenCalledOnce();
    expect(h.limit).toHaveBeenCalledWith(1);
    expect(h.catalogService.createCategory).toHaveBeenCalledOnce();
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.returning).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'request-1',
      status: 'APPROVED',
      reviewedBy: 'admin-1',
      createdEntityId: 'created-category',
    });

    const compiled = new PgDialect().sqlToQuery(h.updatePredicate[0] as SQL);
    expect(compiled.params).toContain('request-1');
    expect(compiled.params).toContain('PENDING');
  });

  it('locks a pending request and uses a pending-only predicate for rejection', async () => {
    const request = {
      id: 'request-2',
      storeId: 'store-1',
      type: 'CATEGORY',
      status: 'PENDING',
      payload: { name: 'Hardware' },
    };
    const h = makeHarness(request);

    const result = await h.service.rejectRequest('request-2', 'admin-2', 'Insufficient evidence');

    expect(h.lockMode()).toBe('update');
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.returning).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'request-2',
      status: 'REJECTED',
      reviewedBy: 'admin-2',
      reviewReason: 'Insufficient evidence',
    });

    const compiled = new PgDialect().sqlToQuery(h.updatePredicate[0] as SQL);
    expect(compiled.params).toContain('request-2');
    expect(compiled.params).toContain('PENDING');
  });

  it('does not create an entity if the request is no longer pending', async () => {
    const h = makeHarness({
      id: 'request-3',
      storeId: 'store-1',
      type: 'CATEGORY',
      status: 'APPROVED',
      payload: { name: 'Already reviewed' },
    });

    await expect(h.service.approveRequest('request-3', 'admin-1')).rejects.toThrow(
      'Request is not pending',
    );
    expect(h.catalogService.createCategory).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
