import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

const actor = { sub: 'merchant-user', role: 'MERCHANT_OWNER', activeOrg: 'org-1' };
const job = {
  id: 'import-1',
  storeId: 'store-1',
  status: 'READY',
  fileType: 'CSV',
  startedAt: null,
  columnMapping: { name: 'name', sku: 'sku', priceMinor: 'price' },
  errorLog: [{ rowNumber: 2, field: 'sku', errorCode: 'INVALID', severity: 'ERROR', message: 'Bad SKU' }],
};

function buildService() {
  let activeActor: Record<string, unknown> | null = null;
  const contexts: Record<string, unknown>[] = [];
  const returning = vi.fn().mockResolvedValue([{ id: job.id }]);
  const where = vi.fn(() => {
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
  const redisDel = vi.fn(async () => {
    expect(activeActor).toBeNull();
  });
  const db = {
    get currentActorContext() {
      return activeActor;
    },
    withActorContext,
    db: { update },
  };
  const service = new CatalogService(
    db as any,
    { client: { del: redisDel } } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const getImportJob = vi.spyOn(service, 'getImportJob').mockImplementation(async () => {
    expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
    return { ...job } as any;
  });
  const resolveJobRows = vi.spyOn(service as any, 'resolveJobRows').mockImplementation(async () => {
    expect(activeActor).toBeNull();
    return [{ name: 'Example product', sku: 'SKU-1', price: '100' }];
  });
  const getOrCreateDefaultPriceList = vi.spyOn(service as any, 'getOrCreateDefaultPriceList').mockImplementation(async () => {
    expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
    return 'price-list-1';
  });
  const createChunks = vi.spyOn(service as any, 'createChunks').mockImplementation(async () => {
    expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
  });
  const getChunks = vi.spyOn(service, 'getChunks').mockImplementation(async () => {
    expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
    return [];
  });
  const processChunk = vi.spyOn(service as any, 'processChunk');

  return {
    service,
    contexts,
    withActorContext,
    getImportJob,
    resolveJobRows,
    getOrCreateDefaultPriceList,
    createChunks,
    getChunks,
    processChunk,
    redisDel,
    update,
  };
}

describe('CatalogService import processing actor boundaries (G-002)', () => {
  it('scopes each DB phase and keeps row-source/Redis work outside actor transactions', async () => {
    const f = buildService();

    await f.service.processImportJob('import-1', actor);

    expect(f.withActorContext).toHaveBeenCalledTimes(8);
    expect(f.contexts.every((context) => context.actorKind === 'user' && context.actorId === actor.sub)).toBe(true);
    expect(f.getImportJob).toHaveBeenCalledTimes(2);
    expect(f.resolveJobRows).toHaveBeenCalledOnce();
    expect(f.getOrCreateDefaultPriceList).toHaveBeenCalledOnce();
    expect(f.createChunks).toHaveBeenCalledOnce();
    expect(f.getChunks).toHaveBeenCalledTimes(2);
    expect(f.processChunk).not.toHaveBeenCalled();
    expect(f.redisDel).toHaveBeenCalledOnce();
    expect(f.update).toHaveBeenCalledTimes(2);
  });

  it('requires a verified caller before reading or changing an import job', async () => {
    const f = buildService();

    await expect(
      f.service.processImportJob('import-1', undefined as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(f.withActorContext).not.toHaveBeenCalled();
    expect(f.getImportJob).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it('reads persisted preview and chunk errors in one short actor scope, then serializes CSV outside it', async () => {
    const f = buildService();
    vi.spyOn(f.service, 'getImportJob').mockImplementation(async () => {
      expect(f.withActorContext).toHaveBeenCalledOnce();
      return { ...job } as any;
    });
    vi.spyOn(f.service, 'getChunks').mockImplementation(async () => {
      expect(f.withActorContext).toHaveBeenCalledOnce();
      return [{
        errorLog: [{ row: 3, field: 'price', message: 'Invalid price' }],
      }] as any;
    });

    const csv = await f.service.getErrorReport('import-1', actor);

    expect(f.withActorContext).toHaveBeenCalledOnce();
    expect(csv).toContain('row_number,field,error_code,severity,message,suggested_fix');
    expect(csv).toContain('2,sku,INVALID,ERROR,Bad SKU,');
    expect(csv).toContain('3,price,PROCESSING_ERROR,ERROR,Invalid price,');
  });
});
