import { describe, it, expect, vi } from 'vitest';
import { MerchantService } from '../../../modules/merchant/merchant.service';
import { products } from '../../../modules/catalog/catalog.schema';
import { stores, verificationRequests } from '../../../modules/merchant/merchant.schema';
import { organizations } from '../../../modules/identity/identity.schema';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * A4-8 — merchant customers endpoint returns snake_case rows from raw SQL,
 * but both clients (web and mobile) parse camelCase keys. The service must
 * map the response so the contract is stable.
 */

function createMocks() {
  const execute = vi.fn();
  const db = {
    db: {
      execute,
      query: {
        stores: {
          findMany: vi.fn(),
        },
      },
    },
  };
  const outbox = { publish: vi.fn() };
  const storage = {
    createPresignedGetUrl: vi.fn(),
    createPresignedPutUrl: vi.fn(),
    putObject: vi.fn(),
    getObject: vi.fn(),
    deleteObject: vi.fn(),
    exists: vi.fn(),
  };

  return { db, outbox, storage, execute };
}

describe('MerchantService.reviewVerification', () => {
  function setup(status = 'SUBMITTED', missing?: 'request' | 'store', mismatch = false) {
    const request = { id: 'request', storeId: 'store', orgId: 'org', status };
    const lock = vi.fn().mockResolvedValueOnce(missing === 'request' ? [] : [request])
      .mockResolvedValueOnce(missing === 'store' ? [] : [{ id: 'store', orgId: mismatch ? 'wrong' : 'org' }]);
    const updates: { table: unknown; values: any; predicate: any }[] = [];
    const insert = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }),
      update: (table: unknown) => ({ set: (values: any) => ({ where: (predicate: any) => {
        updates.push({ table, values, predicate });
        return { returning: async () => table === verificationRequests ? [{ ...request, ...values }] : [{ id: 'product' }] };
      } }) }),
      insert: () => ({ values: insert }),
    };
    const transaction = vi.fn(async (callback: any) => callback(tx));
    const outbox = { publish: vi.fn() };
    const service = new MerchantService({ db: { transaction } } as any, outbox as any, {} as any);
    return { service, updates, insert, transaction, outbox, lock };
  }
  it('locks request/store, batches scoped activation, and inserts transactional outbox', async () => {
    const test = setup();
    const result = await test.service.reviewVerification('request', 'reviewer', 'APPROVED', 'Reviewed');
    expect(test.lock.mock.calls).toEqual([['update'], ['update']]);
    expect(result.autoActivatedProductCount).toBe(1);
    const productUpdate = test.updates.find(update => update.table === products)!;
    expect(productUpdate.values).toMatchObject({ status: 'ACTIVE', isAvailable: true, updatedAt: result.reviewedAt });
    const query = new PgDialect().sqlToQuery(productUpdate.predicate);
    expect(query.params).toContain('store');
    expect(query.params).toContain('DRAFT');
    expect(query.sql).toContain('"products"."deleted_at" is null');
    expect(query.sql).toContain('count(distinct ref)');
    expect(test.updates.find(update => update.table === stores)?.values.updatedAt).toBe(result.reviewedAt);
    expect(test.updates.some(update => update.table === organizations)).toBe(true);
    expect(test.insert).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ autoActivatedProductCount: 1 }) }));
    expect(test.outbox.publish).not.toHaveBeenCalled();
  });
  it.each(['REJECTED', 'REVISION'] as const)('%s does not activate products', async decision => {
    const test = setup();
    const result = await test.service.reviewVerification('request', 'reviewer', decision);
    expect(result.autoActivatedProductCount).toBe(0);
    expect(test.updates.some(update => update.table === products)).toBe(false);
    expect(result.resolvedAt === null).toBe(decision === 'REVISION');
  });
  it.each(['APPROVED', 'REJECTED'])('refuses already %s requests', async status => {
    const test = setup(status);
    await expect(test.service.reviewVerification('request', 'reviewer', 'APPROVED')).rejects.toThrow('already resolved');
    expect(test.updates).toHaveLength(0);
  });
  it.each(['request', 'store'] as const)('rejects missing %s without writes', async missing => {
    const test = setup('SUBMITTED', missing);
    await expect(test.service.reviewVerification('request', 'reviewer', 'APPROVED')).rejects.toThrow('not found');
    expect(test.updates).toHaveLength(0);
  });
  it('rejects organization mismatch', async () => {
    const test = setup('SUBMITTED', undefined, true);
    await expect(test.service.reviewVerification('request', 'reviewer', 'APPROVED')).rejects.toThrow('does not match');
    expect(test.updates).toHaveLength(0);
  });
  it('validates decisions and bounded notes before opening a transaction', async () => {
    const test = setup();
    await expect(test.service.reviewVerification('request', 'reviewer', 'INVALID' as any)).rejects.toThrow();
    await expect(test.service.reviewVerification('request', 'reviewer', 'APPROVED', 'x'.repeat(5001))).rejects.toThrow();
    await expect(test.service.reviewVerification('request', 'reviewer', 'REJECTED', undefined, ['x'.repeat(501)])).rejects.toThrow();
    expect(test.transaction).not.toHaveBeenCalled();
  });
  it('propagates an outbox failure to the transaction', async () => {
    const test = setup();
    test.insert.mockRejectedValue(new Error('outbox unavailable'));
    await expect(test.service.reviewVerification('request', 'reviewer', 'APPROVED')).rejects.toThrow('outbox unavailable');
  });
});

describe('MerchantService.getCustomersByOrg', () => {
  it('returns an empty array when the org has no stores', async () => {
    const mocks = createMocks();
    mocks.db.db.query.stores.findMany.mockResolvedValue([]);
    const service = new MerchantService(mocks.db as any, mocks.outbox as any, mocks.storage as any);

    const result = await service.getCustomersByOrg('org-1');

    expect(result).toEqual([]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('maps snake_case SQL columns to camelCase with numeric conversion', async () => {
    const mocks = createMocks();
    mocks.db.db.query.stores.findMany.mockResolvedValue([
      { id: 'store-1' },
      { id: 'store-2' },
    ]);
    // Postgres returns numeric aggregates as strings; the service must convert.
    // First call: main customer list. Second call: per-currency breakdown.
    mocks.execute
      .mockResolvedValueOnce([
        {
          buyer_id: 'buyer-1',
          buyer_name: 'Alice',
          buyer_phone: '+1234567890',
          buyer_email: 'alice@example.com',
          order_count: '5',
          total_spent_minor: '12500',
          last_order_at: '2026-09-01T10:00:00Z',
        },
        {
          buyer_id: 'buyer-2',
          buyer_name: 'Bob',
          buyer_phone: null,
          buyer_email: 'bob@example.com',
          order_count: '3',
          total_spent_minor: '7500',
          last_order_at: '2026-08-15T14:30:00Z',
        },
      ])
      .mockResolvedValueOnce([
        { buyer_id: 'buyer-1', currency: 'SAR', total_minor: '10000' },
        { buyer_id: 'buyer-1', currency: 'AED', total_minor: '2500' },
        { buyer_id: 'buyer-2', currency: 'SAR', total_minor: '7500' },
      ]);
    const service = new MerchantService(mocks.db as any, mocks.outbox as any, mocks.storage as any);

    const result = await service.getCustomersByOrg('org-1');

    expect(result).toEqual([
      {
        buyerId: 'buyer-1',
        buyerName: 'Alice',
        buyerPhone: '+1234567890',
        buyerEmail: 'alice@example.com',
        orderCount: 5,
        totalSpentMinor: 12500,
        spentByCurrency: [
          { currency: 'SAR', totalMinor: 10000 },
          { currency: 'AED', totalMinor: 2500 },
        ],
        lastOrderAt: '2026-09-01T10:00:00Z',
      },
      {
        buyerId: 'buyer-2',
        buyerName: 'Bob',
        buyerPhone: null,
        buyerEmail: 'bob@example.com',
        orderCount: 3,
        totalSpentMinor: 7500,
        spentByCurrency: [{ currency: 'SAR', totalMinor: 7500 }],
        lastOrderAt: '2026-08-15T14:30:00Z',
      },
    ]);
  });

  it('handles null aggregate values gracefully', async () => {
    const mocks = createMocks();
    mocks.db.db.query.stores.findMany.mockResolvedValue([{ id: 'store-1' }]);
    // A buyer with no completed orders would have null aggregates; the mapping
    // must not throw.
    mocks.execute
      .mockResolvedValueOnce([
        {
          buyer_id: 'buyer-1',
          buyer_name: 'Alice',
          buyer_phone: null,
          buyer_email: null,
          order_count: '0',
          total_spent_minor: null,
          last_order_at: null,
        },
      ])
      .mockResolvedValueOnce([]); // No currency breakdown for a buyer with no orders.
    const service = new MerchantService(mocks.db as any, mocks.outbox as any, mocks.storage as any);

    const result = await service.getCustomersByOrg('org-1');

    expect(result).toEqual([
      {
        buyerId: 'buyer-1',
        buyerName: 'Alice',
        buyerPhone: null,
        buyerEmail: null,
        orderCount: 0,
        totalSpentMinor: 0,
        spentByCurrency: [],
        lastOrderAt: null,
      },
    ]);
  });
});
